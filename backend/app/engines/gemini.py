import asyncio
from dataclasses import dataclass, field
from typing import Any, Literal

import httpx

from app.config import GEMINI_API_KEY, GEMINI_MODEL
from app.normalize import extract_domain

GEMINI_ENDPOINT = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
)


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


@dataclass
class EngineFetchResult:
    status: Literal["success", "rate_limited", "error"]
    raw_response: dict[str, Any] | None = None
    citations: list[dict[str, Any]] = field(default_factory=list)
    answer_text: str | None = None
    message: str | None = None


async def fetch_gemini_citations(prompt_text: str) -> EngineFetchResult:
    """Calls Gemini with Google Search grounding and parses real citation URLs
    out of groundingMetadata.groundingChunks / groundingSupports."""
    if not GEMINI_API_KEY:
        return EngineFetchResult(status="error", message="GEMINI_API_KEY is not configured.")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                GEMINI_ENDPOINT,
                params={"key": GEMINI_API_KEY},
                json={
                    "contents": [{"parts": [{"text": prompt_text}]}],
                    "tools": [{"google_search": {}}],
                },
            )
    except httpx.HTTPError as exc:
        return EngineFetchResult(status="error", message=f"Network error calling Gemini: {exc}")

    if resp.status_code == 429:
        return EngineFetchResult(
            status="rate_limited",
            message="Gemini free-tier grounding rate limit hit (per-minute or per-day cap).",
        )

    data = resp.json()

    if resp.status_code >= 400:
        err_message = data.get("error", {}).get("message", f"Gemini request failed ({resp.status_code}).")
        return EngineFetchResult(status="error", message=err_message)

    candidates = data.get("candidates") or []
    parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
    answer_text = "\n".join(p.get("text", "") for p in parts if p.get("text"))
    grounding = candidates[0].get("groundingMetadata", {}) if candidates else {}
    chunks = grounding.get("groundingChunks", [])

    redirect_uris = [
        uri for chunk in chunks if (uri := (chunk.get("web") or {}).get("uri"))
    ]

    async with httpx.AsyncClient() as client:
        resolved_urls = await asyncio.gather(
            *(_resolve_redirect(client, uri) for uri in redirect_uris)
        )

    citations = [
        {"url": resolved, "domain": extract_domain(resolved), "is_simulated": False}
        for resolved in resolved_urls
    ]

    return EngineFetchResult(
        status="success", raw_response=data, citations=citations, answer_text=answer_text
    )
