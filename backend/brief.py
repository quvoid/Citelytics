from datetime import datetime, timezone

from classifier import generate_content_brief
from db import get_supabase


async def analyse_brief(brief_id: str) -> dict:
    """Fills in a pending brief with a structured writing brief from Gemini.
    Kept separate from brief creation so a Gemini rate-limit failure doesn't
    lose the user's typed-in prompt — they can just retry the analysis."""
    sb = get_supabase()
    brief = (
        sb.table("content_briefs")
        .select("id, project_id, prompt_text")
        .eq("id", brief_id)
        .maybe_single()
        .execute()
        .data
    )
    if not brief:
        raise ValueError("Brief not found.")

    own = (
        sb.table("tracked_urls")
        .select("name")
        .eq("project_id", brief["project_id"])
        .eq("is_competitor", False)
        .limit(1)
        .execute()
        .data
    )
    brand_name = own[0]["name"] if own else "the brand"

    result = await generate_content_brief(brief["prompt_text"], brand_name)
    if result is None:
        raise RuntimeError(
            "Gemini brief generation failed (rate limited or unavailable) — try again shortly."
        )

    update = {
        "status": "scored",
        "score": result["score"],
        "tone": result["tone"],
        "content_intent": result["content_intent"],
        "language": result["language"],
        "article_type": result["article_type"],
        "cell_notes": {
            "tone": result["tone_note"],
            "content_intent": result["intent_note"],
            "language": result["language_note"],
            "article_type": result["article_type_note"],
        },
        "main_topic": result["main_topic"],
        "value_proposition": result["value_proposition"],
        "target_audience": result["target_audience"],
        "key_takeaways": result["key_takeaways"],
        "analysed_at": datetime.now(timezone.utc).isoformat(),
    }
    return sb.table("content_briefs").update(update).eq("id", brief_id).execute().data[0]
