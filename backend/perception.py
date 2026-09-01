from typing import Any

import store
from classifier import classify_attributes
from clients import RateLimitedError, get_engine_client
from db import get_supabase


async def run_perception_fetch(project_id: str) -> dict[str, Any]:
    """Runs every active 'perception'-type prompt against every engine and
    extracts brand-attribute associations. Perception prompts are low
    volume (a handful, added occasionally) — a plain await loop is enough,
    no need for the Celery batch-tracking machinery the citation flow uses.

    Returns {processed, skipped} rather than a bare count — the two silent
    `continue`s below (rate limit, non-success fetch) used to make a Gemini
    quota exhaustion or a dead engine key indistinguishable from "nothing to
    do"; a caller reading only `processed=0` couldn't tell which happened."""
    sb = get_supabase()

    prompts = (
        sb.table("prompts")
        .select("id, project_id, query_text, country")
        .eq("project_id", project_id)
        .eq("active", True)
        .eq("prompt_type", "perception")
        .execute()
        .data
    )
    if not prompts:
        return {"processed": 0, "skipped": [], "message": "no active perception prompts"}

    tracked = (
        sb.table("tracked_urls")
        .select("id, name")
        .eq("project_id", project_id)
        .execute()
        .data
    )
    if not tracked:
        return {"processed": 0, "skipped": [], "message": "no tracked brands"}

    brand_names = [t["name"] for t in tracked]
    name_to_id = {t["name"]: t["id"] for t in tracked}
    engines = sb.table("engines").select("id, name").execute().data

    processed = 0
    skipped: list[dict[str, str]] = []
    for prompt in prompts:
        # Same resolution order as the citation flow — a perception prompt is
        # market-specific too ("what is Bajaj known for?" reads differently
        # in India than in the US).
        country = store.resolve_country(prompt)
        for engine in engines:
            client = get_engine_client(engine["name"])
            try:
                result = await client.fetch(prompt["query_text"], country)
            except RateLimitedError:
                skipped.append(
                    {"prompt": prompt["query_text"], "engine": engine["name"], "reason": "rate limited"}
                )
                continue  # next manual run will retry
            if result.status != "success":
                skipped.append(
                    {
                        "prompt": prompt["query_text"],
                        "engine": engine["name"],
                        "reason": result.message or result.status,
                    }
                )
                continue

            raw_response_id = (
                sb.table("raw_responses")
                .insert(
                    {
                        "prompt_id": prompt["id"],
                        "engine_id": engine["id"],
                        "country": country,
                        "raw_response": result.raw_json,
                        "answer_text": result.answer_text,
                        "brand_mentioned_in_answer": False,
                    }
                )
                .execute()
                .data[0]["id"]
            )

            attributes_by_brand = await classify_attributes(
                prompt["query_text"], result.answer_text, brand_names
            )
            rows = [
                {"raw_response_id": raw_response_id, "tracked_url_id": name_to_id[brand], "attribute": attr}
                for brand, attrs in attributes_by_brand.items()
                if brand in name_to_id
                for attr in attrs
            ]
            if rows:
                sb.table("brand_attributes").insert(rows).execute()

            processed += 1

    message = None
    if skipped and not processed:
        message = f"Every fetch was skipped ({skipped[0]['reason']}) — nothing was processed."
    elif skipped:
        message = f"{len(skipped)} fetch(es) skipped; see `skipped` for why."
    return {"processed": processed, "skipped": skipped, "message": message}
