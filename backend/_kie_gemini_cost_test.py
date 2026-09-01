"""Same idea as _kie_cost_test.py but for Gemini 3.6 Flash through kie.ai's
proxy. Requires stream:true — confirmed live that stream:false silently
drops grounding on kie.ai's Gemini endpoint, so this parses their SSE body.

Run: python _kie_gemini_cost_test.py
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
ENDPOINT = "https://api.kie.ai/gemini/v1/models/gemini-3-6-flash:streamGenerateContent"
BRANDS = ["Motorola", "Samsung", "OnePlus", "Xiaomi", "Google", "Apple", "Vivo", "Oppo", "Realme", "Nothing", "iQOO"]
CONCURRENCY = 1  # concurrency=4 silently truncated ~93/100 responses to empty
# bodies (200 OK, zero tokens, credits_consumed missing) — kie.ai rate-limiting
# the Gemini streaming endpoint under burst load, not a real failure. Serial
# calls avoid it.
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


def parse_sse(body: str) -> list[dict]:
    events = []
    for line in body.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        payload = line[len("data:"):].strip()
        if payload == "[DONE]" or not payload:
            continue
        try:
            events.append(json.loads(payload))
        except json.JSONDecodeError:
            continue
    return events


async def call_kie_gemini(client: httpx.AsyncClient, prompt: str) -> dict:
    t0 = time.time()
    try:
        resp = await client.post(
            ENDPOINT,
            headers={"Authorization": f"Bearer {KIE_KEY}", "Content-Type": "application/json"},
            json={
                "stream": True,
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "tools": [{"googleSearch": {}}],
            },
            timeout=TIMEOUT,
        )
    except httpx.HTTPError as e:
        return {"prompt": prompt, "ok": False, "error": str(e), "elapsed": time.time() - t0}

    elapsed = time.time() - t0
    if resp.status_code != 200:
        return {"prompt": prompt, "ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:300]}", "elapsed": elapsed}

    events = parse_sse(resp.text)
    answer_text = ""
    grounding = {}
    usage = {}
    credits_consumed = None
    for ev in events:
        cands = ev.get("candidates", [])
        if cands:
            content = cands[0].get("content", {})
            for part in content.get("parts", []):
                if "text" in part:
                    answer_text += part["text"]
            gm = cands[0].get("groundingMetadata")
            if gm:
                grounding = gm
        if "usageMetadata" in ev:
            usage = ev["usageMetadata"]
        if "credits_consumed" in ev:
            credits_consumed = ev["credits_consumed"]

    mentioned = _logic_mentioned_brands(answer_text, BRANDS)
    chunks = grounding.get("groundingChunks", [])

    # A 200 with zero events/empty body is kie.ai rate-limiting the stream,
    # not a real answer — surface it as a failure instead of a $0, 0-token
    # "success" that silently drags the average down.
    if not events or (not answer_text and not usage):
        return {
            "prompt": prompt, "ok": False,
            "error": f"Empty/throttled response ({len(events)} SSE events, no text or usage)",
            "elapsed": round(elapsed, 1),
        }

    return {
        "prompt": prompt,
        "ok": True,
        "elapsed": round(elapsed, 1),
        "credits_consumed": credits_consumed,
        "usage": usage,
        "search_queries": grounding.get("webSearchQueries", []),
        "grounding_chunk_count": len(chunks),
        "citations": [c.get("web", {}).get("title") for c in chunks][:10],
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
        print("No kIE_API key found — aborting.")
        return

    prompts = load_prompts(PROMPTS_FILE)
    print(f"Loaded {len(prompts)} unique prompts. Running against Gemini 3.6 Flash via kie.ai, concurrency={CONCURRENCY}...")

    sem = asyncio.Semaphore(CONCURRENCY)

    async def bound_call(client, p, idx):
        async with sem:
            r = await call_kie_gemini(client, p)
            status = "OK" if r["ok"] else "FAIL"
            credits = r.get("credits_consumed", "-")
            print(f"[{idx+1}/{len(prompts)}] {status}  credits={credits}  {p[:60]}")
            return r

    async with httpx.AsyncClient() as client:
        tasks = [bound_call(client, p, i) for i, p in enumerate(prompts)]
        results = await asyncio.gather(*tasks)

    out_path = os.path.join(os.path.dirname(PROMPTS_FILE), "kie_gemini_results.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    ok = [r for r in results if r["ok"]]
    failed = [r for r in results if not r["ok"]]
    total_credits = sum(r["credits_consumed"] or 0 for r in ok)
    total_in = sum(r["usage"].get("promptTokenCount", 0) for r in ok)
    total_out = sum(r["usage"].get("candidatesTokenCount", 0) for r in ok)
    total_thoughts = sum(r["usage"].get("thinkingTokenCount", r["usage"].get("thoughtsTokenCount", 0)) for r in ok)
    total_queries = sum(len(r["search_queries"]) for r in ok)
    brand_mentions = sum(1 for r in ok if r["logic_classification"]["mentioned_brands"])
    grounded = sum(1 for r in ok if r["grounding_chunk_count"] > 0)

    print("\n" + "=" * 60)
    print(f"Completed: {len(ok)} ok, {len(failed)} failed, out of {len(prompts)}")
    print(f"Grounded (had real citations): {grounded}/{len(ok)}")
    print(f"Total credits consumed: {total_credits:.3f}")
    print(f"Avg credits/prompt: {(total_credits/len(ok)):.4f}" if ok else "n/a")
    print(f"Total prompt tokens: {total_in:,} | candidate tokens: {total_out:,} | thinking tokens: {total_thoughts:,}")
    print(f"Total search queries: {total_queries}")
    print(f"Prompts where a tracked brand was mentioned: {brand_mentions}/{len(ok)}")
    if failed:
        print("\nFailures:")
        for r in failed:
            print(" -", r["prompt"][:60], "|", r["error"][:150])
    print(f"\nFull results written to: {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
