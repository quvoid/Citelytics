"""One-off script: run N real prompts through kie.ai's gpt-5-6-luna endpoint,
record the REAL credits_consumed/usage kie.ai returns per call, and classify
each answer with the new logic-only classifier (no Gemini calls at all).

Not part of the app — a throwaway measurement script for the cost doc.
Run: python _kie_cost_test.py
"""
import asyncio
import json
import os
import sys
import time

import httpx
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))
load_dotenv()

from classifier import _logic_intent, _logic_is_branded_query, _logic_mentioned_brands, _logic_topic  # noqa: E402

KIE_KEY = os.environ.get("kIE_API", "")
ENDPOINT = "https://api.kie.ai/codex/v1/responses"
BRANDS = ["Motorola", "Samsung", "OnePlus", "Xiaomi", "Google", "Apple", "Vivo", "Oppo", "Realme", "Nothing", "iQOO"]
OWN_BRAND = "Motorola"
CONCURRENCY = 4
TIMEOUT = 120.0

PROMPTS_FILE = r"C:\Users\omkar\AppData\Local\Temp\claude\C--Users-omkar-OneDrive-Desktop-Citelytics\5e25f1a1-73f9-4970-bfa7-09ad89c359b1\scratchpad\kie_prompts_raw.txt"


def load_prompts(path: str) -> list[str]:
    with open(path, encoding="utf-8") as f:
        lines = [ln.strip() for ln in f if ln.strip()]
    seen, out = set(), []
    for ln in lines:
        key = ln.lower()
        if key not in seen:
            seen.add(key)
            out.append(ln)
    return out[:100]


async def call_kie(client: httpx.AsyncClient, prompt: str) -> dict:
    t0 = time.time()
    try:
        resp = await client.post(
            ENDPOINT,
            headers={"Authorization": f"Bearer {KIE_KEY}", "Content-Type": "application/json"},
            json={
                "model": "gpt-5-6-luna",
                "input": prompt,
                "tools": [{"type": "web_search"}],
                "stream": False,
            },
            timeout=TIMEOUT,
        )
    except httpx.HTTPError as e:
        return {"prompt": prompt, "ok": False, "error": str(e), "elapsed": time.time() - t0}

    elapsed = time.time() - t0
    if resp.status_code != 200:
        return {"prompt": prompt, "ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:300]}", "elapsed": elapsed}

    try:
        data = resp.json()
    except Exception as e:
        return {"prompt": prompt, "ok": False, "error": f"bad json: {e}", "elapsed": elapsed}

    output = data.get("output", [])
    answer_text = ""
    citations = []
    search_calls = 0
    search_queries_total = 0
    for item in output:
        if item.get("type") == "web_search_call":
            search_calls += 1
            action = item.get("action", {})
            search_queries_total += len(action.get("queries", [])) or (1 if action.get("query") else 0)
        if item.get("type") == "message":
            for c in item.get("content", []):
                if c.get("type") == "output_text":
                    answer_text += c.get("text", "")
                    for ann in c.get("annotations", []) or []:
                        if ann.get("type") == "url_citation":
                            citations.append(ann.get("url"))

    usage = data.get("usage", {})
    mentioned = _logic_mentioned_brands(answer_text, BRANDS)

    return {
        "prompt": prompt,
        "ok": True,
        "elapsed": round(elapsed, 1),
        "credits_consumed": data.get("credits_consumed"),
        "usage": usage,
        "search_calls": search_calls,
        "search_queries_total": search_queries_total,
        "citation_count": len(citations),
        "citations": citations[:10],
        "answer_len_chars": len(answer_text),
        "answer_excerpt": answer_text[:400],
        "logic_classification": {
            "mentioned_brands": mentioned,
            "is_branded_query": _logic_is_branded_query(prompt, BRANDS),
            "intent": _logic_intent(prompt),
            "topic": _logic_topic(prompt, ["Foldable Phones", "Camera Phones", "Gaming Phones", "Budget Phones", "Premium Phones", "Durability"]),
        },
    }


async def main():
    if not KIE_KEY:
        print("No kIE_API key found in backend/.env — aborting.")
        return

    prompts = load_prompts(PROMPTS_FILE)
    print(f"Loaded {len(prompts)} unique prompts. Running with concurrency={CONCURRENCY}...")

    sem = asyncio.Semaphore(CONCURRENCY)
    results = []

    async def bound_call(client, p, idx):
        async with sem:
            r = await call_kie(client, p)
            status = "OK" if r["ok"] else "FAIL"
            credits = r.get("credits_consumed", "-")
            print(f"[{idx+1}/{len(prompts)}] {status}  credits={credits}  {p[:60]}")
            return r

    async with httpx.AsyncClient() as client:
        tasks = [bound_call(client, p, i) for i, p in enumerate(prompts)]
        results = await asyncio.gather(*tasks)

    out_path = os.path.join(os.path.dirname(PROMPTS_FILE), "kie_results.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    ok = [r for r in results if r["ok"]]
    failed = [r for r in results if not r["ok"]]
    total_credits = sum(r["credits_consumed"] or 0 for r in ok)
    total_in = sum(r["usage"].get("input_tokens", 0) for r in ok)
    total_out = sum(r["usage"].get("output_tokens", 0) for r in ok)
    total_search_calls = sum(r["search_calls"] for r in ok)
    total_search_queries = sum(r["search_queries_total"] for r in ok)
    brand_mentions = sum(1 for r in ok if r["logic_classification"]["mentioned_brands"])

    print("\n" + "=" * 60)
    print(f"Completed: {len(ok)} ok, {len(failed)} failed, out of {len(prompts)}")
    print(f"Total credits consumed: {total_credits:.3f}")
    print(f"Avg credits/prompt: {(total_credits/len(ok)):.4f}" if ok else "n/a")
    print(f"Total input tokens: {total_in:,}  |  Total output tokens: {total_out:,}")
    print(f"Total web_search_call actions: {total_search_calls}  |  total underlying queries: {total_search_queries}")
    print(f"Prompts where a tracked brand was mentioned: {brand_mentions}/{len(ok)}")
    if failed:
        print("\nFailures:")
        for r in failed:
            print(" -", r["prompt"][:60], "|", r["error"][:150])
    print(f"\nFull results written to: {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
