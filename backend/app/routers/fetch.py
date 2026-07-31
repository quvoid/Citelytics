from fastapi import APIRouter, HTTPException

from app.brand_check import check_brand_mentions, text_mentions_brand
from app.engines.gemini import fetch_gemini_citations
from app.engines.openrouter import fetch_openrouter_citations
from app.models import EngineResult, FetchCitationsResponse, PromptFetchStatus
from app.supabase_client import get_supabase

router = APIRouter()


def _get_engine_ids(sb) -> dict[str, str]:
    resp = sb.table("engines").select("id, name").execute()
    return {row["name"]: row["id"] for row in resp.data}


@router.post("/api/fetch-citations/{project_id}", response_model=FetchCitationsResponse)
async def fetch_citations(project_id: str) -> FetchCitationsResponse:
    sb = get_supabase()

    try:
        prompts_resp = (
            sb.table("prompts")
            .select("id, query_text")
            .eq("project_id", project_id)
            .eq("active", True)
            .execute()
        )
    except Exception as exc:  # supabase-py raises generic exceptions on API errors
        raise HTTPException(status_code=502, detail=f"Failed to load prompts: {exc}") from exc

    prompts = prompts_resp.data
    if not prompts:
        raise HTTPException(status_code=404, detail="No active prompts found for this project.")

    engine_ids = _get_engine_ids(sb)

    statuses: list[PromptFetchStatus] = []

    for prompt in prompts:
        prompt_id = prompt["id"]
        query_text = prompt["query_text"]
        engine_results: list[EngineResult] = []

        for engine_key, engine_name, fetcher in (
            ("gemini", "gemini", fetch_gemini_citations),
            ("openrouter_demo", "openrouter_demo", fetch_openrouter_citations),
        ):
            engine_id = engine_ids.get(engine_key)
            if not engine_id:
                engine_results.append(
                    EngineResult(engine=engine_key, status="error", message=f"Engine '{engine_key}' not seeded in DB.")
                )
                continue

            result = await fetcher(query_text)

            if result.status != "success":
                engine_results.append(
                    EngineResult(engine=engine_key, status=result.status, message=result.message)
                )
                continue

            try:
                raw_insert = (
                    sb.table("raw_responses")
                    .insert(
                        {
                            "prompt_id": prompt_id,
                            "engine_id": engine_id,
                            "raw_response": result.raw_response,
                            "answer_text": result.answer_text,
                            "brand_mentioned_in_answer": text_mentions_brand(result.answer_text),
                        }
                    )
                    .execute()
                )
                raw_response_id = raw_insert.data[0]["id"]

                if result.citations:
                    # Real citations only — checking simulated URLs' pages would
                    # tell us nothing about our actual brand's real-world presence.
                    real_urls = [c["url"] for c in result.citations if not c["is_simulated"]]
                    mentions_by_url = dict(
                        zip(real_urls, await check_brand_mentions(real_urls))
                    )

                    sb.table("citations").insert(
                        [
                            {
                                "prompt_id": prompt_id,
                                "engine_id": engine_id,
                                "url": c["url"],
                                "domain": c["domain"],
                                "is_simulated": c["is_simulated"],
                                "raw_response_id": raw_response_id,
                                "mentions_brand": mentions_by_url.get(c["url"]),
                            }
                            for c in result.citations
                        ]
                    ).execute()

                engine_results.append(
                    EngineResult(
                        engine=engine_key,
                        status="success",
                        citation_count=len(result.citations),
                    )
                )
            except Exception as exc:
                engine_results.append(
                    EngineResult(engine=engine_key, status="error", message=f"Supabase write failed: {exc}")
                )

        statuses.append(
            PromptFetchStatus(prompt_id=prompt_id, query_text=query_text, results=engine_results)
        )

    return FetchCitationsResponse(
        project_id=project_id, prompts_processed=len(statuses), statuses=statuses
    )
