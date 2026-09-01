-- Per-product metrics RPC — sums-first, mirrors metrics_brand_rollup (0011)
-- exactly, grouped by product_id instead of tracked_url_id. Same rule as
-- every RPC in this layer: sums and counts only, never rates — division
-- happens once, in frontend/lib/metrics/product.ts.
--
-- Scoped to prompt_type = 'shopping' via 0017's p_prompt_type parameter on
-- metrics_scoped_prompts — shopping prompts must never leak into brand
-- rollups (which default to 'citation') or vice versa.
create or replace function metrics_product_rollup(
  p_project uuid, p_from date, p_to date,
  p_engines uuid[] default null, p_countries text[] default null,
  p_tags uuid[] default null, p_topics uuid[] default null,
  p_prompts uuid[] default null, p_exclude_inactive boolean default false
) returns table (
  product_id uuid,
  responses bigint,
  mention_count bigint,
  win_count bigint,       -- position = 1 -- Peec's "Win Rate" numerator
  position_sum bigint,
  position_n bigint,
  days_with_data bigint
) language sql stable as $$
  with sp as (
    select t as id
    from metrics_scoped_prompts(
      p_project, p_tags, p_topics, p_prompts, p_exclude_inactive, 'or', 'shopping'
    ) t
  )
  select
    m.product_id,
    count(*)::bigint,
    count(*) filter (where m.mentioned)::bigint,
    count(*) filter (where m.mentioned and m.position = 1)::bigint,
    coalesce(sum(m.position) filter (where m.mentioned), 0)::bigint,
    count(*) filter (where m.mentioned and m.position is not null)::bigint,
    count(distinct m.captured_on)::bigint
  from product_mentions m
  join raw_responses r on r.id = m.raw_response_id and r.is_usable
  where m.project_id = p_project
    and m.captured_on between p_from and p_to
    and (p_engines   is null or m.engine_id = any(p_engines))
    and (p_countries is null or m.country   = any(p_countries))
    and m.prompt_id in (select id from sp)
  group by m.product_id;
$$;

-- Total usable shopping-prompt chats in scope — the honest Visibility
-- denominator, same reasoning as metrics_slice_responses (0012): a product
-- added mid-flight has zero mention rows for prior history, and without
-- this independent count that gap is invisible.
create or replace function metrics_product_slice_responses(
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
    from metrics_scoped_prompts(
      p_project, p_tags, p_topics, p_prompts, p_exclude_inactive, 'or', 'shopping'
    ) t
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
