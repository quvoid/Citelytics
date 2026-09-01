"""Backfills today's real kie.ai test results (ChatGPT gpt-5.6-luna and
Gemini 3.6 Flash, both via kie.ai) into the real production tables
(raw_responses / citations / answer_brand_mentions), under two new engine
rows ("gemini-kie", "chatgpt-kie") — so the Prompts page shows real numbers
for prompts that can't be fetched right now (Gemini direct: 429 quota;
OpenRouter: out of credits; kie.ai itself: also out of credits as of this
run, hence backfilling from data already captured rather than fetching more).

Known, deliberate limitations of this backfilled data (real, just partial):
- raw_response stores the SUMMARY object the test scripts saved, not the
  original full kie.ai API envelope (that wasn't persisted for the bulk runs).
- answer_text is the ~400-char excerpt the test scripts captured, not the
  full multi-paragraph answer.
- Gemini citations only had domain-ish titles saved (e.g. "livemint.com"),
  not the real vertexaisearch redirect URIs, so their url is reconstructed
  as https://{title} — a real domain, not the exact clickable citation link.
- No real sentiment scores (own_brand_sentiment / brand_sentiment are null)
  — the logic-only classifier doesn't score sentiment, and getting real
  scores needs an LLM call, which is blocked (Gemini direct) or out of
  credits (kie.ai) right now.

Run: python _kie_backfill.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from db import get_supabase  # noqa: E402
from clients.base import Citation, RawEngineResponse  # noqa: E402
from normalize import extract_domain  # noqa: E402
import store  # noqa: E402

PROJECT_ID = "34912a34-c5c7-4fe3-ac3b-e76b2560fcd3"  # Motorola
COUNTRY = "IN"

CHATGPT_RESULTS = r"C:\Users\omkar\AppData\Local\Temp\claude\C--Users-omkar-OneDrive-Desktop-Citelytics\5e25f1a1-73f9-4970-bfa7-09ad89c359b1\scratchpad\kie_results.json"
GEMINI_RESULTS = r"C:\Users\omkar\OneDrive\Desktop\Citelytics\frontend\data\kie-gemini-cost-test.json"


def ensure_engine(sb, name: str) -> str:
    existing = sb.table("engines").select("id").eq("name", name).execute().data
    if existing:
        return existing[0]["id"]
    row = sb.table("engines").insert({"name": name}).execute().data[0]
    return row["id"]


def build_classification(logic: dict) -> dict:
    return {
        "mentioned_brands": logic["mentioned_brands"],
        "own_brand_sentiment": None,
        "brand_sentiment": {},
        "topic": logic.get("topic"),
        "intent": logic.get("intent"),
        "is_branded_query": logic.get("is_branded_query", False),
        "product_tags": [],
    }


def main():
    sb = get_supabase()

    chatgpt_engine_id = ensure_engine(sb, "chatgpt-kie")
    gemini_engine_id = ensure_engine(sb, "gemini-kie")
    print(f"engines: chatgpt-kie={chatgpt_engine_id}  gemini-kie={gemini_engine_id}")

    # Bust store.engine_ids()'s lru_cache — it already ran (with the old
    # engine list) the moment store.py was imported transitively above.
    store.engine_ids.cache_clear()

    prompts = sb.table("prompts").select("id, query_text").eq("project_id", PROJECT_ID).execute().data
    prompt_by_text = {p["query_text"].strip().lower(): p["id"] for p in prompts}

    tracked = sb.table("tracked_urls").select("*").eq("project_id", PROJECT_ID).execute().data

    def backfill(results_path: str, engine_name: str, is_gemini: bool):
        with open(results_path, encoding="utf-8") as f:
            rows = json.load(f)

        written, skipped_no_prompt, skipped_empty = 0, 0, 0
        for r in rows:
            if not r.get("ok"):
                continue
            if is_gemini and not r.get("answer_len_chars"):
                skipped_empty += 1
                continue

            prompt_id = prompt_by_text.get(r["prompt"].strip().lower())
            if not prompt_id:
                skipped_no_prompt += 1
                continue

            if is_gemini:
                answer_text = r.get("answer_excerpt", "")
                citation_urls = [f"https://{title}" for title in (r.get("citations") or []) if title]
                web_search_queries = r.get("search_queries") or []
            else:
                answer_text = r.get("answer_excerpt", "")
                citation_urls = [u for u in (r.get("citations") or []) if u]
                web_search_queries = []

            citations = [
                Citation(url=u, domain=extract_domain(u), is_simulated=False) for u in citation_urls
            ]

            result = RawEngineResponse(
                engine_name=engine_name,
                status="success",
                raw_json=r,  # the summary object captured by the test script — see module docstring
                answer_text=answer_text,
                citations=citations,
                web_search_queries=web_search_queries,
            )
            classification = build_classification(r.get("logic_classification") or {})
            citation_rows = [{"url": c.url, "domain": c.domain, "is_simulated": c.is_simulated} for c in citations]

            store.save_fetch_result(
                prompt_id=prompt_id,
                engine_name=engine_name,
                country=COUNTRY,
                result=result,
                classification=classification,
                citation_rows=citation_rows,
                tracked=tracked,
            )
            written += 1

        print(f"{engine_name}: written={written} skipped_no_prompt_match={skipped_no_prompt} skipped_empty={skipped_empty}")

    backfill(CHATGPT_RESULTS, "chatgpt-kie", is_gemini=False)
    backfill(GEMINI_RESULTS, "gemini-kie", is_gemini=True)


if __name__ == "__main__":
    main()
