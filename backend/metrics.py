from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from db import get_supabase


def _rollup(raw_rows: list[dict[str, Any]], mentions_by_raw_id: dict[str, list[dict]], own_id: str | None) -> dict[str, Any]:
    """Turns one slice of today's answers into the four KPI numbers. Split out
    so the all-markets row and each per-market row go through identical
    arithmetic rather than two near-copies that can drift."""
    total = len(raw_rows)
    mentioned = sum(1 for r in raw_rows if r["brand_mentioned_in_answer"])
    sentiments = [r["brand_sentiment_score"] for r in raw_rows if r["brand_sentiment_score"] is not None]
    positions = [r["brand_position"] for r in raw_rows if r["brand_position"] is not None]

    slice_mentions = [m for r in raw_rows for m in mentions_by_raw_id.get(r["id"], [])]
    sov_pct = None
    if slice_mentions and own_id:
        own_count = sum(1 for m in slice_mentions if m["tracked_url_id"] == own_id)
        sov_pct = round(100 * own_count / len(slice_mentions), 1)

    return {
        "visibility_pct": round(100 * mentioned / total, 1) if total else None,
        "sov_pct": sov_pct,
        "avg_sentiment": round(sum(sentiments) / len(sentiments), 1) if sentiments else None,
        "avg_position": round(sum(positions) / len(positions), 2) if positions else None,
    }


def refresh_daily_metrics(project_id: str) -> None:
    """Recomputes today's (UTC) rollup for a project and upserts it into
    daily_metrics. Called at the end of every fetch task — idempotent and
    cheap at this scale, so simplest to just always recompute rather than
    incrementally maintain a running total.

    Writes one row per market plus an all-markets row (country = ''), so the
    Overview trend can stay blended by default while a market filter reads
    the same table without recomputing anything."""
    sb = get_supabase()
    today = datetime.now(timezone.utc).date().isoformat()
    day_start = f"{today}T00:00:00+00:00"
    day_end = f"{today}T23:59:59.999999+00:00"

    prompt_ids = [
        row["id"]
        for row in sb.table("prompts").select("id").eq("project_id", project_id).execute().data
    ]
    if not prompt_ids:
        return

    raw_today = (
        sb.table("raw_responses")
        .select("id, country, brand_mentioned_in_answer, brand_sentiment_score, brand_position")
        .in_("prompt_id", prompt_ids)
        .gte("fetched_at", day_start)
        .lte("fetched_at", day_end)
        .execute()
        .data
    )
    if not raw_today:
        return

    raw_ids = [r["id"] for r in raw_today]
    mentions_by_raw_id: dict[str, list[dict]] = defaultdict(list)
    for m in (
        sb.table("answer_brand_mentions")
        .select("raw_response_id, tracked_url_id, mentioned")
        .in_("raw_response_id", raw_ids)
        .eq("mentioned", True)
        .execute()
        .data
    ):
        mentions_by_raw_id[m["raw_response_id"]].append(m)

    own = (
        sb.table("tracked_urls")
        .select("id")
        .eq("project_id", project_id)
        .eq("is_competitor", False)
        .limit(1)
        .execute()
        .data
    )
    own_id = own[0]["id"] if own else None

    by_country: dict[str, list[dict]] = defaultdict(list)
    for r in raw_today:
        if r.get("country"):
            by_country[r["country"]].append(r)

    # '' first: the blended all-markets row every existing trend read expects.
    rows = [{"project_id": project_id, "date": today, "country": "", **_rollup(raw_today, mentions_by_raw_id, own_id)}]
    rows += [
        {"project_id": project_id, "date": today, "country": country, **_rollup(slice_rows, mentions_by_raw_id, own_id)}
        for country, slice_rows in by_country.items()
    ]

    sb.table("daily_metrics").upsert(rows, on_conflict="project_id,date,country").execute()
