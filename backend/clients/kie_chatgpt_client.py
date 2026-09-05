from typing import Any

import httpx

from clients.base import Citation, EngineClient, RateLimitedError, RawEngineResponse
from config import KIE_API_KEY, KIE_CHATGPT_MODEL
from countries import localize_prompt
from normalize import extract_domain

ENDPOINT = "https://api.kie.ai/codex/v1/responses"


def _final_answer_text(output: list[dict]) -> str:
    """Concatenates only the model's actual answer, not its planning notes.

    Each `message` item in `output` carries a `phase`: "commentary" is the
    model narrating its own approach before answering ("I'll narrow this to
    phones that are genuinely strong for 4K video..."), and "final_answer" is
    the real answer. kie_refetch_20.py's one-off version joined every
    `output_text` regardless of phase, which meant commentary ran directly
    into the answer with no separator ("...before recommending options.For 4K
    video recording, these are the strongest current choices:" — a real
    stored example, no space between sentences from two different phases).
    A model with no `phase` field at all (older kie.ai models, or a future
    one) falls back to every message, the previous behavior, rather than
    silently returning nothing."""
    has_phase_field = any(
        item.get("type") == "message" and "phase" in item for item in output
    )
    text = ""
    for item in output:
        if item.get("type") != "message":
            continue
        if has_phase_field and item.get("phase") != "final_answer":
            continue
        for c in item.get("content", []):
            if c.get("type") == "output_text":
                text += c.get("text", "")
    return text


class KieChatGPTClient(EngineClient):
    """ChatGPT via kie.ai's Responses-API proxy (codex/v1/responses) —
    replaces OpenRouterClient as the production ChatGPT engine. Unlike
    OpenRouter's chat-completions shape, this exposes the model's full
    search-and-read trail: every page it actually read via
    `include: web_search_call.action.sources` (not just what it cited
    inline), real per-call cost via `credits_consumed`, cache-hit token
    counts, and the exact model version/response id/timestamps — all stored
    verbatim in raw_json since frontend/lib/engine-details.ts's parseOpenAI
    already knows how to read every one of these fields from the real
    Responses API shape."""

    name = "chatgpt-kie"

    async def fetch(self, prompt_text: str, country: str) -> RawEngineResponse:
        if not KIE_API_KEY:
            return RawEngineResponse(
                engine_name=self.name, status="error", message="kIE_API is not configured."
            )

        body: dict[str, Any] = {
            "model": KIE_CHATGPT_MODEL,
            "input": localize_prompt(prompt_text, country),
            "tools": [{"type": "web_search"}],
            # Every page the model READ, not just what it cited inline — see
            # engine-details.ts's parseOpenAI, which only trusts this data
            # when it sees this key actually present in the response.
            "include": ["web_search_call.action.sources"],
            "stream": False,
        }

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    ENDPOINT,
                    headers={"Authorization": f"Bearer {KIE_API_KEY}", "Content-Type": "application/json"},
                    json=body,
                )
        except httpx.HTTPError as exc:
            return RawEngineResponse(
                engine_name=self.name, status="error", message=f"Network error calling kie.ai: {exc}"
            )

        if resp.status_code == 429:
            raise RateLimitedError("kie.ai rate limit hit on the ChatGPT (codex/v1/responses) endpoint.")

        try:
            data = resp.json()
        except Exception as exc:
            return RawEngineResponse(
                engine_name=self.name, status="error", message=f"kie.ai returned non-JSON: {exc}"
            )

        if resp.status_code >= 400:
            err_message = (
                data.get("error", {}).get("message")
                if isinstance(data.get("error"), dict)
                else data.get("error")
            ) or f"kie.ai request failed ({resp.status_code})."
            return RawEngineResponse(engine_name=self.name, status="error", message=err_message)

        output = data.get("output", [])
        answer_text = _final_answer_text(output)
        if not answer_text.strip():
            return RawEngineResponse(
                engine_name=self.name, status="error", message="Empty answer from kie.ai.", raw_json=data
            )

        citation_urls: list[str] = []
        web_search_queries: list[str] = []
        for item in output:
            if item.get("type") == "web_search_call":
                action = item.get("action", {})
                web_search_queries.extend(
                    action.get("queries") or ([action["query"]] if action.get("query") else [])
                )
            if item.get("type") == "message":
                for c in item.get("content", []):
                    if c.get("type") != "output_text":
                        continue
                    for ann in c.get("annotations", []) or []:
                        if ann.get("type") == "url_citation" and ann.get("url"):
                            citation_urls.append(ann["url"])

        citations = [
            Citation(url=u, domain=extract_domain(u), is_simulated=False, cited_in_text=True)
            for u in dict.fromkeys(citation_urls)
        ]

        return RawEngineResponse(
            engine_name=self.name,
            status="success",
            raw_json=data,
            answer_text=answer_text,
            citations=citations,
            web_search_queries=web_search_queries,
        )
