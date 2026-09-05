from clients.base import Citation, EngineClient, RateLimitedError, RawEngineResponse
from clients.gemini_client import GeminiClient
from clients.kie_chatgpt_client import KieChatGPTClient
from clients.kie_gemini_client import KieGeminiClient
from clients.openrouter_client import OpenRouterClient

__all__ = [
    "Citation",
    "EngineClient",
    "RateLimitedError",
    "RawEngineResponse",
    "ENGINE_CLIENTS",
    "ACTIVE_ENGINE_NAMES",
    "get_engine_client",
]

# Register every engine here. Adding Perplexity/DataForSEO later means
# writing one new class in clients/ implementing EngineClient and adding one
# line below — tasks.py and main.py never change.
#
# "gemini" and "openrouter" stay registered (not deleted) so their historical
# raw_responses rows remain explicable and get_engine_client(name) never
# raises for old data — but neither is in ACTIVE_ENGINE_NAMES below, so
# neither is scheduled any more. See kie_chatgpt_client.py/kie_gemini_client.py
# for why: OpenRouter's citation shape cannot expose read-but-uncited pages
# at all, and the free Gemini API key has no web-search grounding on it.
ENGINE_CLIENTS: dict[str, EngineClient] = {
    "gemini": GeminiClient(),
    "openrouter": OpenRouterClient(),
    "chatgpt-kie": KieChatGPTClient(),
    "gemini-kie": KieGeminiClient(),
    # "perplexity": PerplexityClient(),
    # "google_aio": GoogleAIOClient(),
}

# The engines create_fetch_batch() actually schedules — a subset of
# ENGINE_CLIENTS.keys(), not all of it, precisely so an engine can stay
# registered (for historical data / easy rollback) without being fetched
# going forward. Both production engines now run through kie.ai.
ACTIVE_ENGINE_NAMES: list[str] = ["chatgpt-kie", "gemini-kie"]


def get_engine_client(name: str) -> EngineClient:
    client = ENGINE_CLIENTS.get(name)
    if client is None:
        raise ValueError(f"No EngineClient registered for engine '{name}'")
    return client
