-- Phase 1-3 analytics schema: competitor mention detection / Share of
-- Voice, sentiment + position classification, prompt topic/intent tagging,
-- domain/content-type classification, daily trend snapshots, Gemini query
-- fanouts, and brand-perception attribute extraction.

-- Brand display name (for text-mention matching) separate from domain
alter table tracked_urls add column if not exists name text;
update tracked_urls set name = initcap(split_part(url, '.', 1)) where name is null;
alter table tracked_urls alter column name set not null;

-- Which tracked brands (yours + competitors) are named in each AI answer —
-- unlocks real Share of Voice instead of domain-match-only visibility.
create table if not exists answer_brand_mentions (
  id uuid primary key default gen_random_uuid(),
  raw_response_id uuid not null references raw_responses(id) on delete cascade,
  tracked_url_id uuid not null references tracked_urls(id) on delete cascade,
  mentioned boolean not null default false,
  position integer, -- 1-indexed rank among brands mentioned in this answer, null if not mentioned
  created_at timestamptz not null default now(),
  unique (raw_response_id, tracked_url_id)
);
create index if not exists answer_brand_mentions_raw_response_idx on answer_brand_mentions(raw_response_id);
create index if not exists answer_brand_mentions_tracked_url_idx on answer_brand_mentions(tracked_url_id);

-- Per-answer classifier output (sentiment/position toward YOUR brand specifically)
alter table raw_responses add column if not exists brand_sentiment_score integer; -- 0-100, null if brand not mentioned
alter table raw_responses add column if not exists brand_position integer; -- 1-indexed rank among all brands mentioned

-- Prompt-level classification (topic/intent/branding), computed once
alter table prompts add column if not exists topic text;
alter table prompts add column if not exists intent text; -- Commercial | Informational | Transactional | Navigational
alter table prompts add column if not exists is_branded boolean not null default false;
alter table prompts add column if not exists prompt_type text not null default 'citation'; -- 'citation' | 'perception'

-- Domain classification cache (classified once per unique domain, not per citation)
create table if not exists domain_types (
  domain text primary key,
  domain_type text not null, -- Corporate | Editorial | UGC | Institutional | Reference | Other
  classified_at timestamptz not null default now()
);

-- Per-citation content type (listicle/article/how-to/etc) — heuristic, no extra API cost
alter table citations add column if not exists content_type text;

-- Daily rollups per project, for trend deltas and historical movers
create table if not exists daily_metrics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  date date not null,
  visibility_pct numeric,
  sov_pct numeric,
  avg_sentiment numeric,
  avg_position numeric,
  created_at timestamptz not null default now(),
  unique (project_id, date)
);

-- The literal sub-search queries Gemini's grounding tool issued before
-- answering (groundingMetadata.webSearchQueries) — free, already in the
-- response we store, just not captured yet.
create table if not exists query_fanouts (
  id uuid primary key default gen_random_uuid(),
  raw_response_id uuid not null references raw_responses(id) on delete cascade,
  query_text text not null,
  created_at timestamptz not null default now()
);
create index if not exists query_fanouts_raw_response_idx on query_fanouts(raw_response_id);

-- Attributes AI associates with a brand, from 'perception'-type prompts
create table if not exists brand_attributes (
  id uuid primary key default gen_random_uuid(),
  raw_response_id uuid not null references raw_responses(id) on delete cascade,
  tracked_url_id uuid not null references tracked_urls(id) on delete cascade,
  attribute text not null,
  created_at timestamptz not null default now()
);
create index if not exists brand_attributes_tracked_url_idx on brand_attributes(tracked_url_id);

-- RLS: frontend reads all of these directly via anon key
alter table answer_brand_mentions enable row level security;
alter table domain_types enable row level security;
alter table daily_metrics enable row level security;
alter table query_fanouts enable row level security;
alter table brand_attributes enable row level security;

create policy "public read answer_brand_mentions" on answer_brand_mentions for select using (true);
create policy "public read domain_types" on domain_types for select using (true);
create policy "public read daily_metrics" on daily_metrics for select using (true);
create policy "public read query_fanouts" on query_fanouts for select using (true);
create policy "public read brand_attributes" on brand_attributes for select using (true);
