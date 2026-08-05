import os

from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
# Check https://ai.google.dev/gemini-api/docs/models for the current
# Flash-tier model before relying on this — slugs are periodically retired.
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

# Both engine clients bias answers toward this market — see gemini_client.py
# (prompt-level instruction; the Gemini API exposes no country/locale param
# for google_search grounding, only lat/lng for Maps-style local queries)
# and openrouter_client.py (real user_location on the web_search server tool).
ENGINE_LOCALE_COUNTRY = os.environ.get("ENGINE_LOCALE_COUNTRY", "IN")

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
# GPT-OSS 120B is Groq's currently-recommended general model (llama-3.3-70b
# and llama-3.1-8b are being retired). Used only for prompt-research
# brainstorming, never for citation tracking — Groq has no web search.
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
# gpt-4o-mini is what actually approximates real ChatGPT behavior for a user
# query — gpt-oss-20b (OpenAI's free open-weight model) is NOT what ChatGPT
# runs, so it was a poor stand-in despite being free. This default is a real,
# small per-token cost (not a :free model) — see README for the $ estimate.
# To go back to a genuinely free (but less ChatGPT-representative) engine,
# override with a :free model from https://openrouter.ai/models?order=pricing-low-to-high.
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini")
OPENROUTER_ENABLE_WEB_SEARCH = (
    os.environ.get("OPENROUTER_ENABLE_WEB_SEARCH", "false").lower() == "true"
)

FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000")

# Comma-separated names used to detect brand mentions in AI answers and
# cited pages (case-insensitive substring match).
BRAND_KEYWORDS = [
    kw.strip()
    for kw in os.environ.get("BRAND_KEYWORDS", "Bajaj").split(",")
    if kw.strip()
]

# Upstash (or any standard Redis) connection string — same URL used for both
# the Celery broker and result backend. rediss:// (TLS) for Upstash.
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)

# Daily while testing on free tiers; move to weekly in production once real
# (paid) engine APIs are swapped in, to stay well under their rate limits.
FETCH_SCHEDULE_HOUR_UTC = int(os.environ.get("FETCH_SCHEDULE_HOUR_UTC", "4"))
