from typing import Literal, Optional

from pydantic import BaseModel


class Citation(BaseModel):
    url: str
    domain: str
    is_simulated: bool


class EngineResult(BaseModel):
    engine: Literal["gemini", "openrouter_demo"]
    status: Literal["success", "rate_limited", "error"]
    message: Optional[str] = None
    citation_count: int = 0


class PromptFetchStatus(BaseModel):
    prompt_id: str
    query_text: str
    results: list[EngineResult]


class FetchCitationsResponse(BaseModel):
    project_id: str
    prompts_processed: int
    statuses: list[PromptFetchStatus]


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    supabase_connected: bool
