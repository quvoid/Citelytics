from fastapi import APIRouter

from app.models import HealthResponse
from app.supabase_client import get_supabase

router = APIRouter()


@router.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    try:
        get_supabase().table("engines").select("id").limit(1).execute()
        return HealthResponse(status="ok", supabase_connected=True)
    except Exception:
        return HealthResponse(status="degraded", supabase_connected=False)
