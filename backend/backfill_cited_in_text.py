"""One-off, offline backfill of citations.cited_in_text for historical Gemini
answers — no re-fetch, no Gemini call, no quota spent.

Why this is possible at all: raw_responses.raw_response already stores the
FULL Gemini API response as jsonb, groundingSupports included. Only the
extraction was missing — clients/gemini_client.py now parses it for new
fetches (see that file's comment); this script re-derives the same thing for
everything already on disk, the same "reprocess what's stored" idiom as
reclassify.py, but pure computation rather than an LLM call.

The one subtlety: citations.position (1-indexed, set at insert time in
store.py) was assigned in the order gemini_client.py's `redirect_uris` list
was built — i.e. groundingChunks filtered to those with a `web.uri`, in
original index order. To match a stored citation back to the chunk index
groundingSupports actually references, this script rebuilds that exact same
filtered-and-ordered list from the stored JSON and zips it against position.
That construction hasn't changed — only what gets computed FROM it has — so
this reproduces it exactly for every historical row.
"""

from db import get_supabase

_PAGE_SIZE = 500


def _paged(table: str, select: str, **filters: object):
    """PostgREST defaults to a 1000-row cap and this backend has no existing
    pagination helper — the same lesson the frontend hit twice already this
    project, applied here so a growing table can't silently truncate."""
    sb = get_supabase()
    offset = 0
    while True:
        q = sb.table(table).select(select)
        for k, v in filters.items():
            q = q.eq(k, v)
        rows = q.range(offset, offset + _PAGE_SIZE - 1).execute().data or []
        yield from rows
        if len(rows) < _PAGE_SIZE:
            return
        offset += _PAGE_SIZE


def run() -> dict[str, int]:
    sb = get_supabase()
    gemini = sb.table("engines").select("id").eq("name", "gemini").limit(1).execute().data
    if not gemini:
        return {"responses_scanned": 0, "citations_updated": 0, "message": "no gemini engine row"}
    gemini_engine_id = gemini[0]["id"]

    responses_scanned = 0
    citations_updated = 0

    for resp in _paged(
        "raw_responses", "id, raw_response", engine_id=gemini_engine_id
    ):
        raw = resp.get("raw_response") or {}
        candidates = raw.get("candidates") or []
        grounding = (candidates[0].get("groundingMetadata") or {}) if candidates else {}
        chunks = grounding.get("groundingChunks") or []
        supports = grounding.get("groundingSupports") or []
        if not chunks:
            continue
        responses_scanned += 1

        cited_chunk_indices: set[int] = set()
        for support in supports:
            cited_chunk_indices.update(support.get("groundingChunkIndices") or [])

        # Exactly gemini_client.py's redirect_uris construction: chunks with
        # a web.uri, in original index order — this order IS citations.position.
        ordered_indices = [i for i, c in enumerate(chunks) if (c.get("web") or {}).get("uri")]

        citation_rows = (
            sb.table("citations")
            .select("id, position")
            .eq("raw_response_id", resp["id"])
            .not_.is_("position", "null")
            .execute()
            .data
            or []
        )
        by_position = {c["position"]: c["id"] for c in citation_rows}

        for position, original_chunk_index in enumerate(ordered_indices, start=1):
            citation_id = by_position.get(position)
            if citation_id is None:
                continue  # citation row missing/deleted since fetch — skip, don't guess
            sb.table("citations").update(
                {"cited_in_text": original_chunk_index in cited_chunk_indices}
            ).eq("id", citation_id).execute()
            citations_updated += 1

    return {"responses_scanned": responses_scanned, "citations_updated": citations_updated}


if __name__ == "__main__":
    import json

    print(json.dumps(run(), indent=2))
