"""One-off: recomputes `raw_responses.answer_text` from the already-stored
`raw_response` JSON for rows fetched before the commentary/final_answer phase
split existed (see clients/kie_chatgpt_client.py's _final_answer_text). No
API call — pure DB read + write, zero cost.

Run: python _backfill_answer_text.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__) or ".")
from db import get_supabase


def final_answer_text(output: list[dict]) -> str:
    has_phase = any(i.get("type") == "message" and "phase" in i for i in output)
    text = ""
    for item in output:
        if item.get("type") != "message":
            continue
        if has_phase and item.get("phase") != "final_answer":
            continue
        for c in item.get("content", []):
            if c.get("type") == "output_text":
                text += c.get("text", "")
    return text


def main():
    sb = get_supabase()
    rows = (
        sb.table("raw_responses")
        .select("id, answer_text, raw_response")
        .not_.is_("raw_response", "null")
        .execute()
        .data
    )

    fixed = 0
    for r in rows:
        output = (r.get("raw_response") or {}).get("output")
        if not isinstance(output, list):
            continue
        new_text = final_answer_text(output)
        if not new_text.strip() or new_text == r["answer_text"]:
            continue
        sb.table("raw_responses").update({"answer_text": new_text}).eq("id", r["id"]).execute()
        fixed += 1
        print(f"fixed {r['id']}")

    print(f"\n{fixed}/{len(rows)} rows updated.")


if __name__ == "__main__":
    main()
