import os

from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
# Check https://ai.google.dev/gemini-api/docs/models for the current
# Flash-tier model before relying on this — slugs are periodically retired.
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
# The free-model roster on openrouter.ai/models rotates. Keep a working
# fallback here and override via env if this one is retired.
OPENROUTER_FREE_MODEL = os.environ.get(
    "OPENROUTER_FREE_MODEL", "meta-llama/llama-3.3-70b-instruct:free"
)
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
