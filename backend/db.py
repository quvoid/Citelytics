from functools import lru_cache

from supabase import Client, create_client

from config import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL


@lru_cache
def get_supabase() -> Client:
    """Service-role Supabase client. Backend-only — never exposed to the frontend."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
