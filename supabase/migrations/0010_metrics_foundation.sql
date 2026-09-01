-- Metrics foundation: everything the per-brand analytics layer needs before
-- any dashboard can be built on it. Four concerns, one migration, because
-- they are useless apart — the RPCs in 0011 read all four.
--
--   1. topics become first-class and user-managed (like tags in 0009)
--   2. sentiment becomes per-brand instead of own-brand-only
--   3. answer_brand_mentions gets the denormalised columns that make it
--      queryable as a fact table
--   4. tracked_urls learns when it started being tracked
--
-- Additive only. Nothing here drops a column or changes an existing value's
-- meaning, so it is safe to apply before the code that reads it ships.


-- ---------------------------------------------------------------------------
-- 1. Topics, first-class
-- ---------------------------------------------------------------------------
-- Until now `prompts.topic` was free text the classifier invented per answer.
-- That is fine for a label and useless as an axis: "Hair Oil" / "Hair oils" /
-- "Hair-oil" are three different topics to a GROUP BY, which turns the
-- Topic x Tag matrix into noise. Same shape as `tags` (0009), but a prompt
-- has exactly ONE topic where it can carry many tags — so this is a plain FK,
-- not a junction table.
create table if not exists topics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  -- True until a human creates/renames/reassigns it. Lets the UI mark a topic
  -- as "suggested" and lets the classifier prefer reusing an existing label
  -- over inventing a near-duplicate.
  is_ai_suggested boolean not null default true,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

alter table prompts add column if not exists topic_id uuid references topics(id) on delete set null;
create index if not exists prompts_topic_id_idx on prompts(topic_id);

-- Seed from the free-text labels already sitting on prompts, then point each
-- prompt at its new row. Trimmed, because the classifier has produced values
-- with trailing whitespace before.
insert into topics (project_id, name, is_ai_suggested)
select distinct p.project_id, btrim(p.topic), true
from prompts p
where coalesce(btrim(p.topic), '') <> ''
on conflict (project_id, name) do nothing;

update prompts p
set topic_id = t.id
from topics t
where t.project_id = p.project_id
  and t.name = btrim(p.topic)
  and p.topic_id is null;

-- `prompts.topic` deliberately survives for one release as the classifier's
-- raw suggestion, so a bad topic_id backfill is recoverable. Drop it in 0012.

alter table topics enable row level security;

drop policy if exists "public read topics"   on topics;
drop policy if exists "public insert topics" on topics;
drop policy if exists "public update topics" on topics;
drop policy if exists "public delete topics" on topics;

create policy "public read topics"   on topics for select using (true);
create policy "public insert topics" on topics for insert with check (true);
create policy "public update topics" on topics for update using (true);
create policy "public delete topics" on topics for delete using (true);


-- ---------------------------------------------------------------------------
-- 2. Per-brand sentiment
-- ---------------------------------------------------------------------------
-- `raw_responses.brand_sentiment_score` only ever held the OWN brand's score —
-- the classifier schema hard-codes the own brand's name into the field
-- description. Competitor sentiment existed nowhere, so a "sentiment per
-- brand" table column was impossible to render. This is that column.
alter table answer_brand_mentions
  add column if not exists sentiment_score smallint,
  -- Re-classification is non-deterministic. Without a version stamp there is
  -- no way to tell a genuine sentiment shift from a change to the classifier
  -- prompt, and no way to know that backfilled rows were scored by a
  -- different prompt than everything written after them.
  add column if not exists classifier_version text;

do $$
begin
  alter table answer_brand_mentions
    add constraint abm_sentiment_range
    check (sentiment_score is null or sentiment_score between 0 and 100);
exception when duplicate_object then null;
end $$;


-- ---------------------------------------------------------------------------
-- 3. Fact denormalisation
-- ---------------------------------------------------------------------------
-- answer_brand_mentions is already one row per (response, brand) written at
-- fetch time — it IS the daily fact table. It just lacks the columns you would
-- filter and index on, so every rollup had to pull raw_responses and prompts
-- across the wire and join them in JavaScript.

-- Generated, so it cannot drift and no future writer can forget it. Pinned to
-- UTC on purpose: three pages currently mix UTC string slicing with
-- local-time Date.now() windows, which is two different calendars on one page.
alter table raw_responses
  add column if not exists captured_on date
  generated always as (((fetched_at at time zone 'UTC')::date)) stored;

-- An engine that rate-limited or returned nothing still gets a raw_responses
-- row (tasks.py falls back to a stub classification). Counting those in the
-- visibility denominator turns an engine outage into a brand visibility
-- crash, which is a lie about the brand.
alter table raw_responses
  add column if not exists is_usable boolean not null default true;

update raw_responses set is_usable = false
where coalesce(btrim(answer_text), '') = '';

create index if not exists raw_responses_slice_idx
  on raw_responses (prompt_id, captured_on, engine_id) where is_usable;

alter table answer_brand_mentions
  add column if not exists project_id  uuid references projects(id) on delete cascade,
  add column if not exists prompt_id   uuid references prompts(id)  on delete cascade,
  add column if not exists engine_id   uuid references engines(id),
  add column if not exists country     text,
  add column if not exists captured_on date;

update answer_brand_mentions m set
  project_id  = p.project_id,
  prompt_id   = r.prompt_id,
  engine_id   = r.engine_id,
  country     = coalesce(r.country, ''),
  captured_on = r.captured_on
from raw_responses r
join prompts p on p.id = r.prompt_id
where r.id = m.raw_response_id
  and m.project_id is null;

-- store.py sets these explicitly (it has all five in scope already); this
-- trigger catches anything a future writer or an ad-hoc backfill forgets, so
-- the two paths cannot silently diverge.
create or replace function abm_fill_denorm() returns trigger language plpgsql as $$
begin
  if new.project_id is null or new.captured_on is null then
    select p.project_id, r.prompt_id, r.engine_id, coalesce(r.country, ''), r.captured_on
      into new.project_id, new.prompt_id, new.engine_id, new.country, new.captured_on
    from raw_responses r
    join prompts p on p.id = r.prompt_id
    where r.id = new.raw_response_id;
  end if;
  return new;
end $$;

drop trigger if exists abm_fill_denorm_trg on answer_brand_mentions;
create trigger abm_fill_denorm_trg
  before insert on answer_brand_mentions
  for each row execute function abm_fill_denorm();

alter table answer_brand_mentions alter column country set default '';

-- The one index that turns every filtered rollup into an index-only scan.
create index if not exists abm_slice_idx
  on answer_brand_mentions (project_id, captured_on, engine_id, tracked_url_id)
  include (mentioned, position, sentiment_score, considered);

create index if not exists abm_prompt_slice_idx
  on answer_brand_mentions (prompt_id, captured_on);


-- ---------------------------------------------------------------------------
-- 4. When did we start tracking this brand?
-- ---------------------------------------------------------------------------
-- Add a competitor today and it has zero mention rows across all prior
-- history, while the visibility denominator still covers that history — so it
-- renders 0% forever and looks like real data. This column is what lets the
-- UI say "tracked since 12 Aug" instead of lying.
alter table tracked_urls add column if not exists created_at timestamptz not null default now();
