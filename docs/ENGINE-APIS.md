# AI Answer Engine APIs — What We Can Get, and What It Costs

**Last verified: 22 August 2026.** Every price and field name below was read
directly from the official documentation on that date, with source links at the
end of each section. Prices change often — re-check before budgeting.

---

## 1. What this document is for

Citelytics answers one question: **when someone asks an AI a question, does our
brand get mentioned, and which websites did the AI read to decide that?**

To answer it we call the AI companies' APIs directly. Each company sends back a
bundle of data with its answer — that bundle is called the **payload**. This
document records exactly what each company puts in that bundle, what it costs,
and which parts are useful to us.

### The five words you need

| Term | Plain meaning |
|---|---|
| **Payload** | The full package of data the AI sends back, not just the visible answer. |
| **Grounding / web search** | The AI going out and reading live web pages before answering, instead of relying on memory. |
| **Citation** | A website the AI actually credited in its answer. |
| **Fan-out** | The hidden mini-searches the AI runs before answering. Ask "best camera phone under 40000" and it may quietly search seven different things first. |
| **Token** | Roughly ¾ of a word. APIs charge per million tokens in and out. |

### The single most valuable distinction

Every engine gives you a list of websites it **cited**. Only some tell you the
websites it **read but chose not to use**.

That gap matters commercially. If a competitor's page was read and used, they
won. If our page was read and *not* used, our content was seen and judged
insufficient — a completely different, and more fixable, problem than never
being found at all.

---

## 2. Quick comparison

| | Gemini | OpenAI | Perplexity | Grok (xAI) | DataForSEO |
|---|---|---|---|---|---|
| Shows the hidden mini-searches | ✅ Full text | ✅ Full text | ⚠️ Count only | ❌ | ✅ |
| Lists cited websites | ✅ | ✅ | ✅ | ✅ | ✅ |
| Lists read-but-not-used sites | ❌ | ✅ (opt-in) | ❌ | ✅ **by default** | ✅ |
| Links each sentence to its sources | ✅ | ✅ | ❌ | ✅ | ✅ |
| Publication dates of sources | ❌ | ❌ | ✅ **only one** | ❌ | ❌ |
| Reports its own cost per call | ❌ | ❌ | ✅ **only one** | ❌ | ✅ |
| Free allowance | Some | None | None | None | None |
| Search cost per 1,000 | $14 | $10 | $2.50–$5 | $5 | ~$1.10 |

**Read this as:** no single engine gives everything. Grok is the most generous
on read-but-not-used data, Perplexity is the only one telling us how old a source
is, Gemini is the only one with any free allowance.

---

## 3. Google Gemini

**What it is** — Google's AI. When "grounding" is switched on it runs real Google
searches before answering, so we see genuine Google results.

**Endpoint we use**
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent
```
Switch grounding on by including `"tools": [{"google_search": {}}]` in the request.

### What we get back

| Field | Plain English | Useful? |
|---|---|---|
| `webSearchQueries` | The hidden mini-searches, in the order fired | ✅ Using |
| `groundingChunks[].web.uri` | The cited page's link | ✅ Using |
| `groundingChunks[].web.title` | **The domain only** (`samsung.com`), *not* the page title | ⚠️ Limited |
| `groundingSupports[]` | Which exact sentence each source backs up | ❌ **Not using — biggest gap** |
| `searchEntryPoint` | Google's "Search suggestions" widget | ❌ Not using — see warning |
| `usageMetadata` | Token counts, including "thinking" tokens | ❌ Not using |
| `finishReason` | Whether the answer was cut off | ❌ Not using |

**`groundingSupports` is the prize.** A real captured answer contained 23 of
these. One example:

> "Motorola is generally perceived as offering excellent value for money" —
> backed by sources 1, 2, 3 and 4

That tells us *which websites are shaping opinion about our brand specifically*,
rather than just which websites were cited somewhere in the answer. We currently
throw all of it away.

It also reveals something no other field can: any sentence **not** covered by a
support is the AI speaking from memory rather than from a source. That separates
"we need better content" from "we need to be better known" — two very different
problems with different fixes.

**Not available:** page titles, publication dates, snippets. `confidenceScores`
exists in older docs but is always empty on current models — ignore it.

### Pricing

Text (per 1 million tokens):

| Model | Input | Output |
|---|---|---|
| **gemini-3.6-flash** (ours) — intro rate to 31 Dec 2026 | $0.75 | $3.75 |
| gemini-3.6-flash — after that | $1.50 | $7.50 |
| gemini-3.5-flash-lite (cheapest) | $0.30 | $2.50 |

Search grounding:

| Tier | Allowance | Then |
|---|---|---|
| Free | 500 requests/day (Flash models; not available on Pro) | — |
| Paid, Gemini 3.x | 5,000 searches/month, shared across all 3.x models | **$14 per 1,000** |
| Paid, Gemini 2.5 | 1,500 requests/day | $35 per 1,000 |

> ### ⚠️ The billing trap that caught us
>
> On Gemini 3.x you are billed **per mini-search, not per question asked.**
> Google's exact words: *"A customer-submitted request to Gemini may result in
> one or more queries to Google Search. You will be charged for each individual
> search query performed."*
>
> One of our real captured answers fired **7 mini-searches**. On the old 2.5
> model that was 1 billable unit. On our current 3.6 model it is 7. Same
> question, roughly **7× the cost.** Our config was switched from 2.5 to 3.6 at
> some point and this change came with it, unnoticed.

Other tools: URL context free on free tier / charged as input tokens on paid ·
Code execution free to enable · Maps grounding $25 per 1,000 · File search
$0.15 per 1M embedding tokens.

> **Legal note:** when we display grounded Gemini results we are *required* by
> Google's terms to show the `searchEntryPoint` widget. We currently ignore it.
> Worth fixing before this is customer-facing.

**Sources:** [Pricing](https://ai.google.dev/gemini-api/docs/pricing) ·
[Grounding](https://ai.google.dev/gemini-api/docs/google-search) ·
[Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)

---

## 4. OpenAI (ChatGPT)

**What it is** — the company behind ChatGPT. Their newer "Responses API" can
search the web and, uniquely, will tell us every page it looked at.

**Endpoint we would use**
```
POST https://api.openai.com/v1/responses
```
With `"tools": [{"type": "web_search"}]`.

### What we get back

| Field | Plain English |
|---|---|
| `web_search_call.action.query` | The hidden mini-searches |
| `web_search_call.action.sources` | **Every page it read** — needs opting in |
| `annotations[]` (`url_citation`) | Pages actually credited, with exact position in the text |
| `action.type` = `open_page` / `find_in_page` | Which pages it *opened and read*, not just searched |

**The important one.** By adding this to the request:

```
include: ["web_search_call.action.sources"]
```

OpenAI returns *"the complete list of URLs the model consulted"* — and their own
docs note *"the number of sources is often greater than the number of citations."*

That is precisely the read-but-not-used gap. It is the one thing our
`considered` database column was built for and currently cannot fill properly.

**Also useful:** `filters.allowed_domains` / `blocked_domains` (100 each) to
restrict searching to a competitor set, and `user_location` for proper country
targeting.

### Pricing

Text (per 1 million tokens):

| Model | Input | Output |
|---|---|---|
| gpt-5.6-luna (cheapest) | $0.20 | $1.20 |
| gpt-5.6-terra | $2.00 | $12.00 |
| gpt-5.6-sol (flagship) | $4.00 | $20.00 |

Web search: **$10.00 per 1,000 calls**, *plus* the page content it reads billed
as normal input tokens. (The older "preview" tool on non-reasoning models is
$25 per 1,000 but the content tokens are free.)

**No free tier for web search at all.**

**Sources:** [Pricing](https://developers.openai.com/api/docs/pricing) ·
[Web search](https://developers.openai.com/api/docs/guides/tools-web-search) ·
[Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses)

---

## 5. Perplexity

**What it is** — an AI search engine. Its whole product is answering with
sources, so its citation data is the tidiest of the group.

**Endpoint**
```
POST https://api.perplexity.ai/v1/sonar
```
Models: `sonar`, `sonar-pro`, `sonar-reasoning-pro`, `sonar-deep-research`.

### What we get back

| Field | Plain English |
|---|---|
| `search_results[].title` | **Real page title** — Gemini can't give us this |
| `search_results[].date` | **When the page was published** |
| `search_results[].last_updated` | **When it was last changed** |
| `search_results[].snippet` | Extract of the relevant text |
| `usage.num_search_queries` | *How many* mini-searches ran (not their wording) |
| `usage.cost.total_cost` | **What this exact call cost us** |
| `related_questions[]` | Follow-up questions it suggests |

**Two things only Perplexity gives us.**

*Publication dates.* This makes a genuinely new question answerable: **"how
fresh does a page have to be before AI will cite it?"** If cited pages are
overwhelmingly updated within six months, that is a concrete, sellable content
recommendation. No other engine on this list carries this field.

*Cost per call, reported back to us.* Every other engine requires us to
calculate spend ourselves from token counts.

**Useful filters:** `search_domain_filter`, `search_recency_filter`
(hour/day/week/month/year), `search_after_date_filter`, `search_mode` (web /
academic / sec), and `response_format` with a JSON schema.

**Weakness:** we get the *number* of mini-searches, never their text.

### Pricing

| What | Cost |
|---|---|
| **Search API** (raw results, no AI answer) | **$5.00 per 1,000 requests** — one request may hold up to 5 queries |
| Sonar | $1 in / $1 out per 1M tokens |
| Sonar Pro | $3 in / $15 out |
| Sonar Reasoning Pro | $2 in / $8 out |
| Sonar Deep Research | $2 in / $8 out, + $2/1M citation tokens, + $5/1K searches, + $3/1M reasoning |
| Agent API `web_search` tool | $0.0025 per call ($2.50 per 1,000) |
| Agent API `fetch_url` tool | $0.0005 per call |

> ⚠️ **Deprecation:** Perplexity's docs state *"Sonar Chat Completions is now
> Agent API. Sonar will be supported until September 27, 2026."* Anything we
> build should target the Agent API, not Sonar.

**Sources:** [Pricing](https://docs.perplexity.ai/getting-started/pricing) ·
[Chat completions reference](https://docs.perplexity.ai/api-reference/sonar-post) ·
[Models](https://docs.perplexity.ai/getting-started/models)

---

## 6. Grok (xAI)

**What it is** — Elon Musk's AI, built into X/Twitter. Notably it can search **X
posts** as well as the web, which no other engine here does.

**Endpoint** — OpenAI-compatible, so the same client code style works:
```
POST https://api.x.ai/v1/responses
```
With `"tools": [{"type": "web_search"}]`. Model: `grok-4.6`.

### What we get back

**Grok is the most generous engine here on the one thing that matters most.**
Its `citations` field is returned **by default, no configuration**, and their
docs describe it as covering every source encountered:

> *"Note that not every URL in this list will necessarily be directly referenced
> in the final answer. The agent may examine a source during its research
> process and determine it is not sufficiently relevant... but the URL will
> still appear in this list for transparency."*

That is the read-but-not-used list, free and automatic. OpenAI makes you ask for
it; Gemini and Perplexity cannot give it at all.

| Field | Plain English |
|---|---|
| `citations` | Every source encountered — **on by default** |
| `annotations[]` | Cited sources with exact character positions |
| `inline_citations` | Same, and flags whether a source is a webpage or an X post |
| `server_side_tool_usage` | How many times each tool ran |

**Controls:** `allowed_domains` / `excluded_domains` (max 5 each — much tighter
than OpenAI's 100).

**Weakness:** the mini-search wording is not exposed.

### Pricing

| Model | Input | Output | Context |
|---|---|---|---|
| **grok-4.6** | $2.00 / 1M | $6.00 / 1M | 500k |
| grok-4.6 (long context ≥200k) | $4.00 / 1M | $12.00 / 1M | |
| grok-4.3 | $1.25 / 1M | $2.50 / 1M | 1M |

Tools: Web search **$5 per 1,000 calls** · X search $5 per 1,000 · Code
execution $5 per 1,000 · Collections search $2.50 per 1,000.

Batch API gives 20% off on some models. No free tier.

**Sources:** [Pricing](https://docs.x.ai/developers/pricing) ·
[Web search](https://docs.x.ai/developers/tools/web-search) ·
[Citations](https://docs.x.ai/developers/tools/citations) ·
[Models](https://docs.x.ai/developers/models)

---

## 7. DataForSEO

**What it is** — different from the rest. Not an AI company; a data vendor that
watches AI engines on our behalf and sells the results. Reaches **Google AI
Overviews** — the AI box at the top of normal Google results — which no direct
API exposes.

### Products relevant to us

| Product | What it does |
|---|---|
| **LLM Mentions API** | Brand/domain mentions across ChatGPT, Gemini, Google AI Overview, Claude, Perplexity |
| **LLM Responses API** | Live answers from several LLMs in one structured call |
| **LLM Scraper API** | Scraped ChatGPT results |
| **AI Keyword Data API** | How often prompts are actually asked in AI tools |
| **SERP API — AI Mode / AI Overview** | Google's AI answer box with its cited sources |

**Endpoints**
```
POST https://api.dataforseo.com/v3/ai_optimization/llm_mentions/live
POST https://api.dataforseo.com/v3/serp/google/ai_mode/live/advanced
```

### Pricing

| What | Cost |
|---|---|
| LLM Mentions (Live) | **$0.10 per request + $0.001 per row** |
| Example: 1,000 rows | $1.10 |
| SERP AI Mode | Per request — see their calculator |
| **Minimum account top-up** | **$50** |

### Honest assessment

DataForSEO's AI Optimization suite **is a ready-made version of a large part of
what Citelytics does.** That is worth saying plainly rather than discovering
later. The trade-off:

- **For** — instant access to Google AI Overviews (reportedly triggering on
  ~89% of brand searches), which we are completely blind to and cannot reach any
  other way. Cheap per row.
- **Against** — we would be reselling someone else's measurements rather than
  taking our own. We lose the sentence-level grounding detail the direct APIs
  give us, and our differentiator becomes packaging rather than data.

**Sensible use:** buy DataForSEO *only* for Google AI Overviews, keep direct API
calls for everything else.

**Sources:** [AI Optimization API](https://dataforseo.com/apis/ai-optimization-api) ·
[Docs](https://docs.dataforseo.com/v3/ai_optimization/overview/) ·
[Pricing](https://dataforseo.com/pricing)

---

## 8. What this costs us in practice

Assuming **5 prompts/day, 1 run/day, ~6 mini-searches per prompt** (our real
measured average) = ~150 prompts and ~900 searches per month.

| Engine | Monthly search cost | Monthly tokens | Total |
|---|---|---|---|
| **Gemini 3.6 Flash** | 900 searches — **inside the 5,000/mo free block** = $0 | ~$0.50 | **~$0.50** |
| **Grok 4.6** | 900 × $0.005 = $4.50 | ~$1.50 | **~$6** |
| **OpenAI gpt-5.6-luna** | 900 × $0.01 = $9.00 | ~$0.50 | **~$9.50** |
| **Perplexity Sonar** | included in request fee | ~$1 | **~$3** |
| **DataForSEO** (AI Overviews only) | 150 × ~$0.101 | — | **~$15** + $50 minimum |

**All five engines together: roughly $35/month at our current volume.** The
$50 DataForSEO minimum is the largest single obstacle, not the running cost.

The thing to watch is not price per call but **mini-searches per prompt.** Every
engine except Perplexity bills per search. If a prompt fans out to 15 searches
instead of 6, costs more than double with no change to how many questions we ask.

---

## 9. Where we are today

| Engine | Status |
|---|---|
| Gemini | ❌ **Blocked** — grounded calls return `429 RESOURCE_EXHAUSTED` |
| OpenRouter (our ChatGPT stand-in) | ❌ **Blocked** — out of credits |
| Perplexity | Not connected |
| Grok | Not connected |
| DataForSEO | Not connected |

**No data has been collected since 10 August 2026.**

On Gemini, ungrounded calls return `200 OK` and grounded calls return `429` on
the same key — so the key and model are fine and it is specifically the search
allowance that is exhausted. Retested on a fresh key and on a later date; both
still failed.

> **One unresolved contradiction.** Google's pricing page states the free tier
> includes **500 grounded requests per day** for Flash models. Our observed
> behaviour contradicts this — we get `429` persistently, across different days
> and different keys. Either that free allowance does not apply the way the page
> reads, or something project-specific is capping us. **Enabling billing on the
> Google Cloud project is the reliable fix**, and at our volume it should cost
> close to nothing because 900 searches/month sits inside the 5,000/month
> included block.

---

## 10. Recommendations

**Unblock first (nothing works until these are done)**
1. Enable billing on the Google Cloud project behind the Gemini key.
2. Top up OpenRouter, or skip it and go direct to OpenAI.

**Then, in value order**
3. **Parse `groundingSupports`** — free, the data is already stored in our
   database, and it can be backfilled across all past answers. Biggest single
   gain available and it needs no new vendor.
4. **Store `finishReason` and `usageMetadata`** — trivial; gives cut-off
   detection and real cost tracking.
5. **Add Grok** — cheapest way to get read-but-not-used data, since it arrives by
   default. Also OpenAI-compatible, so it slots into existing client code.
6. **Add Perplexity** — the only source of publication dates, which unlocks
   content-freshness recommendations.
7. **Add OpenAI direct** — most expensive search, but gives both the mini-search
   wording and the consulted list.
8. **DataForSEO for Google AI Overviews only** — the one surface we cannot reach
   any other way.

Items 3 and 4 work on data already sitting in Supabase and do not depend on any
billing being fixed.

---

## 11. Verification notes

- Prices read directly from official pricing pages on 22 Aug 2026.
- Gemini field names verified against a **real stored payload** from our own
  database (Motorola vs Samsung, 1 Aug 2026), not just documentation.
- The `429` behaviour was tested live on two keys and two dates.
- DataForSEO SERP AI Mode per-request price requires their interactive
  calculator and is **not** independently confirmed here.
- OpenAI, Perplexity and Grok payload structures come from documentation only —
  **we have not yet made a live call to any of them.**
