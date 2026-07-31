from abc import ABC, abstractmethod
from typing import Any, Literal

from pydantic import BaseModel


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
    async def fetch(self, prompt_text: str) -> RawEngineResponse:
        """Call the engine, return raw response + normalized citations."""
        ...
