import hashlib

import httpx

from clients.base import Citation, EngineClient, RawEngineResponse
from clients.gemini_client import RateLimitedError
from config import OPENROUTER_API_KEY, OPENROUTER_ENABLE_WEB_SEARCH, OPENROUTER_MODEL
from normalize import extract_domain

OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"

# Used only in demo (non-web-search) mode to layer illustrative "simulated"
# citations onto a real free-tier completion, purely for UI demonstration.
# Never presented as real grounded data (is_simulated=True on every row).
_SIMULATED_DOMAIN_POOL = [
    "techcrunch.com",
    "searchengineland.com",
    "hubspot.com",
    "moz.com",
    "semrush.com",
    "backlinko.com",
    "ahrefs.com",
    "reddit.com",
    "producthunt.com",
    "g2.com",
]


def _simulated_citations(prompt_text: str) -> list[Citation]:
    seed = int(hashlib.sha256(prompt_text.encode()).hexdigest(), 16)
    count = 2 + (seed % 3)  # 2-4 simulated citations
    picks = []
    for i in range(count):
        domain = _SIMULATED_DOMAIN_POOL[(seed + i) % len(_SIMULATED_DOMAIN_POOL)]
        url = f"https://{domain}/article-{(seed + i) % 9999}"
        picks.append(Citation(url=url, domain=domain, is_simulated=True))
    return picks


def _parse_url_citations(annotations: list[dict]) -> list[Citation]:
    citations = []
    for ann in annotations:
        if ann.get("type") != "url_citation":
            continue
        url = ann.get("url_citation", {}).get("url") or ann.get("url")
        if not url:
            continue
        citations.append(Citation(url=url, domain=extract_domain(url), is_simulated=False))
    return citations


class OpenRouterClient(EngineClient):
    name = "openrouter"

    async def fetch(self, prompt_text: str) -> RawEngineResponse:
        """Free-tier text generation via OpenRouter. Real url_citation
        annotations only if OPENROUTER_ENABLE_WEB_SEARCH=true (costs
        OpenRouter credits); otherwise layers clearly-labeled simulated
        citations for UI demo purposes."""
        if not OPENROUTER_API_KEY:
            return RawEngineResponse(
                engine_name=self.name, status="error", message="OPENROUTER_API_KEY is not configured."
            )

        model = OPENROUTER_MODEL
        if OPENROUTER_ENABLE_WEB_SEARCH:
            model = f"{model.removesuffix(':free')}:online"

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    OPENROUTER_ENDPOINT,
                    headers={
                        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": prompt_text}],
                    },
                )
        except httpx.HTTPError as exc:
            return RawEngineResponse(
                engine_name=self.name, status="error", message=f"Network error calling OpenRouter: {exc}"
            )

        if resp.status_code == 429:
            raise RateLimitedError(
                "OpenRouter rate limit hit (20/min, or daily cap of 50-1000 depending on credit top-up)."
            )

        data = resp.json()

        if resp.status_code >= 400:
            err_message = data.get("error", {}).get(
                "message", f"OpenRouter request failed ({resp.status_code})."
            )
            return RawEngineResponse(engine_name=self.name, status="error", message=err_message)

        message = (data.get("choices") or [{}])[0].get("message", {})
        annotations = message.get("annotations") or []
        answer_text = message.get("content") or ""

        if OPENROUTER_ENABLE_WEB_SEARCH and annotations:
            citations = _parse_url_citations(annotations)
        else:
            citations = _simulated_citations(prompt_text)

        return RawEngineResponse(
            engine_name=self.name,
            status="success",
            raw_json=data,
            answer_text=answer_text,
            citations=citations,
        )
