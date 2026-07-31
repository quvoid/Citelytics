# Citelytics — AI Citation Intelligence

Tracks how often a brand's content gets cited by AI answer engines in
response to tracked prompts, and whether the brand is actually named in
those answers and in the pages they cite. This is the **real architecture**
— FastAPI + Celery/Redis job scheduling + Supabase Postgres + Next.js UI —
with only the *engines* temporarily swapped for free-tier test ones
(Gemini, OpenRouter) instead of the eventual paid APIs (Perplexity Sonar,
OpenAI direct, xAI Grok, DataForSEO for Google AI Overview).

## Architecture

```
/frontend   Next.js (TypeScript) — UI only. Reads Supabase directly (anon key,
            RLS-protected). Triggers fetches via the backend and polls for
            live per-prompt/engine status.
/backend    Python — FastAPI (API layer) + Celery (worker + beat scheduler).
            Every external engine call, citation normalization, and all
            Supabase writes (service-role key) happen here.
/supabase   SQL migration + seed data.
```

The frontend never holds engine API keys, the Supabase service-role key, or
the Redis connection string. The backend never serves the UI.

### The engine plug-in interface

Every engine — test or real — implements one interface:

```python
# backend/clients/base.py
class EngineClient(ABC):
    async def fetch(self, prompt_text: str) -> RawEngineResponse: ...
```

`backend/tasks.py` and the DB-write logic only ever talk to `EngineClient`,
never to Gemini or OpenRouter specifics. Swapping in Perplexity/OpenAI/Grok/
DataForSEO later means writing one new class in `backend/clients/` and
adding one line to `ENGINE_CLIENTS` in `backend/clients/__init__.py` —
`tasks.py`, `main.py`, and the schema never change.

### Async fetch flow

`POST /api/projects/{id}/fetch` fans out one Celery task per
(active prompt × engine) and returns immediately with a `batch_id`. Celery
workers process each task independently — a rate limit or failure on one
prompt/engine never blocks the others. The frontend polls
`GET /api/projects/{id}/fetch-status/{batch_id}` (backed by the
`fetch_batches`/`fetch_batch_tasks` tables) to show live progress. Celery
Beat also fires this fan-out automatically on a schedule — no manual
trigger required.

## 1. Set up Supabase (free tier)

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. In the SQL Editor, run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   Creates the schema (including `fetch_batches`/`fetch_batch_tasks` for
   async status tracking), enables basic RLS, seeds the `gemini` and
   `openrouter` engine rows, and seeds one demo project with prompts.
3. Grab your keys from **Project Settings → API**:
   - `Project URL` → both `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (backend only — keep secret)

> **Free tier caveat:** Supabase pauses a free project after 7 days of
> inactivity. If the app "stops working" after a break, un-pause it from the
> dashboard — no data is lost.

## 2. Set up Upstash Redis (free tier, no card required)

1. Create an account at [console.upstash.com](https://console.upstash.com).
2. **Create Database** → any region → copy the **Redis Connection** URL
   (starts with `rediss://`).
3. Set both `CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND` in `backend/.env`
   to that URL **with `?ssl_cert_reqs=required` appended** — e.g.
   `rediss://default:<password>@<host>:6379?ssl_cert_reqs=required`. Without
   this, both Celery's redis backend and `redis-py`'s health check refuse to
   start against a `rediss://` URL (`ssl_cert_reqs` must be `none`,
   `optional`, or `required` — lowercase; `CERT_REQUIRED` etc. do not work).

Free tier: 500K commands/month, 256MB, scales to zero — plenty of headroom
for a handful of prompts on a daily schedule. Upstash speaks the standard
Redis protocol, so Celery connects to it exactly like any other Redis
instance.

## 3. Get engine API keys

- **Gemini** — [aistudio.google.com/apikey](https://aistudio.google.com/apikey), free, no card required.
  Grounding with Google Search is free within Google's allowance, but
  rate-limited per minute and per day (check current limits before assuming
  a fetch frequency). A `429` raises inside `GeminiClient.fetch`, which the
  Celery task catches via `autoretry`-style backoff (`max_retries=3`,
  exponential `countdown`) — it never crashes the batch or retries into a
  silent wall.
- **OpenRouter** — [openrouter.ai/keys](https://openrouter.ai/keys), free to create.
  - Free (`:free`) models give free **text**, not free **citations** — real
    web-grounded citations need OpenRouter's paid web-search plugin
    (~$0.02/request via Exa). By default (`OPENROUTER_ENABLE_WEB_SEARCH=false`)
    this calls a free model and layers on clearly-labeled **simulated**
    citations (`is_simulated = true`).
  - `OPENROUTER_MODEL` — two real choices, not a free/paid mistake to avoid:
    - `openai/gpt-oss-20b:free` (default in `.env.example`): genuinely free,
      but it's OpenAI's open-weight model, **not** what ChatGPT actually
      runs — its answers don't really represent "what would ChatGPT say."
    - `openai/gpt-4o-mini`: small real per-token cost, but actually
      representative of ChatGPT's behavior for a given query — use this
      when the point is to approximate real ChatGPT output, not to stay
      free. Combine with `OPENROUTER_ENABLE_WEB_SEARCH=true` to also get
      real citations (the closest replication of ChatGPT's browsing mode).
  - Rate limits: 20 req/min always; 50/day with no credits purchased,
    1,000/day after a one-time $10 top-up (persists even after balance
    hits zero). `429`s are handled the same way as Gemini's.

## 4. Run the backend (three processes)

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
copy .env.example .env       # then fill in the keys from steps 1-3
```

Then, in three separate terminals (all from `backend/`, venv activated):

```bash
# Terminal 1 — API
uvicorn main:app --reload --port 8000

# Terminal 2 — Celery worker (processes fetch tasks)
celery -A celery_app worker --loglevel=info --pool=solo   # --pool=solo on Windows

# Terminal 3 — Celery beat (fires the scheduled fan-out automatically)
celery -A celery_app beat --loglevel=info
```

`GET http://localhost:8000/api/health` should return
`{"status": "ok", "supabase_connected": true, "redis_connected": true}`.

## 5. Run the frontend (Next.js)

```bash
cd frontend
npm install
copy .env.example .env.local   # then fill in Supabase URL/anon key
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Using it

- **Prompts** page: add/deactivate tracked prompts. Topic/Intent/Branded are
  classified automatically on first successful fetch; Sentiment/Position are
  per-answer averages toward your own brand.
- Click **"Fetch citations now"** — calls `POST /api/projects/{id}/fetch`,
  which returns a `batch_id` immediately. The button then polls
  `GET /api/projects/{id}/fetch-status/{batch_id}` every 2s and shows live
  per-prompt/engine status (pending → success / rate_limited / error) as
  Celery workers process the queue.
- Celery Beat also fires this same fan-out **daily** on its own
  (`FETCH_SCHEDULE_HOUR_UTC` in `.env`) — see `backend/celery_beat_schedule.py`.
  Move this to weekly once the real (paid) engine APIs replace the free-tier
  test ones, to stay well under their rate limits.
- **Overview**, **Sources**, **Brands** pages read real rows from Supabase —
  no fabricated data.
- The header shows a live **real vs. simulated** citation count and Gemini/
  ChatGPT engine badges, so it's never mistaken for production-accurate data.

### Analytics features

- **Sentiment / Position / Share of Voice** (`Overview`, `Prompts`, `Brands`) —
  every AI answer is run through one structured-output Gemini Flash call
  (`backend/classifier.py::classify_answer`) that detects which tracked
  brands (yours + competitors) are named, in what order, and sentiment
  toward yours specifically. Results land in `answer_brand_mentions` and
  `raw_responses.brand_sentiment_score`/`brand_position`. If that call fails
  (e.g. rate limited — it shares Gemini's quota with the grounding call
  itself), `brand_mentioned_in_answer` falls back to a plain text match
  rather than silently defaulting to "not mentioned."
- **Sources: domain/content types, movers** — each unique domain is
  classified once (cached in `domain_types`) into Corporate/Editorial/UGC/
  Institutional/Reference/Other; each citation gets a free heuristic
  content-type label (Listicle/How-To/Review/Product Page/etc. — regex on
  the URL, no extra API call). The Top/New/Trending/Losing tabs compare
  3-day citation windows — New/Trending/Losing need a few days of history
  to populate.
- **Gap Analysis** (`/sources/gap-analysis`) — real cited pages confirmed
  to *not* mention your brand, ranked by citation count.
- **Query Fanouts** (`/fanouts`) — the literal sub-search queries Gemini's
  grounding tool issued before answering (`groundingMetadata.webSearchQueries`,
  free, was already in the response). OpenRouter doesn't expose these, so
  this page is Gemini-only.
- **Perception** (`/perception`) — a second prompt type (`prompt_type =
  'perception'`) for open brand-description questions, run via a separate
  synchronous endpoint (`POST /api/projects/{id}/fetch-perception` — low
  volume, doesn't need Celery batch tracking). Extracts attribute
  associations (`classify_attributes`) into `brand_attributes`, shown as an
  association-score list plus a radar chart (plain SVG, no chart library)
  comparing your brand against your top 2 competitors by attribute volume.
- **Daily trend snapshots** — `daily_metrics` is upserted per project per
  UTC day at the end of every successful fetch task
  (`backend/metrics.py::refresh_daily_metrics`); the Overview KPI row shows
  deltas vs. the previous day once there's more than one day of history.

None of this needs new paid APIs — it's all built on the same free-tier
Gemini/OpenRouter calls, using Gemini Flash as a shared classifier
regardless of which engine produced the answer being classified.

## Known limits (by design, this phase)

- No billing, no plan limits.
- No table partitioning / read replicas / materialized views.
- Single tenant, one seeded project, no multi-tenant switcher UI.
- No auth (add Supabase magic-link auth before sharing this beyond local use).
- Engines are free-tier test stand-ins (Gemini, OpenRouter) for the real
  paid APIs this architecture is built for — see the plug-in interface above.
- **Search volume** (as seen in commercial tools' prompt tables) is not
  implemented — it needs a paid keyword-data API (DataForSEO/SEMrush) and
  isn't derivable from anything we fetch. Wire it in as a new provider
  module when/if you buy access.
- **"Chat features"** (the ads / maps / shopping-widget icons commercial
  tools show per chat row) are deliberately **not** implemented. Those
  surfaces only render in the consumer ChatGPT/Gemini web apps, not in any
  API response — capturing them means browser-automating logged-in consumer
  sessions, which violates those services' ToS.
- Gemini's free-tier grounding quota is small; a full fan-out across several
  prompts will rate-limit partway through. Those tasks are recorded as
  `rate_limited` with exponential-backoff retries, not lost — just expect a
  batch to complete over several minutes rather than all at once.

## Repo layout

```
backend/
  main.py                    FastAPI app: CRUD + async fetch trigger/status + health
  celery_app.py               Celery app config (Upstash Redis broker + backend)
  celery_beat_schedule.py     Periodic schedule (daily while testing free tiers)
  tasks.py                    Celery tasks — one per (prompt, engine) pair
  db.py                       Supabase service-role client
  config.py                   All env-driven settings
  classifier.py               Gemini-Flash structured-output classification:
                              brand mentions/order, sentiment, topic/intent,
                              domain type, perception attributes
  metrics.py                  Daily rollups into daily_metrics (trend deltas)
  perception.py               Synchronous perception-prompt run + attribute extraction
  normalize.py                Domain extraction + heuristic content-type labels
  normalizer.py                Per-citation enrichment + domain-type cache fill
  brand_check.py               Fetches cited pages, checks for brand mentions
  clients/
    base.py                   EngineClient ABC + Citation/RawEngineResponse models
    gemini_client.py           Real grounding citations + redirect resolution + fanouts
    openrouter_client.py       Free/paid-web-search modes
    __init__.py                ENGINE_CLIENTS registry — add new engines here
  models.py                   Pydantic request/response models
  requirements.txt
  .env.example
frontend/
  app/                        Overview, Prompts (+detail), Fanouts, Sources
                              (+gap-analysis), Brands, Perception
  components/
  lib/supabase/                anon-key clients (reads + prompt/brand CRUD)
  .env.example
supabase/
  migrations/0001_init.sql     Core schema + async fetch tracking
  migrations/0002_analytics.sql  Competitor mentions, sentiment/position,
                                 domain types, daily metrics, fanouts, attributes
```
