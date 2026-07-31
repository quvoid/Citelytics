# Citelytics — AI Citation Intelligence (demo)

Tracks how often a brand's content gets cited by AI answer engines (Gemini,
OpenRouter) in response to tracked prompts. This is a **demo/mockup phase**:
real API calls, real Supabase writes, real dashboard reads — but no billing,
no job queue, no multi-tenant complexity.

## Architecture

Two services, matching the shape of the eventual production system:

```
/frontend   Next.js (TypeScript) — UI only. Reads Supabase directly (anon key,
            RLS-protected). Calls the backend only to trigger a fetch.
/backend    Python (FastAPI) — every external API call (Gemini, OpenRouter),
            citation normalization, and all Supabase writes (service-role key).
/supabase   SQL migration + seed data.
```

The frontend never holds `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, or the
Supabase service-role key. The backend never serves the UI.

## 1. Set up Supabase (free tier)

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. In the SQL Editor, run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   This creates the schema, enables basic RLS, seeds the two `engines` rows
   (`gemini`, `openrouter_demo`), and seeds one demo project with 10 prompts.
3. Grab your keys from **Project Settings → API**:
   - `Project URL` → used as both `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (backend only — keep secret)

> **Free tier caveat:** Supabase pauses a free project after 7 days of
> inactivity. If the demo "stops working" after a break, go to the dashboard
> and un-pause the project — no data is lost.

## 2. Get API keys

- **Gemini** — [aistudio.google.com/apikey](https://aistudio.google.com/apikey), free, no card required.
  Grounding with Google Search is free within Google's allowance, but is
  rate-limited per minute and per day (varies by model — check current limits
  before assuming a fetch frequency). The backend surfaces `429`s as a
  per-prompt "rate limited" status instead of crashing the batch.
- **OpenRouter** — [openrouter.ai/keys](https://openrouter.ai/keys), free to create.
  - Free (`:free`) models give free **text**, not free **citations** — real
    web-grounded citations require OpenRouter's paid web-search plugin
    (~$0.02/request). By default this demo calls a free model and layers on
    clearly-labeled **simulated** citations for UI purposes
    (`is_simulated = true`). Set `OPENROUTER_ENABLE_WEB_SEARCH=true` in
    `backend/.env` to spend real credits and get real `url_citation`
    annotations instead.
  - Rate limits: 20 req/min always; 50/day with no credits purchased, 1,000/day
    after a one-time $10 top-up (persists even if balance later hits zero).

## 3. Run the backend (Python / FastAPI)

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
copy .env.example .env       # then fill in the keys from steps 1-2
uvicorn main:app --reload --port 8000
```

`GET http://localhost:8000/api/health` should return `{"status": "ok", ...}`.

## 4. Run the frontend (Next.js)

```bash
cd frontend
npm install
copy .env.example .env.local   # then fill in Supabase URL/anon key
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Using the demo

- **Prompts** page: add/deactivate tracked prompts (10 are seeded). Sentiment
  / Position / Intent columns are intentionally greyed out ("Coming soon") —
  we don't fake that data with random numbers.
- Click **"Fetch citations now"** (Overview page) — it calls
  `POST /api/fetch-citations/{project_id}` on the FastAPI backend, which
  synchronously queries Gemini and OpenRouter for every active prompt,
  writes raw + normalized rows to Supabase, and returns a per-prompt,
  per-engine status (success / rate-limited / error) shown live in the UI.
- **Overview** and **Sources → Domains/URLs** read real rows from the
  `citations` table — no fabricated trend lines.
- A persistent **Demo mode** banner distinguishes real (Gemini) citations
  from simulated (OpenRouter demo) ones.

## Known limits (by design, this phase)

- No billing, no plan limits.
- No Celery/Redis — fetches run synchronously in the FastAPI request.
- No table partitioning / read replicas / materialized views.
- Single tenant, one seeded project, no multi-tenant switcher UI.
- No auth (add Supabase magic-link auth before sharing this beyond local use).

## Repo layout

```
backend/
  app/
    engines/gemini.py       # Gemini grounding call + citation parsing
    engines/openrouter.py   # OpenRouter free/paid call + citation parsing
    routers/fetch.py        # POST /api/fetch-citations/{project_id}
    routers/health.py       # GET /api/health
    supabase_client.py      # service-role client (backend-only)
  main.py
  requirements.txt
  .env.example
frontend/
  app/                      # Overview, Prompts, Sources/Domains, Sources/URLs
  components/
  lib/supabase/             # anon-key clients (reads + prompt CRUD only)
  .env.example
supabase/
  migrations/0001_init.sql
```
