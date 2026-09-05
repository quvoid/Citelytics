import asyncio
import json

import httpx

from clients.base import Citation, EngineClient, RateLimitedError, RawEngineResponse
from clients.gemini_client import resolve_grounding_redirect
from config import KIE_API_KEY, KIE_GEMINI_MODEL
from countries import localize_prompt
from normalize import extract_domain

ENDPOINT_TMPL = "https://api.kie.ai/gemini/v1/models/{model}:streamGenerateContent"


def _parse_sse(body: str) -> list[dict]:
    events = []
    for line in body.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        payload = line[len("data:"):].strip()
        if payload == "[DONE]" or not payload:
            continue
        try:
            events.append(json.loads(payload))
        except json.JSONDecodeError:
            continue
    return events


class KieGeminiClient(EngineClient):
    """Gemini via kie.ai's streaming proxy — replaces the free-tier
    GeminiClient as the production Gemini engine. The free
    generativelanguage.googleapis.com key has NO grounded web search on it
    (Google Search grounding is a paid-tier-only feature — see
    clients/gemini_client.py's own docstring), so every "gemini" row fetched
    through it was an ungrounded answer with zero real citations. kie.ai's
    proxy is the same Gemini model with real Google Search grounding turned
    on, billed per call instead of rate-limited to nothing.

    kie.ai's endpoint requires `stream: true` — confirmed live that
    stream:false silently drops grounding on this endpoint (see
    backend/_kie_gemini_cost_test.py) — so this parses an SSE body and
    reassembles it into the SAME shape frontend/lib/engine-details.ts's
    parseGemini() already reads (candidates[0].content.parts /
    groundingMetadata / usageMetadata): text streams in across many events
    and gets concatenated in order, while groundingMetadata/usageMetadata
    only arrive complete on the final event, so the last non-empty one of
    each wins rather than being merged. credits_consumed (kie.ai's own
    per-call billing figure, not part of Gemini's own response shape) is
    kept at the top level of the reconstructed envelope for the same reason
    the real API fields are — it's real data that was sitting in the wire
    response unused."""

    name = "gemini-kie"

    def __init__(self) -> None:
        self._endpoint = ENDPOINT_TMPL.format(model=KIE_GEMINI_MODEL)

    async def fetch(self, prompt_text: str, country: str) -> RawEngineResponse:
        if not KIE_API_KEY:
            return RawEngineResponse(
                engine_name=self.name, status="error", message="kIE_API is not configured."
            )

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    self._endpoint,
                    headers={"Authorization": f"Bearer {KIE_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "stream": True,
                        "contents": [{"role": "user", "parts": [{"text": localize_prompt(prompt_text, country)}]}],
                        "tools": [{"googleSearch": {}}],
                    },
                )
        except httpx.HTTPError as exc:
            return RawEngineResponse(
                engine_name=self.name, status="error", message=f"Network error calling kie.ai: {exc}"
            )

        if resp.status_code == 429:
            raise RateLimitedError("kie.ai rate limit hit on the Gemini streaming endpoint.")
        if resp.status_code >= 400:
            return RawEngineResponse(
                engine_name=self.name,
                status="error",
                message=f"kie.ai Gemini request failed ({resp.status_code}): {resp.text[:300]}",
            )

        events = _parse_sse(resp.text)
        answer_text = ""
        grounding: dict = {}
        usage: dict = {}
        credits_consumed = None
        model_version = None
        for ev in events:
            cands = ev.get("candidates", [])
            if cands:
                content = cands[0].get("content", {})
                for part in content.get("parts", []):
                    if "text" in part:
                        answer_text += part["text"]
                gm = cands[0].get("groundingMetadata")
                if gm:
                    grounding = gm
            if "usageMetadata" in ev:
                usage = ev["usageMetadata"]
            if "credits_consumed" in ev:
                credits_consumed = ev["credits_consumed"]
            if "modelVersion" in ev:
                model_version = ev["modelVersion"]

        # A 200 with no usable events is kie.ai rate-limiting the stream
        # under load (confirmed in _kie_gemini_cost_test.py, not a real
        # empty answer) — surfaced as a retryable failure, not a success
        # with nothing in it.
        if not events or (not answer_text and not usage):
            raise RateLimitedError(
                f"kie.ai Gemini stream returned {len(events)} events with no text or usage — "
                "likely throttled under load."
            )

        chunks = grounding.get("groundingChunks", [])
        cited_chunk_indices: set[int] = set()
        for support in grounding.get("groundingSupports", []):
            cited_chunk_indices.update(support.get("groundingChunkIndices", []))

        redirect_uris = [
            (i, uri) for i, chunk in enumerate(chunks) if (uri := (chunk.get("web") or {}).get("uri"))
        ]
        async with httpx.AsyncClient() as client:
            resolved_urls = await asyncio.gather(
                *(resolve_grounding_redirect(client, uri) for _, uri in redirect_uris)
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

        # Reassembled to look exactly like a real (non-streamed)
        # generateContent envelope, so parseGemini() in engine-details.ts
        # needs no changes to read it — plus the two kie.ai-only fields
        # (credits_consumed, model) at the top level, additive and ignored
        # by anything that only knows the real Gemini shape.
        reconstructed = {
            "candidates": [
                {
                    "content": {"parts": [{"text": answer_text}]},
                    "groundingMetadata": grounding,
                }
            ],
            "usageMetadata": usage,
            "credits_consumed": credits_consumed,
            "model": model_version or KIE_GEMINI_MODEL,
        }

        return RawEngineResponse(
            engine_name=self.name,
            status="success",
            raw_json=reconstructed,
            answer_text=answer_text,
            citations=citations,
            web_search_queries=[q for q in grounding.get("webSearchQueries", []) if isinstance(q, str)],
        )
