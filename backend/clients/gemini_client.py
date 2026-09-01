import asyncio

import httpx

from clients.base import Citation, EngineClient, RateLimitedError, RawEngineResponse
from config import GEMINI_API_KEY, GEMINI_MODEL
from countries import localize_prompt
from normalize import extract_domain

# Gemini's google_search grounding tool has no country/locale request
# parameter (only lat/lng, meant for Maps-style "near me" queries — Google's
# own docs note it doesn't meaningfully influence non-local queries like
# ours). So prompt context in localize_prompt() is the only lever here:
# Gemini formulates its own search queries from what we send it, and stating
# the market biases those searches toward local sources and retailers.


async def _resolve_redirect(client: httpx.AsyncClient, url: str) -> str:
    """Gemini's grounding chunks return vertexaisearch.cloud.google.com
    redirect-proxy URLs, not the actual source. Follow the redirect chain to
    get the real destination article URL."""
    try:
        resp = await client.head(url, follow_redirects=True, timeout=10.0)
        return str(resp.url)
    except httpx.HTTPError:
        try:
            resp = await client.get(url, follow_redirects=True, timeout=10.0)
            return str(resp.url)
        except httpx.HTTPError:
            return url


class GeminiClient(EngineClient):
    name = "gemini"

    def __init__(self) -> None:
        self._endpoint = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
        )

    async def fetch(self, prompt_text: str, country: str) -> RawEngineResponse:
        """Calls Gemini with Google Search grounding and parses real citation
        URLs out of groundingMetadata.groundingChunks."""
        if not GEMINI_API_KEY:
            return RawEngineResponse(
                engine_name=self.name, status="error", message="GEMINI_API_KEY is not configured."
            )

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    self._endpoint,
                    params={"key": GEMINI_API_KEY},
                    json={
                        "contents": [{"parts": [{"text": localize_prompt(prompt_text, country)}]}],
                        "tools": [{"google_search": {}}],
                    },
                )
        except httpx.HTTPError as exc:
            return RawEngineResponse(
                engine_name=self.name, status="error", message=f"Network error calling Gemini: {exc}"
            )

        if resp.status_code == 429:
            # Raised (not returned) so the Celery task's autoretry_for catches
            # it and backs off, rather than recording a permanent failure.
            raise RateLimitedError(
                "Gemini free-tier grounding rate limit hit (per-minute or per-day cap)."
            )

        data = resp.json()

        if resp.status_code >= 400:
            err_message = data.get("error", {}).get(
                "message", f"Gemini request failed ({resp.status_code})."
            )
            return RawEngineResponse(engine_name=self.name, status="error", message=err_message)

        candidates = data.get("candidates") or []
        parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
        answer_text = "\n".join(p.get("text", "") for p in parts if p.get("text"))
        grounding = candidates[0].get("groundingMetadata", {}) if candidates else {}
        chunks = grounding.get("groundingChunks", [])

        # groundingChunks is every source Gemini's retrieval step pulled in;
        # groundingSupports maps specific spans of the VISIBLE answer text
        # back to specific chunk indices. A chunk that never appears in any
        # support was retrieved into context but never actually cited in
        # what the user reads — "quiet influence" vs. real attribution. This
        # was sitting in the API response unparsed until now (see
        # backend/backfill_cited_in_text.py for reprocessing already-stored
        # answers the same way, no re-fetch needed).
        cited_chunk_indices: set[int] = set()
        for support in grounding.get("groundingSupports", []):
            cited_chunk_indices.update(support.get("groundingChunkIndices", []))

        redirect_uris = [
            (i, uri) for i, chunk in enumerate(chunks) if (uri := (chunk.get("web") or {}).get("uri"))
        ]

        async with httpx.AsyncClient() as client:
            resolved_urls = await asyncio.gather(
                *(_resolve_redirect(client, uri) for _, uri in redirect_uris)
            )

        citations = [
            Citation(
                url=resolved,
                domain=extract_domain(resolved),
                is_simulated=False,
                cited_in_text=(i in cited_chunk_indices),
            )
            for (i, _), resolved in zip(redirect_uris, resolved_urls)
        ]

        return RawEngineResponse(
            engine_name=self.name,
            status="success",
            raw_json=data,
            answer_text=answer_text,
            citations=citations,
            web_search_queries=grounding.get("webSearchQueries", []),
        )
