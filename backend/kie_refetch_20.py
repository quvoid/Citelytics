"""One-off: fetch 20 real prompts through kie.ai's gpt-5-6-luna endpoint and
write them into the real production tables under the existing "chatgpt-kie"
engine, using the SAME classification/enrichment path tasks.py's real fetch
pipeline uses (classify_answer's hybrid logic+Gemini classifier,
enrich_citations for real cited_in_text checks) — not the stripped-down
excerpt-only version the earlier _kie_cost_test.py / _kie_backfill.py pair
used. Unlike that pair, this captures and stores the FULL answer text.

Deliberately skips ensure_domain_types (the one Gemini-calling step in the
citation-enrichment path) to protect Gemini's ~20/day free-tier quota for
classify_answer's per-prompt sentiment call, which is the more valuable use
of that budget here — a domain missing its `domain_type` label just shows as
uncategorized on the source-metrics page, nothing breaks.

Run: python kie_refetch_20.py
"""
import asyncio
import os
import sys
import time

import httpx
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))
load_dotenv()

import store  # noqa: E402
from brand_check import brand_keywords_for  # noqa: E402
from classifier import classify_answer  # noqa: E402
from clients.base import Citation, RawEngineResponse  # noqa: E402
from db import get_supabase  # noqa: E402
from normalize import extract_domain  # noqa: E402
from normalizer import enrich_citations  # noqa: E402

KIE_KEY = os.environ.get("kIE_API", "")
ENDPOINT = "https://api.kie.ai/codex/v1/responses"
ENGINE_NAME = "chatgpt-kie"
# Every prompt here spends real kie.ai credits (~0.33 each, measured), so the
# count is an argument rather than a constant to edit: `python kie_refetch_20.py 3`
# fetches three. Defaults to the original 20 when run with no argument.
COUNT = int(sys.argv[1]) if len(sys.argv) > 1 else 20
CONCURRENCY = 4
TIMEOUT = 120.0


def pick_project_id(sb) -> str:
    rows = sb.table("projects").select("id").limit(1).execute().data
    if not rows:
        raise SystemExit("No projects found.")
    return rows[0]["id"]


def pick_prompts(sb, project_id: str, count: int) -> list[dict]:
    """Any `count` active citation prompts — ordered by query_text for a
    deterministic, reviewable selection rather than DB insertion order."""
    return (
        sb.table("prompts")
        .select("id, project_id, query_text, topic, country")
        .eq("project_id", project_id)
        .eq("prompt_type", "citation")
        .eq("active", True)
        .order("query_text")
        .limit(count)
        .execute()
        .data
    )


async def call_kie(client: httpx.AsyncClient, prompt_text: str) -> RawEngineResponse:
    try:
        resp = await client.post(
            ENDPOINT,
            headers={"Authorization": f"Bearer {KIE_KEY}", "Content-Type": "application/json"},
            json={
                "model": "gpt-5-6-luna",
                "input": prompt_text,
                "tools": [{"type": "web_search"}],
                # Every page the model READ, not just what it cited inline —
                # OpenAI's own docs: "the number of sources is often greater
                # than the number of citations." Without this the response
                # only carries url_citation annotations, and "retrieved but
                # never referenced" is unrecoverable after the fact — see
                # engine-details.ts's parseOpenAI, which only trusts this data
                # when it sees this key actually present in the response.
                "include": ["web_search_call.action.sources"],
                "stream": False,
            },
            timeout=TIMEOUT,
        )
    except httpx.HTTPError as e:
        return RawEngineResponse(engine_name=ENGINE_NAME, status="error", message=str(e))

    if resp.status_code == 429:
        return RawEngineResponse(engine_name=ENGINE_NAME, status="rate_limited", message="kie.ai 429")
    if resp.status_code != 200:
        return RawEngineResponse(
            engine_name=ENGINE_NAME, status="error", message=f"HTTP {resp.status_code}: {resp.text[:300]}"
        )

    try:
        data = resp.json()
    except Exception as e:
        return RawEngineResponse(engine_name=ENGINE_NAME, status="error", message=f"bad json: {e}")

    output = data.get("output", [])
    answer_text = ""
    citation_urls: list[str] = []
    web_search_queries: list[str] = []
    for item in output:
        if item.get("type") == "web_search_call":
            action = item.get("action", {})
            web_search_queries.extend(action.get("queries") or ([action["query"]] if action.get("query") else []))
        if item.get("type") == "message":
            for c in item.get("content", []):
                if c.get("type") == "output_text":
                    answer_text += c.get("text", "")
                    for ann in c.get("annotations", []) or []:
                        if ann.get("type") == "url_citation" and ann.get("url"):
                            citation_urls.append(ann["url"])

    if not answer_text.strip():
        return RawEngineResponse(engine_name=ENGINE_NAME, status="error", message="empty answer")

    citations = [Citation(url=u, domain=extract_domain(u), is_simulated=False) for u in dict.fromkeys(citation_urls)]
    return RawEngineResponse(
        engine_name=ENGINE_NAME,
        status="success",
        raw_json=data,
        answer_text=answer_text,  # full text — no truncation
        citations=citations,
        web_search_queries=web_search_queries,
    )


async def main():
    if not KIE_KEY:
        print("No kIE_API key found in backend/.env — aborting.")
        return

    sb = get_supabase()
    project_id = pick_project_id(sb)
    prompts = pick_prompts(sb, project_id, COUNT)
    if not prompts:
        print("No active citation prompts found for this project.")
        return

    tracked = store.get_tracked_urls(project_id)
    own = next((t for t in tracked if not t["is_competitor"]), None)
    brand_keywords = brand_keywords_for(own)
    known_topics = store.get_topic_names(project_id)
    aliases = {t["name"]: t.get("aliases") or [] for t in tracked}
    brand_names = [t["name"] for t in tracked]

    print(f"Project {project_id} — {len(prompts)} prompts, engine={ENGINE_NAME}")

    sem = asyncio.Semaphore(CONCURRENCY)
    written, failed = [], []

    async def run_one(client: httpx.AsyncClient, prompt: dict, idx: int):
        async with sem:
            t0 = time.time()
            result = await call_kie(client, prompt["query_text"])
            if result.status != "success":
                failed.append((prompt["query_text"], result.message))
                print(f"[{idx+1}/{len(prompts)}] FAIL  {result.status}: {result.message}  — {prompt['query_text'][:60]}")
                return

            classification = await classify_answer(
                query_text=prompt["query_text"],
                answer_text=result.answer_text,
                brand_names=brand_names,
                own_brand_name=own["name"] if own else "",
                known_topics=known_topics,
                aliases=aliases,
            )
            if classification is None:
                # Gemini sentiment call itself failed (quota/rate limit) — still
                # store the real fetch with locally-computed fields rather than
                # dropping a real answer just because scoring couldn't run.
                from classifier import _logic_intent, _logic_is_branded_query, _logic_mentioned_brands, _logic_topic

                mentioned = _logic_mentioned_brands(result.answer_text or "", brand_names, aliases)
                classification = {
                    "mentioned_brands": mentioned,
                    "own_brand_sentiment": None,
                    "brand_sentiment": {},
                    "topic": _logic_topic(prompt["query_text"], known_topics),
                    "intent": _logic_intent(prompt["query_text"]),
                    "is_branded_query": _logic_is_branded_query(prompt["query_text"], brand_names, aliases),
                    "product_tags": [],
                    "other_brands_mentioned": [],
                }

            citation_rows = await enrich_citations(result.citations, brand_keywords)
            country = store.resolve_country(prompt)

            store.save_fetch_result(
                prompt_id=prompt["id"],
                project_id=project_id,
                engine_name=ENGINE_NAME,
                country=country,
                result=result,
                classification=classification,
                citation_rows=citation_rows,
                tracked=tracked,
            )
            written.append(prompt["query_text"])
            elapsed = round(time.time() - t0, 1)
            mentioned = classification["mentioned_brands"]
            print(
                f"[{idx+1}/{len(prompts)}] OK  {elapsed}s  "
                f"answer_chars={len(result.answer_text or '')}  citations={len(citation_rows)}  "
                f"mentioned={mentioned or '-'}  — {prompt['query_text'][:60]}"
            )

    async with httpx.AsyncClient() as client:
        await asyncio.gather(*(run_one(client, p, i) for i, p in enumerate(prompts)))

    print("\n" + "=" * 60)
    print(f"Written: {len(written)}/{len(prompts)}  Failed: {len(failed)}")
    if failed:
        for q, msg in failed:
            print(" -", q[:60], "|", (msg or "")[:150])


if __name__ == "__main__":
    asyncio.run(main())
