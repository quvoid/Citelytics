import asyncio
from functools import lru_cache

from celery.exceptions import MaxRetriesExceededError

from brand_check import text_mentions_brand
from celery_app import celery_app
from classifier import classify_answer
from clients import get_engine_client
from clients.gemini_client import RateLimitedError
from db import get_supabase
from metrics import refresh_daily_metrics
from normalizer import enrich_citations, ensure_domain_types


@lru_cache
def _engine_ids() -> dict[str, str]:
    sb = get_supabase()
    resp = sb.table("engines").select("id, name").execute()
    return {row["name"]: row["id"] for row in resp.data}


def _update_task_status(
    batch_task_id: str, status: str, message: str | None = None, citation_count: int = 0
) -> None:
    sb = get_supabase()
    sb.table("fetch_batch_tasks").update(
        {"status": status, "message": message, "citation_count": citation_count}
    ).eq("id", batch_task_id).execute()


async def _run_fetch(prompt: dict, engine_name: str, tracked: list[dict]) -> dict:
    """The async body of the task: call the engine, classify the answer,
    enrich citations, and return everything ready for a single batch of
    Supabase writes. Kept separate from the Celery task so it's one
    asyncio.run() call, not several."""
    client = get_engine_client(engine_name)
    result = await client.fetch(prompt["query_text"])

    if result.status != "success":
        return {"status": result.status, "message": result.message}

    own = next((t for t in tracked if not t["is_competitor"]), None)
    brand_names = [t["name"] for t in tracked]

    classification = await classify_answer(
        query_text=prompt["query_text"],
        answer_text=result.answer_text,
        brand_names=brand_names,
        own_brand_name=own["name"] if own else "",
    )
    if classification is None:
        # Classifier call failed (e.g. rate limited — it shares Gemini's
        # quota with the grounding engine call). Fall back to a plain text
        # match so brand_mentioned_in_answer is never wrong just because
        # the richer classification couldn't run; sentiment/position/topic
        # are left unset rather than guessed.
        mentioned = own is not None and text_mentions_brand(result.answer_text)
        classification = {
            "mentioned_brands": [own["name"]] if mentioned else [],
            "own_brand_sentiment": None,
            "topic": None,
            "intent": None,
            "is_branded_query": False,
        }

    citation_rows = await enrich_citations(result.citations)

    domains = {c.domain for c in result.citations if not c.is_simulated}
    await ensure_domain_types(domains)

    return {
        "status": "success",
        "result": result,
        "classification": classification,
        "citation_rows": citation_rows,
        "own_tracked_url_id": own["id"] if own else None,
        "tracked": tracked,
    }


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def fetch_citations_task(self, batch_task_id: str, prompt_id: str, engine_name: str) -> None:
    """One Celery task per (prompt, engine) pair — a failure or rate limit on
    one prompt/engine never blocks the others in the same batch."""
    sb = get_supabase()

    try:
        prompt = sb.table("prompts").select("id, project_id, query_text, topic").eq("id", prompt_id).single().execute().data
        tracked = (
            sb.table("tracked_urls")
            .select("id, name, url, is_competitor")
            .eq("project_id", prompt["project_id"])
            .execute()
            .data
        )

        outcome = asyncio.run(_run_fetch(prompt, engine_name, tracked))

        if outcome["status"] != "success":
            _update_task_status(batch_task_id, outcome["status"], message=outcome.get("message"))
            return

        result = outcome["result"]
        classification = outcome["classification"]
        citation_rows = outcome["citation_rows"]
        engine_id = _engine_ids()[engine_name]

        mentioned_brands: list[str] = classification["mentioned_brands"]
        own = next((t for t in tracked if not t["is_competitor"]), None)
        own_mentioned = bool(own and own["name"] in mentioned_brands)
        own_position = (mentioned_brands.index(own["name"]) + 1) if own_mentioned else None

        raw_insert = (
            sb.table("raw_responses")
            .insert(
                {
                    "prompt_id": prompt_id,
                    "engine_id": engine_id,
                    "raw_response": result.raw_json,
                    "answer_text": result.answer_text,
                    "brand_mentioned_in_answer": own_mentioned,
                    "brand_sentiment_score": classification["own_brand_sentiment"],
                    "brand_position": own_position,
                }
            )
            .execute()
        )
        raw_response_id = raw_insert.data[0]["id"]

        if citation_rows:
            sb.table("citations").insert(
                [
                    {
                        "prompt_id": prompt_id,
                        "engine_id": engine_id,
                        "raw_response_id": raw_response_id,
                        **row,
                    }
                    for row in citation_rows
                ]
            ).execute()

        if tracked:
            sb.table("answer_brand_mentions").insert(
                [
                    {
                        "raw_response_id": raw_response_id,
                        "tracked_url_id": t["id"],
                        "mentioned": t["name"] in mentioned_brands,
                        "position": (mentioned_brands.index(t["name"]) + 1)
                        if t["name"] in mentioned_brands
                        else None,
                    }
                    for t in tracked
                ]
            ).execute()

        if result.web_search_queries:
            sb.table("query_fanouts").insert(
                [{"raw_response_id": raw_response_id, "query_text": q} for q in result.web_search_queries]
            ).execute()

        if not prompt.get("topic") and classification.get("topic"):
            sb.table("prompts").update(
                {
                    "topic": classification["topic"],
                    "intent": classification["intent"],
                    "is_branded": classification["is_branded_query"],
                }
            ).eq("id", prompt_id).execute()

        _update_task_status(batch_task_id, "success", citation_count=len(citation_rows))

        try:
            refresh_daily_metrics(prompt["project_id"])
        except Exception:
            pass  # trend rollup is best-effort — never fail the task over it

    except RateLimitedError as exc:
        _update_task_status(batch_task_id, "rate_limited", message=str(exc))
        try:
            raise self.retry(exc=exc, countdown=60 * (2**self.request.retries))
        except MaxRetriesExceededError:
            return  # already recorded as rate_limited above

    except Exception as exc:  # noqa: BLE001 — surface any failure as a queryable status, never swallow it
        _update_task_status(batch_task_id, "error", message=str(exc))


def create_fetch_batch(project_id: str) -> tuple[str, int]:
    """Fans out one fetch_citations_task per active prompt x configured
    engine for a project. Called synchronously from the FastAPI trigger
    endpoint (so it can return a batch_id immediately) and from the Celery
    Beat periodic task. Returns (batch_id, tasks_enqueued)."""
    sb = get_supabase()

    prompts_resp = (
        sb.table("prompts")
        .select("id")
        .eq("project_id", project_id)
        .eq("active", True)
        .eq("prompt_type", "citation")
        .execute()
    )
    prompt_ids = [row["id"] for row in prompts_resp.data]
    if not prompt_ids:
        raise ValueError("No active prompts found for this project.")

    engine_names = list(_engine_ids().keys())

    batch_resp = sb.table("fetch_batches").insert({"project_id": project_id}).execute()
    batch_id = batch_resp.data[0]["id"]

    batch_task_rows = [
        {"batch_id": batch_id, "prompt_id": prompt_id, "engine_id": _engine_ids()[engine_name], "status": "pending"}
        for prompt_id in prompt_ids
        for engine_name in engine_names
    ]
    inserted = sb.table("fetch_batch_tasks").insert(batch_task_rows).execute().data

    for row, (prompt_id, engine_name) in zip(
        inserted,
        [(p, e) for p in prompt_ids for e in engine_names],
    ):
        fetch_citations_task.delay(row["id"], prompt_id, engine_name)

    return batch_id, len(inserted)


@celery_app.task
def enqueue_all_projects_fetch() -> None:
    """Fired by Celery Beat on the schedule in celery_beat_schedule.py —
    fans out a fetch batch for every project automatically, no manual
    trigger needed."""
    sb = get_supabase()
    projects = sb.table("projects").select("id").execute().data
    for project in projects:
        try:
            create_fetch_batch(project["id"])
        except ValueError:
            continue  # project has no active prompts — nothing to fetch
