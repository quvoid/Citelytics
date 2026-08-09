from typing import Literal

from pydantic import BaseModel, field_validator

from countries import is_supported


def _validate_country(value: str | None) -> str | None:
    """Rejects unknown markets at the API boundary rather than letting them
    reach an engine call, where an unrecognized code degrades silently into a
    differently-phrased prompt and quietly poisons the comparison."""
    if value is None or value == "":
        return None
    code = value.strip().upper()
    if not is_supported(code):
        raise ValueError(f"Unsupported country code: {value}")
    return code


class ProjectCreate(BaseModel):
    name: str
    domain: str
    # The project's home market — inherited by every prompt that doesn't
    # override it.
    default_country: str = "IN"

    @field_validator("default_country")
    @classmethod
    def _country(cls, v: str) -> str:
        return _validate_country(v) or "IN"


class ProjectOut(BaseModel):
    id: str
    name: str
    domain: str
    default_country: str = "IN"


class PromptCreate(BaseModel):
    project_id: str
    query_text: str
    prompt_type: Literal["citation", "perception"] = "citation"
    # null = inherit the project's default_country at fetch time
    country: str | None = None

    @field_validator("country")
    @classmethod
    def _country(cls, v: str | None) -> str | None:
        return _validate_country(v)


class PromptUpdate(BaseModel):
    active: bool | None = None
    country: str | None = None

    @field_validator("country")
    @classmethod
    def _country(cls, v: str | None) -> str | None:
        return _validate_country(v)


class PromptOut(BaseModel):
    id: str
    project_id: str
    query_text: str
    active: bool
    prompt_type: str
    country: str | None = None
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


class ContentBriefCreate(BaseModel):
    project_id: str
    prompt_text: str
    origin: str


class ContentBriefOut(BaseModel):
    id: str
    project_id: str
    prompt_text: str
    origin: str
    status: Literal["pending", "scored"]
    score: int | None = None
    tone: str | None = None
    content_intent: str | None = None
    language: str | None = None
    article_type: str | None = None
    cell_notes: dict[str, str | None] | None = None
    main_topic: str | None = None
    value_proposition: str | None = None
    target_audience: str | None = None
    key_takeaways: list[str] | None = None
    created_at: str
    analysed_at: str | None = None


class PromptResearchRequest(BaseModel):
    seed: str
    # null = research the project's home market
    country: str | None = None

    @field_validator("country")
    @classmethod
    def _country(cls, v: str | None) -> str | None:
        return _validate_country(v)


class CountryOut(BaseModel):
    code: str
    name: str


class PromptCandidateOut(BaseModel):
    prompt_text: str
    topic: str
    search_query: str
    intent: str
    relevance_note: str
    # Real Google Trends relative interest (0-100, geo-scoped), looked up for
    # `search_query` — never AI-prompt traffic, no such data exists anywhere.
    # None means unknown (Trends returned nothing / the unofficial API failed),
    # not zero interest.
    search_interest: int | None = None


class PromptResearchResponse(BaseModel):
    candidates: list[PromptCandidateOut]


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    supabase_connected: bool
    redis_connected: bool
