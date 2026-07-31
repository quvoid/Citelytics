import redis
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import CELERY_BROKER_URL, FRONTEND_ORIGIN
from db import get_supabase
from models import (
    FetchBatchStatusResponse,
    FetchTaskStatus,
    FetchTriggerResponse,
    HealthResponse,
    PerceptionFetchResponse,
    ProjectCreate,
    ProjectOut,
    PromptCreate,
    PromptOut,
    PromptUpdate,
    TrackedUrlCreate,
    TrackedUrlOut,
)
from perception import run_perception_fetch
from tasks import create_fetch_batch

app = FastAPI(title="Citelytics Backend", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    supabase_connected = True
    try:
        get_supabase().table("engines").select("id").limit(1).execute()
    except Exception:
        supabase_connected = False

    redis_connected = True
    try:
        redis.from_url(CELERY_BROKER_URL, socket_connect_timeout=3).ping()
    except Exception:
        redis_connected = False

    status = "ok" if supabase_connected and redis_connected else "degraded"
    return HealthResponse(status=status, supabase_connected=supabase_connected, redis_connected=redis_connected)


# --- Projects -----------------------------------------------------------

@app.post("/api/projects", response_model=ProjectOut)
async def create_project(body: ProjectCreate) -> ProjectOut:
    sb = get_supabase()
    try:
        row = sb.table("projects").insert(body.model_dump()).execute().data[0]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to create project: {exc}") from exc
    return ProjectOut(**row)


@app.get("/api/projects", response_model=list[ProjectOut])
async def list_projects() -> list[ProjectOut]:
    sb = get_supabase()
    rows = sb.table("projects").select("id, name, domain").execute().data
    return [ProjectOut(**row) for row in rows]


# --- Prompts --------------------------------------------------------------

@app.post("/api/prompts", response_model=PromptOut)
async def create_prompt(body: PromptCreate) -> PromptOut:
    sb = get_supabase()
    try:
        row = sb.table("prompts").insert(body.model_dump()).execute().data[0]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to create prompt: {exc}") from exc
    return PromptOut(**row)


@app.patch("/api/prompts/{prompt_id}", response_model=PromptOut)
async def update_prompt(prompt_id: str, body: PromptUpdate) -> PromptOut:
    sb = get_supabase()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")
    try:
        rows = sb.table("prompts").update(updates).eq("id", prompt_id).execute().data
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to update prompt: {exc}") from exc
    if not rows:
        raise HTTPException(status_code=404, detail="Prompt not found.")
    return PromptOut(**rows[0])


# --- Tracked brand/competitor URLs -----------------------------------------

@app.post("/api/tracked-urls", response_model=TrackedUrlOut)
async def create_tracked_url(body: TrackedUrlCreate) -> TrackedUrlOut:
    sb = get_supabase()
    try:
        row = sb.table("tracked_urls").insert(body.model_dump()).execute().data[0]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to add tracked URL: {exc}") from exc
    return TrackedUrlOut(**row)


# --- Fetch trigger / status (async, Celery-backed) -------------------------

@app.post("/api/projects/{project_id}/fetch", response_model=FetchTriggerResponse)
async def trigger_fetch(project_id: str) -> FetchTriggerResponse:
    """Fans out one Celery task per active prompt x engine and returns
    immediately with a batch_id — the frontend polls /fetch-status/{batch_id}
    for live per-prompt/engine progress as workers process the queue."""
    try:
        batch_id, tasks_enqueued = create_fetch_batch(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to enqueue fetch: {exc}") from exc
    return FetchTriggerResponse(batch_id=batch_id, tasks_enqueued=tasks_enqueued)


@app.get("/api/projects/{project_id}/fetch-status/{batch_id}", response_model=FetchBatchStatusResponse)
async def fetch_status(project_id: str, batch_id: str) -> FetchBatchStatusResponse:
    sb = get_supabase()

    batch = sb.table("fetch_batches").select("id, project_id").eq("id", batch_id).maybe_single().execute().data
    if not batch or batch["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="Fetch batch not found for this project.")

    engines_by_id = {row["id"]: row["name"] for row in sb.table("engines").select("id, name").execute().data}

    task_rows = (
        sb.table("fetch_batch_tasks")
        .select("prompt_id, engine_id, status, message, citation_count")
        .eq("batch_id", batch_id)
        .execute()
        .data
    )

    tasks = [
        FetchTaskStatus(
            prompt_id=row["prompt_id"],
            engine_name=engines_by_id.get(row["engine_id"], "unknown"),
            status=row["status"],
            message=row["message"],
            citation_count=row["citation_count"],
        )
        for row in task_rows
    ]
    done = all(t.status != "pending" for t in tasks)

    return FetchBatchStatusResponse(batch_id=batch_id, project_id=project_id, tasks=tasks, done=done)


# --- Perception (brand attribute extraction) --------------------------------

@app.post("/api/projects/{project_id}/fetch-perception", response_model=PerceptionFetchResponse)
async def trigger_perception_fetch(project_id: str) -> PerceptionFetchResponse:
    """Runs every active 'perception'-type prompt synchronously (low volume,
    unlike the citation flow — no Celery batch tracking needed here)."""
    try:
        processed = await run_perception_fetch(project_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Perception fetch failed: {exc}") from exc
    return PerceptionFetchResponse(processed=processed)
