# Cost of Running 8,000 Prompts — Gemini vs ChatGPT

**Based on:** [ENGINE-APIS.md](./ENGINE-APIS.md) (prices verified against official docs 22 Aug 2026)
**Written:** 27 Aug 2026

> **Stale as of 28 Aug 2026 (round 4):** the "classifier call for every prompt" line below assumed
> Gemini scored `brand_sentiment` for every branded answer. That call is gone — sentiment now runs on
> a free local Hugging Face model (`backend/local_sentiment.py`), $0 and no quota, ever. Everywhere
> below that folds classifier cost into the Gemini total should now read "classifier cost: $0" instead;
> the fetch-call pricing (the engine actually generating the answer) is unaffected and still accurate.

This works out exactly what it costs to run a corpus of **8,000 tracked prompts**
against **Gemini** and **ChatGPT**, on four possible cron schedules, and whether
the results can be kept for 2 months on free-tier storage.

Every number below is a calculation from either (a) the official prices already
cited with sources in `ENGINE-APIS.md`, or (b) a clearly labeled **assumption**
(token counts, fan-out rate, row sizes) that ENGINE-APIS.md does not measure.
Swap the assumptions for real numbers once you've made a handful of live calls
and the rest of the math updates the same way.

---

## 0. What's actually being priced

Two different AI companies, so two different real model names — not "3.7" /
"5.6" as generic versions, but what this repo is actually configured to call:

| | Model | Where it's set |
|---|---|---|
| **Gemini** | `gemini-3.6-flash` | [config.py:18](../backend/config.py) — also used for the Gemini engine's grounded fetch **and** the classifier call for every prompt, on both engines |
| **ChatGPT** | `gpt-5.6-luna` (cheapest of the three GPT-5.6 tiers) | Not wired up yet — today's ChatGPT stand-in is OpenRouter's `gpt-4o-mini` ([config.py:40](../backend/config.py)), which is blocked (out of credits, per ENGINE-APIS.md §9). This calc prices the real direct-OpenAI integration described in ENGINE-APIS.md §4/§10. |

**Reading "8,000 prompts":** the app's fetch pipeline runs every active prompt
against every connected engine each cycle ([tasks.py](../backend/tasks.py) —
one task per `prompt × engine`). So one "run" of the 8,000-prompt corpus means:

- **8,000 Gemini grounded-answer calls**
- **8,000 ChatGPT grounded-answer calls**
- **16,000 Gemini classifier calls** — one per answer produced, *from either
  engine*, because `classifier.py` always classifies via Gemini regardless of
  which engine wrote the answer. This means every ChatGPT run still adds to
  the **Gemini** bill, not the OpenAI bill.

---

## 1. Assumptions (label: not measured yet)

ENGINE-APIS.md is explicit that real payloads have only been captured for
Gemini — OpenAI's shape is documentation-only. So per-call token counts here
are reasonable estimates for a short brand-visibility Q&A, not measured
averages. Two fan-out scenarios are carried through everything below, because
that's the single biggest cost lever per ENGINE-APIS.md §8's own warning.

| Assumption | Value | Why |
|---|---|---|
| Grounded-answer input tokens | 300 | short prompt + system instructions |
| Grounded-answer output tokens | 350 | ~250-word answer |
| Classifier input tokens | 500 | answer text + schema + brand/topic lists |
| Classifier output tokens | 120 | compact structured JSON, no grounding |
| OpenAI page-content read, per search | 700 input tokens | "the page content it reads billed as normal input tokens" — ENGINE-APIS.md §4 |
| **Low fan-out** | 1 search per prompt | floor case, no re-querying |
| **High fan-out** | 6 searches per prompt | ENGINE-APIS.md §8's own **real measured average** |

---

## 2. Per-call cost (the building block)

Prices from ENGINE-APIS.md §3/§4, at today's intro rate (Gemini 3.6 Flash's
discounted rate runs through 31 Dec 2026).

| Call | Input | Output | Token cost | Search/tool cost |
|---|---|---|---|---|
| Gemini grounded fetch | 300 tok × $0.75/1M | 350 tok × $3.75/1M | **$0.001538** | $0.014 × searches/prompt |
| Gemini classifier | 500 tok × $0.75/1M | 120 tok × $3.75/1M | **$0.000825** | — (ungrounded) |
| ChatGPT (gpt-5.6-luna) fetch | 300 tok × $0.20/1M | 350 tok × $1.20/1M | **$0.00048** | $0.01 × searches/prompt + (700 tok × searches × $0.20/1M) |

Per-prompt totals:

| | Low fan-out (1 search) | High fan-out (6 searches) |
|---|---|---|
| **Gemini engine call** | $0.001538 + $0.014 = **$0.01554** | $0.001538 + $0.084 = **$0.08554** |
| **Gemini classifier call** | **$0.000825** (flat, no fan-out) | **$0.000825** |
| **ChatGPT engine call** | $0.00048 + $0.01 + $0.00014 = **$0.01062** | $0.00048 + $0.06 + $0.00084 = **$0.06130** |

---

## 3. One full run of the 8,000-prompt corpus

8,000 Gemini calls + 8,000 ChatGPT calls + 16,000 classifier calls (8,000 for
each engine's answers).

| Vendor bill | Low fan-out | High fan-out |
|---|---|---|
| **Gemini** = 8,000 × $0.01554 (engine) + 16,000 × $0.000825 (classifier, both engines) | 8,000 × 0.01554 = $124.30 + 16,000 × 0.000825 = $13.20 → **$137.50** | 8,000 × 0.08554 = $684.30 + $13.20 → **$697.50** |
| **OpenAI** = 8,000 × ChatGPT engine call | **$84.96** | **$490.40** |
| **Combined, one run** | **$222.46** | **$1,187.90** |

That's **$0.0106–$0.0871 per prompt** on Gemini and **$0.0106–$0.0613 per
prompt** on ChatGPT, all-in.

> Gemini's paid tier includes 5,000 grounding searches/month before the
> $14/1,000 rate applies. At this volume (8,000+ prompts per run) that
> allowance is a rounding error — worth ≤$70/month credit, under 1% of any
> total below — so it's noted but not threaded through every cell.
>
> The free tier (500 grounded requests/day on paper) is irrelevant here
> regardless: `classifier.py`'s own comment records the **real observed**
> daily cap as 20 requests/day, and ENGINE-APIS.md §9 confirms grounded calls
> currently 429 persistently even inside the documented allowance. Budget
> paid billing from the start.

---

## 4. Cost by cron schedule

Runs/month assume a 30-day month; 2-month = 61 days. One run = the full
8,000-prompt corpus re-queried against both engines.

| Cadence | Runs/mo | Runs/2mo | **Monthly (low)** | **Monthly (high)** | **2-month (low)** | **2-month (high)** |
|---|---:|---:|---:|---:|---:|---:|
| **Daily** | 30 | 60 | $6,673.80 | $35,637.00 | $13,347.60 | $71,274.00 |
| **Every 2 days** | 15 | 30 | $3,336.90 | $17,818.50 | $6,673.80 | $35,637.00 |
| **Every 3 days** | 10 | 20 | $2,224.60 | $11,879.00 | $4,449.20 | $23,758.00 |
| **Weekly** | 4.29 | 8.57 | $953.40 | $5,091.00 | $1,906.80 | $10,182.00 |

Split by vendor (2-month, since that's the horizon you asked about):

| Cadence | Gemini (low) | Gemini (high) | OpenAI (low) | OpenAI (high) |
|---|---:|---:|---:|---:|
| Daily | $8,250.00 | $41,850.00 | $5,097.60 | $29,424.00 |
| Every 2 days | $4,125.00 | $20,925.00 | $2,548.80 | $14,712.00 |
| Every 3 days | $2,750.00 | $13,950.00 | $1,699.20 | $9,808.00 |
| Weekly | $1,178.57 | $5,978.57 | $728.23 | $4,203.43 |

**Read this as:** the fan-out assumption (1 vs 6 searches/prompt) swings the
total by **~5.3×**. That single number — how many mini-searches a real prompt
actually fires — matters more than which cadence you pick. Measure it from a
handful of real calls before committing to a schedule.

---

## 5. Can 2 months of this data fit on a free storage plan?

Two separate "free plan" questions — your own database (Supabase), and
whether the AI vendors themselves are a place to keep this data. Short
answer to both: **no.**

### 5a. Your own database (Supabase free tier)

Confirmed from [supabase.com/pricing](https://supabase.com/pricing): the
Free plan caps out at **500 MB database size**, 1 GB file storage, and pauses
the project after **1 week of inactivity** (not a risk here since it'd be
running constantly).

Every fetch writes the AI's **entire raw API response** verbatim —
[store.py:157](../backend/store.py) inserts `result.raw_json` into
`raw_responses.raw_response jsonb`, not a trimmed summary — plus one row per
citation in the `citations` table
([0001_init.sql](../supabase/migrations/0001_init.sql)).

| Row type | Assumption | Why |
|---|---|---|
| `raw_responses` (Gemini) | ~7 KB | full payload: `webSearchQueries[]`, `groundingChunks[]`, `groundingSupports[]` (doc's real captured example had 23 of these), `usageMetadata`, answer text |
| `raw_responses` (OpenAI) | ~9 KB | larger once `web_search_call.action.sources` is opted in (§10 recommendation #7) — that's the whole point of adding it |
| `citations` rows | ~350 bytes each | Gemini ~8 cited domains/prompt, OpenAI ~15 once read-but-not-used sources are captured |
| Index/TOAST overhead | ×1.4 | Postgres counts indexes toward the 500 MB quota too — `citations` alone carries 3 |

**Per prompt, both engines, indexed: ~15–34 KB.** Per full 8,000-prompt run:
**~120–265 MB.**

| Cadence | 2-month storage (low estimate) | 2-month storage (high estimate) | vs. 500 MB free cap |
|---|---:|---:|---|
| Daily | 7.2 GB | 15.8 GB | **14–32× over** |
| Every 2 days | 3.6 GB | 7.9 GB | **7–16× over** |
| Every 3 days | 2.4 GB | 5.3 GB | **5–11× over** |
| Weekly | ~1.03 GB | 2.26 GB | **2–4.5× over** |

Even the gentlest combination — weekly cadence, lean payload estimate —
still needs **twice** the free tier's 500 MB. A single run at the richer
estimate (~265 MB) is already more than half the entire free-tier database on
its own. There's no cadence in your list that fits 2 months of 8,000-prompt
data on Supabase's free plan; you'd need the Pro tier (or to prune/aggregate
old raw payloads instead of keeping them all).

### 5b. The AI vendors' own "free" data retention

Neither company offers this as a place to durably keep 2 months of results —
they're not a database, and their retention policies point the other way:

- **Gemini free tier** ([ai.google.dev/gemini-api/terms](https://ai.google.dev/gemini-api/terms)):
  no fixed retention window is published; Google may use free-tier
  prompts/responses "to provide, improve, and develop" its products, with
  human review possible. Paid tier is the opposite — Google does **not** use
  paid data to improve products, and only logs it briefly (the terms name
  **30 days** for grounding debugging/abuse detection) before discarding it.
- **OpenAI**: **no free tier at all** for the API (confirmed — ENGINE-APIS.md
  §4 and OpenAI's own data-controls docs). Whatever tier you're on, API data
  isn't used for training by default, and abuse-monitoring logs are kept
  "up to 30 days," not 2 months.

Practical takeaway: the 2-month retention has to live in your own Supabase
(or wherever you land after outgrowing free tier) — neither vendor is going
to hold it for you either.

---

## 6. What to verify before trusting this for budgeting

1. **Real fan-out per prompt**, both engines — the single biggest lever
   (§4's 5.3× swing). Log `webSearchQueries.length` (Gemini) and
   `web_search_call` count (OpenAI) on your next handful of live calls.
2. **Real average answer length** — swap the 300/350-token assumption for
   your actual `usageMetadata` once Gemini grounded calls are unblocked
   (ENGINE-APIS.md §9/§10 recommendation #1: enable billing on the Google
   Cloud project first).
3. **Real `raw_response` row size** — `select pg_column_size(raw_response)
   from raw_responses` against your existing rows gives an exact number
   instead of the ~7–9 KB estimate above.
4. **Which GPT-5.6 tier** you actually want — this used `gpt-5.6-luna`
   (cheapest). Swapping to `gpt-5.6-terra` multiplies the OpenAI columns by
   ~10×, `gpt-5.6-sol` by ~20×.

---

## Sources

Same as ENGINE-APIS.md §3/§4 (pricing), plus:
- [Supabase pricing](https://supabase.com/pricing) — Free plan limits
- [Gemini API terms](https://ai.google.dev/gemini-api/terms) — free vs. paid data usage
- [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data) — retention, no free tier
