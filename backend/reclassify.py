"""Re-score already-fetched answers against the CURRENT tracked-brand list.

This exists because every answer's full text is stored in
`raw_responses.answer_text`. That makes re-classification a purely offline
operation: no engine call, no grounding quota, no cost beyond a cheap Gemini
Flash structured-output call per answer. It is the only way to get history for
something you decided to measure after the fact.

Three jobs, one implementation:

  1. **Per-brand sentiment backfill.** `answer_brand_mentions.sentiment_score`
     was added in migration 0010; every row written before it is null. This
     fills them.
  2. **Newly-tracked competitors.** Add a competitor today and it has zero
     mention rows across all prior history, while the visibility denominator
     still covers that history — so it renders 0% forever and looks like real
     data rather than absent data. Re-running this gives it real history.
  3. **Classifier upgrades.** When the prompt or schema changes,
     CLASSIFIER_VERSION bumps and this re-scores the corpus so the series is
     comparable end to end.

Idempotent: upserts on (raw_response_id, tracked_url_id), so re-running is
always safe and never duplicates a row.
"""

import asyncio
import os
from typing import Any

import store
from classifier import CLASSIFIER_VERSION, QuotaExhaustedError, classify_answer
from db import get_supabase

# Gemini's free tier binding limit is per DAY, not per minute: currently 20
# generateContent requests/day/model (quotaId
# GenerateRequestsPerDayPerProjectPerModel-FreeTier). Every older Flash model
# has been retired, so there is no higher-quota free model to fall back to.
#
# That shapes this whole module. The job cannot run to completion in one go —
# it drips, resumably, until the corpus is scored. Two consequences:
#   * a per-run cap, so one run cannot burn the day's allowance and leave
#     nothing for the live fetch pipeline, which shares the same quota;
#   * hard abort on 429 rather than retry, because a DAILY quota cannot
#     recover within a run. The first version retried three times per answer
#     and spent 334 seconds discovering that.
_DAILY_BUDGET = int(os.getenv("GEMINI_CLASSIFY_DAILY_BUDGET", "16"))
_REQUESTS_PER_MINUTE = int(os.getenv("GEMINI_CLASSIFY_RPM", "12"))
_CONCURRENCY = 2


class _RateLimiter:
    """Spaces request STARTS at a fixed interval across all workers.

    Reserving each slot under a lock (rather than sleeping then firing) means
    N concurrent workers can't all wake at the same instant and burst."""

    def __init__(self, per_minute: int) -> None:
        self._interval = 60.0 / max(1, per_minute)
        self._lock = asyncio.Lock()
        self._next = 0.0

    async def acquire(self) -> None:
        loop = asyncio.get_running_loop()
        async with self._lock:
            now = loop.time()
            start = max(now, self._next)
            self._next = start + self._interval
        delay = start - now
        if delay > 0:
            await asyncio.sleep(delay)


def _load_responses(project_id: str, only_missing: bool) -> list[dict[str, Any]]:
    """Every usable stored answer for a project, newest first.

    `only_missing` restricts to answers whose mention rows were scored by an
    older classifier (or not at all), which is what makes a re-run after a
    partial failure cheap."""
    sb = get_supabase()
    prompt_rows = (
        sb.table("prompts").select("id, query_text, project_id").eq("project_id", project_id).execute().data
        or []
    )
    if not prompt_rows:
        return []
    by_id = {p["id"]: p for p in prompt_rows}

    rows = (
        sb.table("raw_responses")
        .select("id, prompt_id, answer_text")
        .in_("prompt_id", list(by_id))
        .order("fetched_at", desc=True)
        .execute()
        .data
        or []
    )
    rows = [r for r in rows if (r.get("answer_text") or "").strip()]

    if only_missing:
        scored = (
            sb.table("answer_brand_mentions")
            .select("raw_response_id")
            .eq("classifier_version", CLASSIFIER_VERSION)
            .in_("raw_response_id", [r["id"] for r in rows])
            .execute()
            .data
            or []
        )
        done = {s["raw_response_id"] for s in scored}
        rows = [r for r in rows if r["id"] not in done]

    for r in rows:
        r["query_text"] = by_id[r["prompt_id"]]["query_text"]
    return rows


async def _run(project_id: str, only_missing: bool, limit: int | None) -> dict[str, Any]:
    tracked = store.get_tracked_urls(project_id)
    if not tracked:
        return {"processed": 0, "failed": 0, "rows_written": 0, "message": "no tracked brands"}

    own = next((t for t in tracked if not t["is_competitor"]), None)
    own_name = own["name"] if own else ""
    known_topics = store.get_topic_names(project_id)
    names = [t["name"] for t in tracked]
    aliases = {t["name"]: t.get("aliases") or [] for t in tracked}

    pending = _load_responses(project_id, only_missing)
    if not pending:
        return {
            "processed": 0,
            "failed": 0,
            "rows_written": 0,
            "remaining": 0,
            "message": "nothing to re-score — every stored answer is current",
        }

    budget = _DAILY_BUDGET if limit is None else limit
    batch = pending[:budget]

    # Sequential on purpose. With a daily budget in the teens there is nothing
    # to parallelise, and a straight loop makes "stop the moment quota runs
    # out" trivial instead of a cancellation dance across gathered tasks.
    limiter = _RateLimiter(_REQUESTS_PER_MINUTE)
    mention_rows: list[dict[str, Any]] = []
    processed = 0
    soft_failures = 0
    quota_hit = False

    for row in batch:
        await limiter.acquire()
        try:
            classification = await classify_answer(
                query_text=row["query_text"],
                answer_text=row["answer_text"],
                brand_names=names,
                own_brand_name=own_name,
                known_topics=known_topics,
                raise_on_quota=True,
                aliases=aliases,
            )
        except QuotaExhaustedError:
            # A DAILY quota cannot recover inside this run. Stop immediately
            # and keep whatever was scored — the first version retried three
            # times per answer and spent 334s learning this the hard way.
            quota_hit = True
            break

        if classification is None:
            # Non-quota failure (malformed output, timeout). Skip rather than
            # write zeros — a failed classification must never be recorded as
            # "this brand was not mentioned". only_missing retries it later.
            soft_failures += 1
            continue

        processed += 1
        mentioned = classification["mentioned_brands"]
        sentiment = classification.get("brand_sentiment") or {}
        for t in tracked:
            named = t["name"] in mentioned
            mention_rows.append(
                {
                    "raw_response_id": row["id"],
                    "tracked_url_id": t["id"],
                    "mentioned": named,
                    "position": (mentioned.index(t["name"]) + 1) if named else None,
                    "sentiment_score": sentiment.get(t["name"]),
                    "classifier_version": CLASSIFIER_VERSION,
                }
            )

    # `considered` is deliberately NOT written here. It is derived from the
    # response's citations at fetch time (store.save_fetch_result), and this
    # job only sees answer text — recomputing it from a partial view would
    # overwrite good data with worse data.
    written = 0
    if mention_rows:
        sb = get_supabase()
        for i in range(0, len(mention_rows), 500):
            chunk = mention_rows[i : i + 500]
            sb.table("answer_brand_mentions").upsert(
                chunk, on_conflict="raw_response_id,tracked_url_id"
            ).execute()
            written += len(chunk)

    remaining = len(pending) - processed

    if quota_hit:
        message = (
            f"Stopped early: Gemini's daily free-tier quota is exhausted. "
            f"Scored {processed} answer(s); {remaining} still to go. "
            f"The quota resets daily — the scheduled job will continue tomorrow."
        )
    elif remaining:
        message = (
            f"Scored {processed} answer(s) within today's budget of {budget}; "
            f"{remaining} remaining. Continues on the next scheduled run."
        )
    else:
        message = f"Complete — all {processed} answer(s) scored."

    if soft_failures:
        message += f" ({soft_failures} answer(s) failed for non-quota reasons and will be retried.)"

    return {
        "processed": processed,
        "failed": soft_failures,
        "rows_written": written,
        "remaining": remaining,
        "message": message,
    }


def reclassify_project(
    project_id: str, only_missing: bool = True, limit: int | None = None
) -> dict[str, Any]:
    """Synchronous entrypoint for the FastAPI route and the Celery job.

    `only_missing` defaults to True: the normal mode is resuming an unfinished
    drip, and re-scoring already-current answers would waste a daily quota
    that only allows ~16 of them. Pass False to force a full re-score after a
    CLASSIFIER_VERSION bump."""
    return asyncio.run(_run(project_id, only_missing, limit))


def reclassify_all_projects() -> dict[str, Any]:
    """Celery Beat entrypoint. Walks every project, spending the daily budget
    across them until Gemini's quota runs out."""
    spent = 0
    out: dict[str, Any] = {}
    for project_id in store.list_project_ids():
        left = _DAILY_BUDGET - spent
        if left <= 0:
            out[project_id] = {"processed": 0, "remaining": None, "message": "daily budget spent"}
            continue
        res = reclassify_project(project_id, only_missing=True, limit=left)
        spent += res.get("processed", 0) + res.get("failed", 0)
        out[project_id] = res
    return out
