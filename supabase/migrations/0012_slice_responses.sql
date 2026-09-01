-- How many usable responses exist in a slice, independent of any brand.
--
-- Needed because "responses" in metrics_brand_rollup is deliberately
-- per-brand: it counts responses that were actually SCORED against that
-- brand. That is the right visibility denominator — a response from before a
-- competitor was tracked must not count as "we asked and it wasn't
-- mentioned", which would render absence of data as a real 0%.
--
-- But it means the per-brand count cannot detect its own incompleteness. With
-- a single tracked brand, max(per-brand responses) IS the total, so a brand
-- covering only two thirds of the slice looks like full coverage. This gives
-- the honest denominator to compare against, so the UI can say "scored on 18
-- of 28 answers, tracked since 1 Aug" instead of quietly implying it saw
-- everything.
--
-- Real case this caught: the Bajaj project has 28 usable responses but only
-- 18 carry a mention row — the other 10 are all from 2026-07-31, the first
-- fetch day, before per-brand mention tracking existed.
create or replace function metrics_slice_responses(
  p_project uuid, p_from date, p_to date,
  p_engines uuid[] default null, p_countries text[] default null,
  p_tags uuid[] default null, p_topics uuid[] default null,
  p_prompts uuid[] default null, p_exclude_inactive boolean default false
) returns table (
  engine_id uuid,
  responses bigint,
  days_with_data bigint
) language sql stable as $$
  with sp as (
    select t as id
    from metrics_scoped_prompts(p_project, p_tags, p_topics, p_prompts, p_exclude_inactive) t
  )
  select
    r.engine_id,
    count(*)::bigint,
    count(distinct r.captured_on)::bigint
  from raw_responses r
  where r.is_usable
    and r.captured_on between p_from and p_to
    and (p_engines   is null or r.engine_id = any(p_engines))
    and (p_countries is null or coalesce(r.country, '') = any(p_countries))
    and r.prompt_id in (select id from sp)
  group by r.engine_id;
$$;
