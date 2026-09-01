"""Repairs the 168 answers whose stored `answer_text` is only a 400-char
excerpt, by restoring the brand mentions that were originally derived from
the FULL answer text.

Why this is needed
------------------
`_kie_cost_test.py` / `_kie_gemini_cost_test.py` classified each answer
against its complete text (2,000-4,000 chars) but persisted only
`answer_excerpt = answer_text[:400]`. `_kie_backfill.py` then wrote the
full-text-derived mention rows alongside that truncated text. So the DB has
correct mentions paired with text that cannot justify them.

Re-scoring those rows from the stored text therefore LOSES real mentions —
which is exactly what a full re-classify pass did (Vivo fell 84 -> 46). This
script puts the full-text mentions back, reading them from the JSON the cost
scripts wrote, which still carry `logic_classification.mentioned_brands`.

It also applies the alias mapping those runs lacked: their hardcoded brand
list treated **iQOO as its own brand** rather than as Vivo's sub-brand, so 23
answers naming an iQOO model credited nobody.

Honesty rules this script keeps
-------------------------------
* `mentioned` / `position` come from the full text — authoritative.
* `sentiment_score` is set ONLY when the brand actually appears in the text we
  still have. If a brand was named past character 400, its sentiment is
  genuinely unknowable now, and null is the correct value, not a guess made
  from an excerpt that never mentions it.
* Only rows whose answer_text is exactly 400 chars are touched. The 20
  ChatGPT answers re-fetched later (real full text) are left alone.

Run: python restore_fulltext_mentions.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import store  # noqa: E402
from classifier import _logic_mentioned_brands  # noqa: E402
from db import get_supabase  # noqa: E402
from local_sentiment import score_brand_sentiment  # noqa: E402

PROJECT_ID = "34912a34-c5c7-4fe3-ac3b-e76b2560fcd3"
CLASSIFIER_VERSION = "abm-fulltext-restored-v1"

SOURCES = [
    (
        r"C:\Users\omkar\AppData\Local\Temp\claude\C--Users-omkar-OneDrive-Desktop-Citelytics\5e25f1a1-73f9-4970-bfa7-09ad89c359b1\scratchpad\kie_results.json",
        "chatgpt-kie",
    ),
    (
        r"C:\Users\omkar\OneDrive\Desktop\Citelytics\frontend\data\kie-gemini-cost-test.json",
        "gemini-kie",
    ),
]

# Deliberately EMPTY. iQOO was briefly folded into Vivo here on the reasoning
# that it is Vivo-owned; that was wrong for this product's purpose. iQOO is
# marketed, priced and sold as its own brand in India and competes on its own,
# so crediting Vivo for an iQOO recommendation overstates Vivo's visibility and
# hides a real competitor. Ownership is not the test — how the market treats
# the brand is. Track iQOO as its own tracked_url instead.
#
# Genuine product LINES (Galaxy, Nord, Reno, Moto, Razr) do belong in their
# parent's aliases, and remain there; the distinction is line vs. brand.
SUBBRAND_TO_TRACKED: dict[str, str] = {}


def main() -> None:
    sb = get_supabase()

    tracked = store.get_tracked_urls(PROJECT_ID)
    by_name = {t["name"].lower(): t for t in tracked}
    aliases = {t["name"]: t.get("aliases") or [] for t in tracked}

    prompts = (
        sb.table("prompts").select("id, query_text").eq("project_id", PROJECT_ID).execute().data or []
    )
    prompt_id_by_text = {p["query_text"].strip().lower(): p["id"] for p in prompts}

    engine_id = store.engine_ids()

    total_rows, touched, skipped_intact, unmatched = 0, 0, 0, 0

    for path, engine_name in SOURCES:
        if not os.path.exists(path):
            print(f"!! missing source file, skipping: {path}")
            continue
        with open(path, encoding="utf-8") as f:
            records = json.load(f)

        eid = engine_id.get(engine_name)
        if not eid:
            print(f"!! no engine row named {engine_name}")
            continue

        for rec in records:
            if not rec.get("ok"):
                continue
            cls = rec.get("logic_classification") or {}
            full_mentions = cls.get("mentioned_brands") or []
            prompt_id = prompt_id_by_text.get((rec.get("prompt") or "").strip().lower())
            if not prompt_id:
                unmatched += 1
                continue

            rows = (
                sb.table("raw_responses")
                .select("id, answer_text")
                .eq("prompt_id", prompt_id)
                .eq("engine_id", eid)
                .execute()
                .data
                or []
            )
            for row in rows:
                text = row.get("answer_text") or ""
                # Only repair the truncated ones — a later real full-text
                # fetch of the same prompt/engine must not be clobbered.
                if len(text) != 400:
                    skipped_intact += 1
                    continue

                # Fold the full-text brand list down to tracked brands, keeping
                # first-mention order so `position` stays meaningful.
                ordered: list[str] = []
                for name in full_mentions:
                    canon = SUBBRAND_TO_TRACKED.get(name.lower(), name)
                    t = by_name.get(canon.lower())
                    if t and t["name"] not in ordered:
                        ordered.append(t["name"])

                # Sentiment only for brands actually present in the text we
                # still hold — see module docstring.
                visible = _logic_mentioned_brands(text, [t["name"] for t in tracked], aliases)
                sentiment = score_brand_sentiment(text, visible, aliases) if visible else {}

                payload = []
                for t in tracked:
                    named = t["name"] in ordered
                    payload.append(
                        {
                            "raw_response_id": row["id"],
                            "tracked_url_id": t["id"],
                            "mentioned": named,
                            "position": (ordered.index(t["name"]) + 1) if named else None,
                            "sentiment_score": sentiment.get(t["name"]),
                            "classifier_version": CLASSIFIER_VERSION,
                        }
                    )
                sb.table("answer_brand_mentions").upsert(
                    payload, on_conflict="raw_response_id,tracked_url_id"
                ).execute()
                total_rows += len(payload)
                touched += 1

    print(f"answers repaired: {touched}")
    print(f"mention rows written: {total_rows}")
    print(f"skipped (already full text): {skipped_intact}")
    print(f"records with no matching prompt: {unmatched}")


if __name__ == "__main__":
    main()
