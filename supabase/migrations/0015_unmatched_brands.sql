-- Sightings of brand names the classifier noticed but that aren't tracked
-- yet — the raw material for "auto-suggest competitors" on /brands.
--
-- Append-only by design: one row per (response, name) sighting, not a
-- deduplicated running count. Aggregation (count, first/last seen) happens
-- in a query, so the row-level data stays a plain audit trail that's cheap
-- to re-aggregate if the matching rules change later.
--
-- Populated only from backend/classifier.py's `other_brands_mentioned` field
-- on the SAME Gemini call that already runs for brand_sentiment/product_tags
-- — i.e. only for answers where a tracked brand was already detected. See
-- the project plan for why: the classifier only calls Gemini at all when a
-- tracked brand matched locally, so this can only ever catch a competitor
-- that co-occurs with one you already track, never one discussed alone.
-- Real, stated limitation — not a silent gap.
create table if not exists unmatched_brand_mentions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  raw_response_id uuid not null references raw_responses(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists unmatched_brand_mentions_project_name_idx
  on unmatched_brand_mentions (project_id, name);

alter table unmatched_brand_mentions enable row level security;
create policy "public read unmatched_brand_mentions" on unmatched_brand_mentions for select using (true);
-- Backend-only writes (service-role key) — no anon insert policy, matching
-- content_briefs' pattern: this is derived signal, not user-entered data.
