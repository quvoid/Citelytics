from typing import Literal

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    domain: str


class ProjectOut(BaseModel):
    id: str
    name: str
    domain: str


class PromptCreate(BaseModel):
    project_id: str
    query_text: str
    prompt_type: Literal["citation", "perception"] = "citation"


class PromptUpdate(BaseModel):
    active: bool | None = None


class PromptOut(BaseModel):
    id: str
    project_id: str
    query_text: str
    active: bool
    prompt_type: str
    topic: str | None = None
    intent: str | None = None
    is_branded: bool = False


class TrackedUrlCreate(BaseModel):
    project_id: str
    url: str
    name: str
    is_competitor: bool = False


class TrackedUrlOut(BaseModel):
    id: str
    project_id: str
    url: str
    name: str
    is_competitor: bool


class PerceptionFetchResponse(BaseModel):
    processed: int


class FetchTriggerResponse(BaseModel):
    batch_id: str
    tasks_enqueued: int


class FetchTaskStatus(BaseModel):
    prompt_id: str
    engine_name: str
    status: Literal["pending", "success", "rate_limited", "error"]
    message: str | None = None
    citation_count: int = 0


class FetchBatchStatusResponse(BaseModel):
    batch_id: str
    project_id: str
    tasks: list[FetchTaskStatus]
    done: bool


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    supabase_connected: bool
    redis_connected: bool
