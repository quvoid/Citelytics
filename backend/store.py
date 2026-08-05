"""Persistence for the citation-fetch pipeline.

Keeps raw Supabase table access out of tasks.py so the Celery task reads as
orchestration (call engine -> classify -> persist) rather than a wall of
inserts. Everything here is synchronous — it runs inside the Celery worker,
not the async engine-call path."""

from functools import lru_cache
from typing import Any

from clients.base import RawEngineResponse
from db import get_supabase


@lru_cache
def engine_ids() -> dict[str, str]:
    """Engine name -> id. Cached for the worker's lifetime; the engines table
    only changes when a new engine client is registered and deployed."""
    rows = get_supabase().table("engines").select("id, name").execute().data
    return {row["name"]: row["id"] for row in rows}


def get_prompt(prompt_id: str) -> dict[str, Any]:
    return (
        get_supabase()
        .table("prompts")
        .select("id, project_id, query_text, topic")
        .eq("id", prompt_id)
        .single()
        .execute()
        .data
    )


def get_tracked_urls(project_id: str) -> list[dict[str, Any]]:
    return (
        get_supabase()
        .table("tracked_urls")
        .select("id, name, url, is_competitor")
        .eq("project_id", project_id)
        .execute()
        .data
    )


def get_active_citation_prompt_ids(project_id: str) -> list[str]:
    rows = (
        get_supabase()
        .table("prompts")
        .select("id")
        .eq("project_id", project_id)
        .eq("active", True)
        .eq("prompt_type", "citation")
        .execute()
        .data
    )
    return [row["id"] for row in rows]


def list_project_ids() -> list[str]:
    rows = get_supabase().table("projects").select("id").execute().data
    return [row["id"] for row in rows]


def update_batch_task_status(
    batch_task_id: str, status: str, message: str | None = None, citation_count: int = 0
) -> None:
    get_supabase().table("fetch_batch_tasks").update(
        {"status": status, "message": message, "citation_count": citation_count}
    ).eq("id", batch_task_id).execute()


def create_batch(project_id: str, prompt_ids: list[str], engine_names: list[str]) -> tuple[str, list[dict]]:
    """Creates the batch and its one-row-per-(prompt, engine) task records.
    Returns (batch_id, task_rows) where each task row carries the ids the
    caller needs to enqueue the matching Celery task."""
    sb = get_supabase()
    batch_id = sb.table("fetch_batches").insert({"project_id": project_id}).execute().data[0]["id"]

    pairs = [(prompt_id, engine_name) for prompt_id in prompt_ids for engine_name in engine_names]
    inserted = (
        sb.table("fetch_batch_tasks")
        .insert(
            [
                {
                    "batch_id": batch_id,
                    "prompt_id": prompt_id,
                    "engine_id": engine_ids()[engine_name],
                    "status": "pending",
                }
                for prompt_id, engine_name in pairs
            ]
        )
        .execute()
        .data
    )

    task_rows = [
        {"batch_task_id": row["id"], "prompt_id": prompt_id, "engine_name": engine_name}
        for row, (prompt_id, engine_name) in zip(inserted, pairs)
    ]
    return batch_id, task_rows


def save_fetch_result(
    *,
    prompt_id: str,
    engine_name: str,
    result: RawEngineResponse,
    classification: dict[str, Any],
    citation_rows: list[dict[str, Any]],
    tracked: list[dict[str, Any]],
) -> str:
    """Writes one engine answer and everything derived from it: the raw
    response, its citations, per-tracked-brand mention rows, and any query
    fanouts the engine exposed. Returns the raw_response id."""
    sb = get_supabase()
    engine_id = engine_ids()[engine_name]

    mentioned_brands: list[str] = classification["mentioned_brands"]
    own = next((t for t in tracked if not t["is_competitor"]), None)
    own_mentioned = bool(own and own["name"] in mentioned_brands)
    own_position = (mentioned_brands.index(own["name"]) + 1) if own_mentioned else None

    raw_response_id = (
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
        .data[0]["id"]
    )

    if citation_rows:
        sb.table("citations").insert(
            [
                {
                    "prompt_id": prompt_id,
                    "engine_id": engine_id,
                    "raw_response_id": raw_response_id,
                    "position": i + 1,  # order the engine itself returned citations in
                    **row,
                }
                for i, row in enumerate(citation_rows)
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
            [
                {"raw_response_id": raw_response_id, "query_text": q}
                for q in result.web_search_queries
            ]
        ).execute()

    return raw_response_id


def set_prompt_classification(prompt_id: str, classification: dict[str, Any]) -> None:
    """Topic/intent/branding are properties of the prompt itself, so they're
    only written once — the first fetch that manages to classify it wins."""
    get_supabase().table("prompts").update(
        {
            "topic": classification["topic"],
            "intent": classification["intent"],
            "is_branded": classification["is_branded_query"],
        }
    ).eq("id", prompt_id).execute()
