-- The metrics query layer: aggregation moves out of JavaScript and into
-- Postgres.
--
-- Why this exists at all. Every page today pulls whole tables across the wire
-- and aggregates in Node. Two things break that, neither of which announces
-- itself:
--
--   * PostgREST's default max-rows is 1000 and nothing in queries.ts sets
--     .range() or checks `error`. `citations` is already at 574. At daily
--     cadence the pages quietly start computing metrics from an arbitrary
--     1000-row slice.
--   * getAnswerBrandMentions() builds an in.(...) list of every response id.
--     At a few thousand ids that exceeds the URL limit and 400s — again with
--     `data ?? []` swallowing it.
--
-- THE ONE RULE IN THIS FILE: these functions return SUMS AND COUNTS, NEVER
-- RATES. SUM(a)/SUM(b) re-aggregates correctly across days, engines and
-- countries in any direction; an average cannot be re-averaged without its
-- weights. Every percentage in the product is computed in exactly one place,
-- frontend/lib/metrics/finalize.ts. That is what stops the backend and the
-- frontend drifting apart, which they already have.


-- ---------------------------------------------------------------------------
-- Prompt scoping — shared by every function below
-- ---------------------------------------------------------------------------
-- Within a dimension the filter is OR (any of the selected tags); across
-- dimensions it is AND (a selected tag AND a selected topic).
create or replace function metrics_scoped_prompts(
  p_project uuid,
  p_tags uuid[] default null,
  p_topics uuid[] default null,
  p_prompts uuid[] default null,
  p_exclude_inactive boolean default false
) returns setof uuid
language sql stable as $$
  select p.id
  from prompts p
  where p.project_id = p_project
    -- An explicit prompt list wins over the type filter, so the prompt-detail
    -- page can scope to a perception prompt if it ever needs to.
    and (p_prompts is not null or p.prompt_type = 'citation')
    and (not p_exclude_inactive or p.active)
    and (p_prompts is null or p.id = any(p_prompts))
    and (p_topics  is null or p.topic_id = any(p_topics))
    and (p_tags    is null or exists (
           select 1 from prompt_tags pt
           where pt.prompt_id = p.id and pt.tag_id = any(p_tags)));
$$;


-- ---------------------------------------------------------------------------
-- Axis expansion — turns one fact row into its (topic|tag|engine|country|prompt) keys
-- ---------------------------------------------------------------------------
-- The tag branch expands one prompt into N rows, one per tag. That is
-- deliberate and it is only correct for RATES: each cell gets its own
-- denominator, so "prompts tagged X have visibility Y" stays a well-formed
-- statement even when prompts overlap between tags. It would be flatly wrong
-- for a count, which is why nothing downstream renders a total row or column.
create or replace function metrics_axis_keys(
  p_axis text, p_prompt uuid, p_engine uuid, p_country text
) returns table (k text, label text)
language sql stable as $$
  select coalesce(t.id::text, 'uncategorized'), coalesce(t.name, 'Uncategorized')
  from prompts p
  left join topics t on t.id = p.topic_id
  where p_axis = 'topic' and p.id = p_prompt

  union all

  select coalesce(tg.id::text, 'untagged'), coalesce(tg.name, 'Untagged')
  from (select 1) z
  left join prompt_tags pt on pt.prompt_id = p_prompt
  left join tags tg on tg.id = pt.tag_id
  where p_axis = 'tag'

  union all

  select p.id::text, p.query_text
  from prompts p
  where p_axis = 'prompt' and p.id = p_prompt

  union all

  select e.id::text, e.name
  from engines e
  where p_axis = 'engine' and e.id = p_engine

  union all

  select coalesce(nullif(p_country, ''), 'none'),
         coalesce(nullif(p_country, ''), 'Unknown')
  where p_axis = 'country';
$$;


-- ---------------------------------------------------------------------------
-- Per-brand rollup — the workhorse
-- ---------------------------------------------------------------------------
-- `responses` counts usable responses that have a mention row FOR THIS BRAND.
-- For a brand tracked since day one that equals the total; for one added last
-- week it does not, and that difference is exactly how the UI knows to say
-- "tracked since 12 Aug" rather than rendering a fake 0%.
create or replace function metrics_brand_rollup(
  p_project uuid, p_from date, p_to date,
  p_engines uuid[] default null, p_countries text[] default null,
  p_tags uuid[] default null, p_topics uuid[] default null,
  p_prompts uuid[] default null, p_exclude_inactive boolean default false
) returns table (
  tracked_url_id uuid,
  responses bigint,
  mention_count bigint,
  considered_not_named bigint,
  sentiment_sum bigint,
  sentiment_n bigint,
  position_sum bigint,
  position_n bigint,
  days_with_data bigint
) language sql stable as $$
  with sp as (
    select t as id
    from metrics_scoped_prompts(p_project, p_tags, p_topics, p_prompts, p_exclude_inactive) t
  )
  select
    m.tracked_url_id,
    count(*)::bigint,
    count(*) filter (where m.mentioned)::bigint,
    count(*) filter (where m.considered and not m.mentioned)::bigint,
    coalesce(sum(m.sentiment_score) filter (where m.mentioned), 0)::bigint,
    count(*) filter (where m.mentioned and m.sentiment_score is not null)::bigint,
    coalesce(sum(m.position) filter (where m.mentioned), 0)::bigint,
    count(*) filter (where m.mentioned and m.position is not null)::bigint,
    count(distinct m.captured_on)::bigint
  from answer_brand_mentions m
  join raw_responses r on r.id = m.raw_response_id and r.is_usable
  where m.project_id = p_project
    and m.captured_on between p_from and p_to
    and (p_engines   is null or m.engine_id = any(p_engines))
    and (p_countries is null or m.country   = any(p_countries))
    and m.prompt_id in (select id from sp)
  group by m.tracked_url_id;
$$;


-- ---------------------------------------------------------------------------
-- Time series
-- ---------------------------------------------------------------------------
-- Buckets are built from sums, so a week containing three fetch days produces
-- one honest point weighted by the observations that actually exist. Days with
-- no fetch simply produce no row — the caller renders them as gaps, never as
-- zeros (zero asserts "we asked and you weren't there") and never carried
-- forward (which turns a resumed measurement into an apparent crash).
create or replace function metrics_brand_series(
  p_project uuid, p_from date, p_to date,
  p_bucket text default 'day',
  p_engines uuid[] default null, p_countries text[] default null,
  p_tags uuid[] default null, p_topics uuid[] default null,
  p_prompts uuid[] default null, p_exclude_inactive boolean default false
) returns table (
  tracked_url_id uuid,
  bucket_start date,
  responses bigint,
  mention_count bigint,
  considered_not_named bigint,
  sentiment_sum bigint,
  sentiment_n bigint,
  position_sum bigint,
  position_n bigint,
  days_with_data bigint
) language sql stable as $$
  with sp as (
    select t as id
    from metrics_scoped_prompts(p_project, p_tags, p_topics, p_prompts, p_exclude_inactive) t
  )
  select
    m.tracked_url_id,
    case p_bucket
      when 'week'  then date_trunc('week',  m.captured_on::timestamp)::date
      when 'month' then date_trunc('month', m.captured_on::timestamp)::date
      else m.captured_on
    end,
    count(*)::bigint,
    count(*) filter (where m.mentioned)::bigint,
    count(*) filter (where m.considered and not m.mentioned)::bigint,
    coalesce(sum(m.sentiment_score) filter (where m.mentioned), 0)::bigint,
    count(*) filter (where m.mentioned and m.sentiment_score is not null)::bigint,
    coalesce(sum(m.position) filter (where m.mentioned), 0)::bigint,
    count(*) filter (where m.mentioned and m.position is not null)::bigint,
    count(distinct m.captured_on)::bigint
  from answer_brand_mentions m
  join raw_responses r on r.id = m.raw_response_id and r.is_usable
  where m.project_id = p_project
    and m.captured_on between p_from and p_to
    and (p_engines   is null or m.engine_id = any(p_engines))
    and (p_countries is null or m.country   = any(p_countries))
    and m.prompt_id in (select id from sp)
  group by 1, 2;
$$;


-- ---------------------------------------------------------------------------
-- Per-engine breakdown — strongest / weakest model
-- ---------------------------------------------------------------------------
-- Also the honest way to render `considered_not_named`: Gemini's grounding
-- exposes everything its retrieval touched, OpenRouter's web_search only
-- exposes what it actually cited, so a blended "considered" number's value
-- depends on the engine mix rather than on the brand. Per engine only.
create or replace function metrics_brand_by_engine(
  p_project uuid, p_from date, p_to date,
  p_engines uuid[] default null, p_countries text[] default null,
  p_tags uuid[] default null, p_topics uuid[] default null,
  p_prompts uuid[] default null, p_exclude_inactive boolean default false
) returns table (
  tracked_url_id uuid,
  engine_id uuid,
  responses bigint,
  mention_count bigint,
  considered_not_named bigint,
  sentiment_sum bigint,
  sentiment_n bigint,
  position_sum bigint,
  position_n bigint,
  days_with_data bigint
) language sql stable as $$
  with sp as (
    select t as id
    from metrics_scoped_prompts(p_project, p_tags, p_topics, p_prompts, p_exclude_inactive) t
  )
  select
    m.tracked_url_id,
    m.engine_id,
    count(*)::bigint,
    count(*) filter (where m.mentioned)::bigint,
    count(*) filter (where m.considered and not m.mentioned)::bigint,
    coalesce(sum(m.sentiment_score) filter (where m.mentioned), 0)::bigint,
    count(*) filter (where m.mentioned and m.sentiment_score is not null)::bigint,
    coalesce(sum(m.position) filter (where m.mentioned), 0)::bigint,
    count(*) filter (where m.mentioned and m.position is not null)::bigint,
    count(distinct m.captured_on)::bigint
  from answer_brand_mentions m
  join raw_responses r on r.id = m.raw_response_id and r.is_usable
  where m.project_id = p_project
    and m.captured_on between p_from and p_to
    and (p_engines   is null or m.engine_id = any(p_engines))
    and (p_countries is null or m.country   = any(p_countries))
    and m.prompt_id in (select id from sp)
  group by 1, 2;
$$;


-- ---------------------------------------------------------------------------
-- Grouped rollup — powers the Prompts page (by prompt / by topic / by tag)
-- ---------------------------------------------------------------------------
create or replace function metrics_group_rollup(
  p_project uuid, p_from date, p_to date,
  p_group text, p_brand uuid,
  p_engines uuid[] default null, p_countries text[] default null,
  p_tags uuid[] default null, p_topics uuid[] default null,
  p_prompts uuid[] default null, p_exclude_inactive boolean default false
) returns table (
  group_key text,
  group_label text,
  prompt_count bigint,
  responses bigint,
  mention_count bigint,
  sentiment_sum bigint,
  sentiment_n bigint,
  position_sum bigint,
  position_n bigint
) language sql stable as $$
  with sp as (
    select t as id
    from metrics_scoped_prompts(p_project, p_tags, p_topics, p_prompts, p_exclude_inactive) t
  ),
  base as (
    select m.prompt_id, m.engine_id, m.country, m.mentioned, m.position, m.sentiment_score
    from answer_brand_mentions m
    join raw_responses r on r.id = m.raw_response_id and r.is_usable
    where m.project_id = p_project
      and m.tracked_url_id = p_brand
      and m.captured_on between p_from and p_to
      and (p_engines   is null or m.engine_id = any(p_engines))
      and (p_countries is null or m.country   = any(p_countries))
      and m.prompt_id in (select id from sp)
  )
  select
    gk.k,
    gk.label,
    count(distinct b.prompt_id)::bigint,
    count(*)::bigint,
    count(*) filter (where b.mentioned)::bigint,
    coalesce(sum(b.sentiment_score) filter (where b.mentioned), 0)::bigint,
    count(*) filter (where b.mentioned and b.sentiment_score is not null)::bigint,
    coalesce(sum(b.position) filter (where b.mentioned), 0)::bigint,
    count(*) filter (where b.mentioned and b.position is not null)::bigint
  from base b
  cross join lateral metrics_axis_keys(p_group, b.prompt_id, b.engine_id, b.country) gk
  group by 1, 2;
$$;


-- ---------------------------------------------------------------------------
-- Segment matrix — the Topic x Tag performance heatmap
-- ---------------------------------------------------------------------------
create or replace function metrics_segment_matrix(
  p_project uuid, p_from date, p_to date,
  p_brand uuid, p_row text, p_col text,
  p_engines uuid[] default null, p_countries text[] default null,
  p_tags uuid[] default null, p_topics uuid[] default null,
  p_prompts uuid[] default null, p_exclude_inactive boolean default false
) returns table (
  row_key text, row_label text,
  col_key text, col_label text,
  prompt_count bigint,
  responses bigint,
  mention_count bigint,
  sentiment_sum bigint,
  sentiment_n bigint,
  position_sum bigint,
  position_n bigint
) language sql stable as $$
  with sp as (
    select t as id
    from metrics_scoped_prompts(p_project, p_tags, p_topics, p_prompts, p_exclude_inactive) t
  ),
  base as (
    select m.prompt_id, m.engine_id, m.country, m.mentioned, m.position, m.sentiment_score
    from answer_brand_mentions m
    join raw_responses r on r.id = m.raw_response_id and r.is_usable
    where m.project_id = p_project
      and m.tracked_url_id = p_brand
      and m.captured_on between p_from and p_to
      and (p_engines   is null or m.engine_id = any(p_engines))
      and (p_countries is null or m.country   = any(p_countries))
      and m.prompt_id in (select id from sp)
  )
  select
    rk.k, rk.label, ck.k, ck.label,
    count(distinct b.prompt_id)::bigint,
    count(*)::bigint,
    count(*) filter (where b.mentioned)::bigint,
    coalesce(sum(b.sentiment_score) filter (where b.mentioned), 0)::bigint,
    count(*) filter (where b.mentioned and b.sentiment_score is not null)::bigint,
    coalesce(sum(b.position) filter (where b.mentioned), 0)::bigint,
    count(*) filter (where b.mentioned and b.position is not null)::bigint
  from base b
  cross join lateral metrics_axis_keys(p_row, b.prompt_id, b.engine_id, b.country) rk
  cross join lateral metrics_axis_keys(p_col, b.prompt_id, b.engine_id, b.country) ck
  group by 1, 2, 3, 4;
$$;


-- ---------------------------------------------------------------------------
-- Filter options — everything the shared FilterBar needs, in one round trip
-- ---------------------------------------------------------------------------
create or replace function metrics_filter_options(p_project uuid)
returns json language sql stable as $$
  select json_build_object(
    'engines', coalesce((
      select json_agg(json_build_object('id', e.id, 'name', e.name) order by e.name)
      from engines e), '[]'::json),

    'tags', coalesce((
      select json_agg(json_build_object('id', t.id, 'name', t.name, 'promptCount', c.n) order by t.name)
      from tags t
      cross join lateral (
        select count(*) as n from prompt_tags pt
        join prompts p on p.id = pt.prompt_id
        where pt.tag_id = t.id and p.project_id = p_project
      ) c
      where t.project_id = p_project), '[]'::json),

    'topics', coalesce((
      select json_agg(json_build_object('id', tp.id, 'name', tp.name, 'promptCount', c.n) order by tp.name)
      from topics tp
      cross join lateral (
        select count(*) as n from prompts p
        where p.topic_id = tp.id and p.project_id = p_project
      ) c
      where tp.project_id = p_project), '[]'::json),

    'countries', coalesce((
      select json_agg(json_build_object('code', x.code, 'promptCount', x.n) order by x.n desc)
      from (
        select coalesce(nullif(p.country, ''), pr.default_country) as code, count(*) as n
        from prompts p
        join projects pr on pr.id = p.project_id
        where p.project_id = p_project and p.prompt_type = 'citation'
        group by 1
      ) x), '[]'::json),

    -- `last` is the last day with usable data, and ranges clamp to it rather
    -- than to today: a range ending "today" silently compares a half-finished
    -- day against complete ones.
    'dataRange', (
      select case when count(*) = 0 then null else
        json_build_object('first', min(r.captured_on), 'last', max(r.captured_on))
      end
      from raw_responses r
      join prompts p on p.id = r.prompt_id
      where p.project_id = p_project and r.is_usable)
  );
$$;
