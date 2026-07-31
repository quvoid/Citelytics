from datetime import datetime, timezone

from db import get_supabase


def refresh_daily_metrics(project_id: str) -> None:
    """Recomputes today's (UTC) rollup for a project and upserts it into
    daily_metrics. Called at the end of every fetch task — idempotent and
    cheap at this scale, so simplest to just always recompute rather than
    incrementally maintain a running total."""
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
        .select("id, brand_mentioned_in_answer, brand_sentiment_score, brand_position")
        .in_("prompt_id", prompt_ids)
        .gte("fetched_at", day_start)
        .lte("fetched_at", day_end)
        .execute()
        .data
    )
    if not raw_today:
        return

    total = len(raw_today)
    mentioned = sum(1 for r in raw_today if r["brand_mentioned_in_answer"])
    sentiments = [r["brand_sentiment_score"] for r in raw_today if r["brand_sentiment_score"] is not None]
    positions = [r["brand_position"] for r in raw_today if r["brand_position"] is not None]

    visibility_pct = round(100 * mentioned / total, 1) if total else None
    avg_sentiment = round(sum(sentiments) / len(sentiments), 1) if sentiments else None
    avg_position = round(sum(positions) / len(positions), 2) if positions else None

    raw_ids = [r["id"] for r in raw_today]
    mentions_today = (
        sb.table("answer_brand_mentions")
        .select("tracked_url_id, mentioned")
        .in_("raw_response_id", raw_ids)
        .eq("mentioned", True)
        .execute()
        .data
    )
    sov_pct = None
    if mentions_today:
        own = (
            sb.table("tracked_urls")
            .select("id")
            .eq("project_id", project_id)
            .eq("is_competitor", False)
            .limit(1)
            .execute()
            .data
        )
        if own:
            own_id = own[0]["id"]
            own_count = sum(1 for m in mentions_today if m["tracked_url_id"] == own_id)
            sov_pct = round(100 * own_count / len(mentions_today), 1)

    sb.table("daily_metrics").upsert(
        {
            "project_id": project_id,
            "date": today,
            "visibility_pct": visibility_pct,
            "sov_pct": sov_pct,
            "avg_sentiment": avg_sentiment,
            "avg_position": avg_position,
        },
        on_conflict="project_id,date",
    ).execute()
