from abc import ABC, abstractmethod
from typing import Any, Literal

from pydantic import BaseModel


class RateLimitedError(Exception):
    """Raised by an engine client on a 429 so the Celery task can retry with
    backoff, rather than recording it as a permanent failure. Lives here (not
    in a specific client) so every engine depends only on this interface."""


class Citation(BaseModel):
    url: str
    domain: str
    is_simulated: bool = False


class RawEngineResponse(BaseModel):
    engine_name: str
    status: Literal["success", "rate_limited", "error"]
    raw_json: dict[str, Any] | None = None
    answer_text: str | None = None
    citations: list[Citation] = []
    # The literal sub-search queries the engine's grounding tool issued
    # before answering, if it exposes them (Gemini does, via
    # groundingMetadata.webSearchQueries; most engines don't).
    web_search_queries: list[str] = []
    message: str | None = None


class EngineClient(ABC):
    """Every engine — test or real — implements this one interface.
    tasks.py and the DB-write logic only ever talk to EngineClient, never to
    a specific engine's API shape. Swapping Gemini/OpenRouter for
    Perplexity/OpenAI/Grok/DataForSEO later means writing one new class here
    and registering it in clients/__init__.py's ENGINE_CLIENTS — nothing
    else in the codebase changes."""

    name: str

    @abstractmethod
    async def fetch(self, prompt_text: str, country: str) -> RawEngineResponse:
        """Call the engine, return raw response + normalized citations.

        `country` is an ISO 3166-1 alpha-2 code, already resolved by the
        caller (prompt override -> project default -> DEFAULT_COUNTRY), so a
        client never has to reach back into config for it. How a client
        applies it is engine-specific: a real request parameter where the API
        has one (OpenRouter's user_location), prompt-level framing where it
        doesn't (Gemini)."""
        ...
