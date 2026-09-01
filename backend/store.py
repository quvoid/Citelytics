"""Persistence for the citation-fetch pipeline.

Keeps raw Supabase table access out of tasks.py so the Celery task reads as
orchestration (call engine -> classify -> persist) rather than a wall of
inserts. Everything here is synchronous — it runs inside the Celery worker,
not the async engine-call path."""

from functools import lru_cache
from typing import Any

from classifier import CLASSIFIER_VERSION
from clients.base import RawEngineResponse
from config import DEFAULT_COUNTRY
from db import get_supabase
from normalize import domain_matches, extract_domain


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
        .select("id, project_id, query_text, topic, country")
        .eq("id", prompt_id)
        .single()
        .execute()
        .data
    )


def project_default_country(project_id: str) -> str:
    row = (
        get_supabase()
        .table("projects")
        .select("default_country")
        .eq("id", project_id)
        .maybe_single()
        .execute()
        .data
    )
    return (row or {}).get("default_country") or DEFAULT_COUNTRY


def resolve_country(prompt: dict[str, Any]) -> str:
    """prompt override -> project home market -> env floor. Resolved once per
    fetch and then carried on the response/citation rows, so changing a
    prompt's country later never silently relabels the history it already
    produced."""
    return prompt.get("country") or project_default_country(prompt["project_id"])


def get_tracked_urls(project_id: str) -> list[dict[str, Any]]:
    # "aliases" requires migration 0014 to be applied — selecting a column
    # PostgREST doesn't have raises a real error here (the Python client
    # surfaces it as an exception, unlike the frontend's `data ?? []`
    # swallow), so this fails loudly rather than silently until that
    # migration lands, which is the safe direction for a backend call.
    return (
        get_supabase()
        .table("tracked_urls")
        .select("id, name, url, is_competitor, aliases")
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
    project_id: str,
    engine_name: str,
    country: str,
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
                "country": country,
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
                    "country": country,
                    "position": i + 1,  # order the engine itself returned citations in
                    **row,
                }
                for i, row in enumerate(citation_rows)
            ]
        ).execute()

    if tracked:
        # Domains this response actually cited — checked against each tracked
        # brand's own domain so a brand the engine's retrieval step pulled in
        # but never narrated by name isn't indistinguishable from a brand it
        # never touched at all. See migration 0006 for the per-engine caveat
        # (this is only ever richer than `mentioned` for Gemini responses;
        # OpenRouter's citations don't expose anything beyond what was cited).
        cited_domains = {row["domain"] for row in citation_rows if row.get("domain")}
        brand_sentiment: dict[str, int] = classification.get("brand_sentiment") or {}

        def _cited_domain(t: dict[str, Any]) -> bool:
            return any(domain_matches(d, extract_domain(t["url"])) for d in cited_domains)

        sb.table("answer_brand_mentions").insert(
            [
                {
                    "raw_response_id": raw_response_id,
                    "tracked_url_id": t["id"],
                    "mentioned": t["name"] in mentioned_brands,
                    "position": (mentioned_brands.index(t["name"]) + 1)
                    if t["name"] in mentioned_brands
                    else None,
                    "considered": t["name"] in mentioned_brands or _cited_domain(t),
                    # Independent of `considered` (which is an OR of the two
                    # facts below) — this is JUST the retrieval fact, needed
                    # on its own to build the named/cited quadrant matrix.
                    # mentioned=true, cited_domain=false is a real quadrant
                    # ("AI trusts your name, never looked at your site");
                    # `considered` alone can't distinguish it from the
                    # opposite quadrant.
                    "cited_domain": _cited_domain(t),
                    # Per-brand, so competitors get a real sentiment score too —
                    # raw_responses.brand_sentiment_score only ever held the own
                    # brand's. Null for brands this answer never named.
                    "sentiment_score": brand_sentiment.get(t["name"]),
                    "classifier_version": CLASSIFIER_VERSION,
                }
                for t in tracked
            ]
        ).execute()

    if result.web_search_queries:
        sb.table("query_fanouts").insert(
            [
                # order the engine itself issued these sub-queries in — see
                # migration 0007; was being discarded before this
                {"raw_response_id": raw_response_id, "query_text": q, "position": i + 1}
                for i, q in enumerate(result.web_search_queries)
            ]
        ).execute()

    # Specific models named in THIS answer — "Edge 70 Fusion", "Razr Fold" —
    # one level more specific than the brand-level tracking above. Freely
    # extracted per response (not matched against a maintained SKU list),
    # so a real answer can carry duplicates across its own text; de-dupe
    # case-insensitively rather than storing the same tag twice per response.
    product_tags = classification.get("product_tags") or []
    seen_tags = set()
    unique_tags = []
    for tag in product_tags:
        key = tag.strip().lower()
        if not key or key in seen_tags:
            continue
        seen_tags.add(key)
        unique_tags.append(tag.strip())
    if unique_tags:
        sb.table("answer_product_tags").insert(
            [{"raw_response_id": raw_response_id, "tag": tag} for tag in unique_tags]
        ).execute()

    # Untracked brand names the classifier noticed in passing — the raw
    # material for auto-suggesting competitors on /brands. Only ever
    # populated when the Gemini sentiment call actually ran (see
    # classifier.py's other_brands_mentioned field doc); skip anything that
    # case-insensitively matches an already-tracked name or alias, so a
    # brand you already track never shows up as a "suggestion" for itself.
    known_names = {
        n.strip().lower()
        for t in tracked
        for n in [t["name"], *(t.get("aliases") or [])]
        if n and n.strip()
    }
    other_brands = classification.get("other_brands_mentioned") or []
    seen_unmatched: set[str] = set()
    unmatched_rows = []
    for name in other_brands:
        key = name.strip().lower()
        if not key or key in known_names or key in seen_unmatched:
            continue
        seen_unmatched.add(key)
        unmatched_rows.append(
            {"project_id": project_id, "raw_response_id": raw_response_id, "name": name.strip()}
        )
    if unmatched_rows:
        sb.table("unmatched_brand_mentions").insert(unmatched_rows).execute()

    return raw_response_id


def get_topic_names(project_id: str) -> list[str]:
    """The project's existing topic vocabulary, passed to the classifier so it
    reuses a label instead of inventing a near-duplicate. See
    classifier.classify_answer's `known_topics`."""
    rows = (
        get_supabase()
        .table("topics")
        .select("name")
        .eq("project_id", project_id)
        .order("name")
        .execute()
        .data
        or []
    )
    return [r["name"] for r in rows]


def resolve_topic_id(project_id: str, name: str | None) -> str | None:
    """Finds or creates the topic row for a classifier-produced label.
    Created rows stay flagged is_ai_suggested until a human touches them, so
    the UI can distinguish a label nobody has reviewed from one you chose."""
    clean = (name or "").strip()
    if not clean:
        return None
    sb = get_supabase()
    existing = (
        sb.table("topics")
        .select("id")
        .eq("project_id", project_id)
        .eq("name", clean)
        .limit(1)
        .execute()
        .data
    )
    if existing:
        return existing[0]["id"]
    return (
        sb.table("topics")
        .insert({"project_id": project_id, "name": clean, "is_ai_suggested": True})
        .execute()
        .data[0]["id"]
    )


def set_prompt_classification(
    prompt_id: str, project_id: str, classification: dict[str, Any]
) -> None:
    """Topic/intent/branding are properties of the prompt itself, so they're
    only written once — the first fetch that manages to classify it wins.
    (Note: this used to also write a `category` here — dropped in favor of
    user-managed tags, see supabase/migrations/0009_tags.sql.)"""
    get_supabase().table("prompts").update(
        {
            # `topic` is kept as the classifier's raw suggestion for one
            # release; topic_id is the real, user-manageable link (0010).
            "topic": classification["topic"],
            "topic_id": resolve_topic_id(project_id, classification["topic"]),
            "intent": classification["intent"],
            "is_branded": classification["is_branded_query"],
        }
    ).eq("id", prompt_id).execute()
