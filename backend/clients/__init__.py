from clients.base import EngineClient
from clients.gemini_client import GeminiClient
from clients.openrouter_client import OpenRouterClient

# Register every engine here. Adding Perplexity/OpenAI/Grok/DataForSEO later
# means writing one new class in clients/ implementing EngineClient and
# adding one line below — tasks.py and main.py never change.
ENGINE_CLIENTS: dict[str, EngineClient] = {
    "gemini": GeminiClient(),
    "openrouter": OpenRouterClient(),
    # "perplexity": PerplexityClient(),
    # "openai": OpenAIClient(),
    # "grok": GrokClient(),
    # "google_aio": GoogleAIOClient(),
}


def get_engine_client(name: str) -> EngineClient:
    client = ENGINE_CLIENTS.get(name)
    if client is None:
        raise ValueError(f"No EngineClient registered for engine '{name}'")
    return client
