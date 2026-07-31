-- Citelytics demo schema
-- Schema-compatible with the production architecture doc (no partitioning / multi-tenant RLS yet).

create extension if not exists "pgcrypto";

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null,
  created_at timestamptz not null default now()
);

create table if not exists tracked_urls (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  url text not null,
  is_competitor boolean not null default false
);

create table if not exists prompts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  query_text text not null,
  active boolean not null default true
);

create table if not exists engines (
  id uuid primary key default gen_random_uuid(),
  name text not null unique -- 'gemini', 'openrouter_demo'
);

create table if not exists raw_responses (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references prompts(id) on delete cascade,
  engine_id uuid not null references engines(id) on delete cascade,
  raw_response jsonb not null,
  answer_text text,
  brand_mentioned_in_answer boolean not null default false,
  fetched_at timestamptz not null default now()
);

create table if not exists citations (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references prompts(id) on delete cascade,
  engine_id uuid not null references engines(id) on delete cascade,
  url text not null,
  domain text not null,
  is_simulated boolean not null default false, -- true for Engine B's mocked citations
  raw_response_id uuid references raw_responses(id) on delete set null,
  mentions_brand boolean, -- null = unknown (page fetch failed/blocked), else real check
  fetched_at timestamptz not null default now()
);

create index if not exists citations_prompt_id_idx on citations(prompt_id);
create index if not exists citations_engine_id_idx on citations(engine_id);
create index if not exists citations_domain_idx on citations(domain);
create index if not exists raw_responses_prompt_id_idx on raw_responses(prompt_id);

-- Seed engines
insert into engines (name) values ('gemini') on conflict (name) do nothing;
insert into engines (name) values ('openrouter_demo') on conflict (name) do nothing;

-- Basic RLS: enabled, but demo runs single-tenant with the service-role key
-- for all writes, and a permissive read policy for the anon key (dashboard
-- reads). Tighten this before any multi-tenant/production use.
alter table projects enable row level security;
alter table tracked_urls enable row level security;
alter table prompts enable row level security;
alter table engines enable row level security;
alter table raw_responses enable row level security;
alter table citations enable row level security;

create policy "public read projects" on projects for select using (true);
create policy "public read tracked_urls" on tracked_urls for select using (true);
create policy "public read prompts" on prompts for select using (true);
create policy "public read engines" on engines for select using (true);
create policy "public read raw_responses" on raw_responses for select using (true);
create policy "public read citations" on citations for select using (true);

-- Demo-only: the Next.js frontend manages prompts (add/deactivate) directly
-- via the anon key, since it's not citation data written by the backend.
create policy "public insert prompts" on prompts for insert with check (true);
create policy "public update prompts" on prompts for update using (true);

-- Demo-only: the frontend manages tracked brand/competitor domains directly.
create policy "public insert tracked_urls" on tracked_urls for insert with check (true);
create policy "public delete tracked_urls" on tracked_urls for delete using (true);

-- Seed a single demo project + prompts (safe to re-run).
insert into projects (id, name, domain)
select '00000000-0000-0000-0000-000000000001', 'Citelytics Demo', 'citelytics.ai'
where not exists (select 1 from projects where id = '00000000-0000-0000-0000-000000000001');

-- Seed our own brand as a tracked, non-competitor domain. Competitors are
-- added by the user via the Brands page.
insert into tracked_urls (project_id, url, is_competitor)
select '00000000-0000-0000-0000-000000000001', 'bajajconsumercare.com', false
where not exists (
  select 1 from tracked_urls where project_id = '00000000-0000-0000-0000-000000000001' and url = 'bajajconsumercare.com'
);

insert into prompts (project_id, query_text)
select '00000000-0000-0000-0000-000000000001', q
from (values
  ('What is the best coconut oil for hair growth?'),
  ('How long does it take to see hair growth results from coconut oil?'),
  ('What ingredients are in Bajaj Almond Drops Hair Oil?'),
  ('Does coconut oil help with hair thickness?'),
  ('What is the shelf life of almond hair oil?')
) as t(q)
where not exists (
  select 1 from prompts p
  where p.project_id = '00000000-0000-0000-0000-000000000001' and p.query_text = t.q
);
