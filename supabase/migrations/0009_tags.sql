-- User-managed prompt tagging, SEMrush-style: you define your own labels
-- ("Homepage", "Q1 Campaign", "High Priority") and apply as many as you
-- want to a prompt. Deliberately NOT AI-generated — this is the opposite
-- design choice from `topic`/`intent`/`product_tags`, which the model
-- decides. Tags are entirely yours: create, rename, delete, assign, all
-- from the frontend via the anon key, same as tracked_urls management.
--
-- Many-to-many via a junction table rather than a text[] column on
-- prompts, so a tag can be renamed/deleted in one place and every prompt
-- carrying it updates automatically, and so "how many prompts carry this
-- tag" is a real join instead of an array scan.

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table if not exists prompt_tags (
  prompt_id uuid not null references prompts(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (prompt_id, tag_id)
);
create index if not exists prompt_tags_tag_id_idx on prompt_tags(tag_id);

alter table tags enable row level security;
alter table prompt_tags enable row level security;

-- Frontend manages these directly via anon key, same as tracked_urls/prompts
-- (see 0001_init.sql's "Demo-only" policies) — not backend/service-role-only
-- like content_briefs, since there's no AI cost gating creation here.
create policy "public read tags" on tags for select using (true);
create policy "public insert tags" on tags for insert with check (true);
create policy "public update tags" on tags for update using (true);
create policy "public delete tags" on tags for delete using (true);

create policy "public read prompt_tags" on prompt_tags for select using (true);
create policy "public insert prompt_tags" on prompt_tags for insert with check (true);
create policy "public delete prompt_tags" on prompt_tags for delete using (true);
