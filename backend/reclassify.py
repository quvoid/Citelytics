"""Re-score already-fetched answers against the CURRENT tracked-brand list.

This exists because every answer's full text is stored in
`raw_responses.answer_text`. That makes re-classification a purely offline
operation. Since round 4 (local sentiment, see classifier.py/local_sentiment.py)
it costs nothing but CPU time — no API call, no quota, no per-day budget.

Three jobs, one implementation:

  1. **Per-brand sentiment backfill.** `answer_brand_mentions.sentiment_score`
     was added in migration 0010; every row written before it is null. Rows
     scored under an older CLASSIFIER_VERSION (the Gemini-based classifier
     that preceded the local model) are also missing a real score. This
     fills both.
  2. **Newly-tracked competitors.** Add a competitor today and it has zero
     mention rows across all prior history, while the visibility denominator
     still covers that history — so it renders 0% forever and looks like real
     data rather than absent data. Re-running this gives it real history.
  3. **Classifier upgrades.** When the prompt or schema changes,
     CLASSIFIER_VERSION bumps and this re-scores the corpus so the series is
     comparable end to end.

Idempotent: upserts on (raw_response_id, tracked_url_id), so re-running is
always safe and never duplicates a row.

No daily budget or rate limiting here anymore — that machinery existed only
because the old Gemini-based classifier shared a ~20/day free-tier quota with
the live fetch pipeline. classify_answer is 100% local now (no network call
of any kind), so a full backfill runs to completion in one pass, gated only
by `limit` if a caller wants to cap it for some other reason (e.g. testing).
"""

import asyncio
from typing import Any

import store
from classifier import CLASSIFIER_VERSION, classify_answer
from db import get_supabase


def _load_responses(project_id: str, only_missing: bool) -> list[dict[str, Any]]:
    """Every usable stored answer for a project, newest first.

    `only_missing` restricts to answers whose mention rows were scored by an
    older classifier (or not at all) — the normal mode, since re-scoring
    already-current rows is wasted work even without a quota to worry about."""
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

    batch = pending if limit is None else pending[:limit]

    mention_rows: list[dict[str, Any]] = []
    processed = 0
    soft_failures = 0

    for row in batch:
        try:
            classification = await classify_answer(
                query_text=row["query_text"],
                answer_text=row["answer_text"],
                brand_names=names,
                own_brand_name=own_name,
                known_topics=known_topics,
                aliases=aliases,
            )
        except Exception:  # noqa: BLE001 — one bad row (e.g. a local-model
            # inference hiccup) must never abort the whole backfill; skip it
            # and let a later re-run (only_missing=True) retry it.
            soft_failures += 1
            continue

        if classification is None:
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

    remaining = len(pending) - processed - soft_failures

    if remaining > 0:
        message = (
            f"Scored {processed} answer(s) within this run's limit of {limit}; "
            f"{remaining} remaining — run again (or omit `limit`) to finish."
        )
    else:
        message = f"Complete — all {processed} answer(s) scored."

    if soft_failures:
        message += f" ({soft_failures} answer(s) failed and will be retried on the next run.)"

    return {
        "processed": processed,
        "failed": soft_failures,
        "rows_written": written,
        "remaining": max(remaining, 0),
        "message": message,
    }


def reclassify_project(
    project_id: str, only_missing: bool = True, limit: int | None = None
) -> dict[str, Any]:
    """Synchronous entrypoint for the FastAPI route and the Celery job.

    `only_missing` defaults to True: the normal mode is filling in what's
    missing (new competitor, older CLASSIFIER_VERSION), not re-scoring
    everything already current. Pass False to force a full re-score after a
    CLASSIFIER_VERSION bump. `limit` is optional now (no quota to budget
    against) — omit it to run the whole project's backlog in one call."""
    return asyncio.run(_run(project_id, only_missing, limit))


def reclassify_all_projects() -> dict[str, Any]:
    """Celery Beat entrypoint. Walks every project, backfilling whatever
    each one is missing. No cross-project budget anymore — each project's
    backlog runs to completion."""
    out: dict[str, Any] = {}
    for project_id in store.list_project_ids():
        out[project_id] = reclassify_project(project_id, only_missing=True)
    return out
