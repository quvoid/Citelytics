import asyncio
from typing import Any

from celery.exceptions import MaxRetriesExceededError

import store
from brand_check import brand_keywords_for, text_mentions_brand
from celery_app import celery_app
from classifier import classify_answer
from clients import RateLimitedError, get_engine_client
from clients.base import RawEngineResponse
from metrics import refresh_daily_metrics
from normalizer import enrich_citations, ensure_domain_types


class FetchOutcome:
    """What one (prompt, engine) fetch produced, ready to persist."""

    def __init__(
        self,
        status: str,
        message: str | None = None,
        result: RawEngineResponse | None = None,
        classification: dict[str, Any] | None = None,
        citation_rows: list[dict[str, Any]] | None = None,
    ) -> None:
        self.status = status
        self.message = message
        self.result = result
        self.classification = classification
        self.citation_rows = citation_rows or []


def _fallback_classification(
    answer_text: str | None, own: dict | None, brand_keywords: list[str]
) -> dict[str, Any]:
    """Used when the classifier call itself fails — commonly a rate limit,
    since it shares Gemini's quota with the grounding call. Falls back to a
    plain text match so brand_mentioned_in_answer is never wrong just
    because the richer classification couldn't run; sentiment/position/topic
    are left unset rather than guessed."""
    mentioned = own is not None and text_mentions_brand(answer_text, brand_keywords)
    return {
        "mentioned_brands": [own["name"]] if mentioned and own else [],
        "own_brand_sentiment": None,
        "topic": None,
        "intent": None,
        "is_branded_query": False,
    }


async def _run_fetch(
    prompt: dict, engine_name: str, tracked: list[dict], country: str
) -> FetchOutcome:
    """The async half of the task: call the engine, classify the answer, and
    enrich the citations. Kept separate from the Celery task so the whole
    thing is one asyncio.run() rather than several."""
    result = await get_engine_client(engine_name).fetch(prompt["query_text"], country)
    if result.status != "success":
        return FetchOutcome(status=result.status, message=result.message)

    own = next((t for t in tracked if not t["is_competitor"]), None)
    brand_keywords = brand_keywords_for(own)

    classification = await classify_answer(
        query_text=prompt["query_text"],
        answer_text=result.answer_text,
        brand_names=[t["name"] for t in tracked],
        own_brand_name=own["name"] if own else "",
    )
    if classification is None:
        classification = _fallback_classification(result.answer_text, own, brand_keywords)

    citation_rows = await enrich_citations(result.citations, brand_keywords)
    await ensure_domain_types({c.domain for c in result.citations if not c.is_simulated})

    return FetchOutcome(
        status="success",
        result=result,
        classification=classification,
        citation_rows=citation_rows,
    )


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def fetch_citations_task(self, batch_task_id: str, prompt_id: str, engine_name: str) -> None:
    """One Celery task per (prompt, engine) pair — a failure or rate limit on
    one prompt/engine never blocks the others in the same batch."""
    try:
        prompt = store.get_prompt(prompt_id)
        tracked = store.get_tracked_urls(prompt["project_id"])
        country = store.resolve_country(prompt)

        outcome = asyncio.run(_run_fetch(prompt, engine_name, tracked, country))

        if outcome.status != "success":
            store.update_batch_task_status(batch_task_id, outcome.status, message=outcome.message)
            return

        assert outcome.result is not None and outcome.classification is not None

        store.save_fetch_result(
            prompt_id=prompt_id,
            engine_name=engine_name,
            country=country,
            result=outcome.result,
            classification=outcome.classification,
            citation_rows=outcome.citation_rows,
            tracked=tracked,
        )

        if not prompt.get("topic") and outcome.classification.get("topic"):
            store.set_prompt_classification(prompt_id, outcome.classification)

        store.update_batch_task_status(
            batch_task_id, "success", citation_count=len(outcome.citation_rows)
        )

        try:
            refresh_daily_metrics(prompt["project_id"])
        except Exception:
            pass  # trend rollup is best-effort — never fail the task over it

    except RateLimitedError as exc:
        store.update_batch_task_status(batch_task_id, "rate_limited", message=str(exc))
        try:
            raise self.retry(exc=exc, countdown=60 * (2**self.request.retries))
        except MaxRetriesExceededError:
            return  # already recorded as rate_limited above

    except Exception as exc:  # noqa: BLE001 — surface any failure as a queryable status, never swallow it
        store.update_batch_task_status(batch_task_id, "error", message=str(exc))


def create_fetch_batch(project_id: str) -> tuple[str, int]:
    """Fans out one fetch_citations_task per active prompt x configured
    engine. Called synchronously from the FastAPI trigger endpoint (so it can
    return a batch_id immediately) and from the Celery Beat periodic task.
    Returns (batch_id, tasks_enqueued)."""
    prompt_ids = store.get_active_citation_prompt_ids(project_id)
    if not prompt_ids:
        raise ValueError("No active prompts found for this project.")

    batch_id, task_rows = store.create_batch(
        project_id, prompt_ids, list(store.engine_ids().keys())
    )
    for row in task_rows:
        fetch_citations_task.delay(row["batch_task_id"], row["prompt_id"], row["engine_name"])

    return batch_id, len(task_rows)


@celery_app.task
def enqueue_all_projects_fetch() -> None:
    """Fired by Celery Beat on the schedule in celery_beat_schedule.py —
    fans out a fetch batch for every project automatically, no manual
    trigger needed."""
    for project_id in store.list_project_ids():
        try:
            create_fetch_batch(project_id)
        except ValueError:
            continue  # project has no active prompts — nothing to fetch
