-- Brand aliases (name-matching, not domain-matching — domain_matches already
-- handles subdomains fine) and Prompt Volume, in one file since both are
-- small additive columns with no interdependency.


-- ---------------------------------------------------------------------------
-- 1. tracked_urls.aliases — "Moto", "Lenovo Motorola" should count too
-- ---------------------------------------------------------------------------
-- classifier.py's _logic_mentioned_brands is a plain regex sweep over
-- tracked_urls.name — a brand referred to by any other name currently goes
-- uncounted. Aliases are extra candidate strings fed into that same sweep,
-- mapped back to the canonical name before anything downstream sees them.
alter table tracked_urls add column if not exists aliases text[] not null default '{}';

-- tracked_urls has select/insert/delete policies (0001) but no update policy
-- — there has never been an edit path for a brand. Aliases need one; add it
-- generally rather than just for this one column, matching the public
-- CRUD pattern already used for tags/topics.
drop policy if exists "public update tracked_urls" on tracked_urls;
create policy "public update tracked_urls" on tracked_urls for update using (true);


-- ---------------------------------------------------------------------------
-- 2. prompts.search_volume — Google Trends interest, persisted instead of thrown away
-- ---------------------------------------------------------------------------
-- backend/prompt_research.py already fetches real search interest per
-- candidate and returns it to the frontend; prompt-research-panel.tsx shows
-- it as a badge, then drops it the moment "Track this" is clicked. These
-- columns are where it should have been landing.
--
-- Raw 0-100 value, NOT the 1-5 "relative" bucket the UI shows — Peec's
-- "relative" framing is a percentile rank among a project's own tracked
-- prompts, computed client-side (frontend/lib/metrics), not a stored scale.
-- Manually-added prompts (no research candidate) keep this null: unknown,
-- never a fabricated score.
alter table prompts add column if not exists search_volume integer;
alter table prompts add column if not exists search_volume_checked_at timestamptz;

do $$
begin
  alter table prompts
    add constraint prompts_search_volume_range
    check (search_volume is null or search_volume between 0 and 100);
exception when duplicate_object then null;
end $$;
