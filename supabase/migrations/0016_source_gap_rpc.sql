-- Two additions to the metrics RPC layer (0011):
--   1. Source-level rollup/series, grouped by domain instead of brand —
--      Retrieved %, Retrieval Rate, Citation Rate.
--   2. The brand rollup/series/by-engine functions extended with
--      cited_domain sums, so the named/cited quadrant matrix can be derived
--      from sums already in hand rather than a second query shape.
--
-- Same rule as 0011: every function returns SUMS AND COUNTS, never rates.
-- Division happens in exactly one place on the frontend
-- (lib/metrics/finalize.ts and its new lib/metrics/source.ts sibling).


-- ---------------------------------------------------------------------------
-- 1. Source-level rollup
-- ---------------------------------------------------------------------------
-- `retrieved_chats` = distinct answers that cited this domain at all
-- (Retrieved % numerator). `citation_count` = total citation rows from this
-- domain (Retrieval Rate numerator — can exceed retrieved_chats, a domain
-- can be cited more than once per answer). `cited_in_text_count` /
-- `cited_in_text_unknown_count` split the citations by whether
-- cited_in_text is true vs null — Citation Rate must divide by
-- (citation_count - unknown_count), never treat unknown as "not cited".
create or replace function metrics_source_rollup(
  p_project uuid, p_from date, p_to date,
  p_engines uuid[] default null, p_countries text[] default null,
  p_tags uuid[] default null, p_topics uuid[] default null,
  p_prompts uuid[] default null, p_exclude_inactive boolean default false
) returns table (
  domain text,
  retrieved_chats bigint,
  citation_count bigint,
  cited_in_text_count bigint,
  cited_in_text_unknown_count bigint,
  days_with_data bigint
) language sql stable as $$
  with sp as (
    select t as id
    from metrics_scoped_prompts(p_project, p_tags, p_topics, p_prompts, p_exclude_inactive) t
  )
  select
    c.domain,
    count(distinct c.raw_response_id)::bigint,
    count(*)::bigint,
    count(*) filter (where c.cited_in_text is true)::bigint,
    count(*) filter (where c.cited_in_text is null)::bigint,
    count(distinct r.captured_on)::bigint
  from citations c
  join raw_responses r on r.id = c.raw_response_id and r.is_usable
  where not c.is_simulated
    and c.prompt_id in (select id from sp)
    and r.captured_on between p_from and p_to
    and (p_engines   is null or c.engine_id = any(p_engines))
    and (p_countries is null or coalesce(c.country, '') = any(p_countries))
  group by c.domain;
$$;

create or replace function metrics_source_series(
  p_project uuid, p_from date, p_to date,
  p_bucket text default 'day',
  p_engines uuid[] default null, p_countries text[] default null,
  p_tags uuid[] default null, p_topics uuid[] default null,
  p_prompts uuid[] default null, p_exclude_inactive boolean default false
) returns table (
  domain text,
  bucket_start date,
  retrieved_chats bigint,
  citation_count bigint,
  cited_in_text_count bigint,
  cited_in_text_unknown_count bigint,
  days_with_data bigint
) language sql stable as $$
  with sp as (
    select t as id
    from metrics_scoped_prompts(p_project, p_tags, p_topics, p_prompts, p_exclude_inactive) t
  )
  select
    c.domain,
    case p_bucket
      when 'week'  then date_trunc('week',  r.captured_on::timestamp)::date
      when 'month' then date_trunc('month', r.captured_on::timestamp)::date
      else r.captured_on
    end,
    count(distinct c.raw_response_id)::bigint,
    count(*)::bigint,
    count(*) filter (where c.cited_in_text is true)::bigint,
    count(*) filter (where c.cited_in_text is null)::bigint,
    count(distinct r.captured_on)::bigint
  from citations c
  join raw_responses r on r.id = c.raw_response_id and r.is_usable
  where not c.is_simulated
    and c.prompt_id in (select id from sp)
    and r.captured_on between p_from and p_to
    and (p_engines   is null or c.engine_id = any(p_engines))
    and (p_countries is null or coalesce(c.country, '') = any(p_countries))
  group by 1, 2;
$$;


-- ---------------------------------------------------------------------------
-- 2. Brand RPCs extended with cited_domain sums (named/cited quadrant matrix)
-- ---------------------------------------------------------------------------
-- `cited_domain_count` = answers where this brand's own domain was cited,
-- regardless of whether it was also named. `both_count` = named AND cited.
-- The four quadrants are then: both_count (named+cited);
-- mention_count - both_count (named, not cited); cited_domain_count -
-- both_count (cited, not named); responses - the other three (neither).
--
-- CREATE OR REPLACE can't change a function's output columns (Postgres
-- error 42P13 — the row type is part of the function's identity), so these
-- three have to be dropped first. Signatures copied verbatim from 0011.
drop function if exists metrics_brand_rollup(uuid, date, date, uuid[], text[], uuid[], uuid[], uuid[], boolean);
drop function if exists metrics_brand_series(uuid, date, date, text, uuid[], text[], uuid[], uuid[], uuid[], boolean);
drop function if exists metrics_brand_by_engine(uuid, date, date, uuid[], text[], uuid[], uuid[], uuid[], boolean);

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
  days_with_data bigint,
  cited_domain_count bigint,
  both_count bigint
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
    count(distinct m.captured_on)::bigint,
    count(*) filter (where m.cited_domain)::bigint,
    count(*) filter (where m.cited_domain and m.mentioned)::bigint
  from answer_brand_mentions m
  join raw_responses r on r.id = m.raw_response_id and r.is_usable
  where m.project_id = p_project
    and m.captured_on between p_from and p_to
    and (p_engines   is null or m.engine_id = any(p_engines))
    and (p_countries is null or m.country   = any(p_countries))
    and m.prompt_id in (select id from sp)
  group by m.tracked_url_id;
$$;

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
  days_with_data bigint,
  cited_domain_count bigint,
  both_count bigint
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
    count(distinct m.captured_on)::bigint,
    count(*) filter (where m.cited_domain)::bigint,
    count(*) filter (where m.cited_domain and m.mentioned)::bigint
  from answer_brand_mentions m
  join raw_responses r on r.id = m.raw_response_id and r.is_usable
  where m.project_id = p_project
    and m.captured_on between p_from and p_to
    and (p_engines   is null or m.engine_id = any(p_engines))
    and (p_countries is null or m.country   = any(p_countries))
    and m.prompt_id in (select id from sp)
  group by 1, 2;
$$;

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
  days_with_data bigint,
  cited_domain_count bigint,
  both_count bigint
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
    count(distinct m.captured_on)::bigint,
    count(*) filter (where m.cited_domain)::bigint,
    count(*) filter (where m.cited_domain and m.mentioned)::bigint
  from answer_brand_mentions m
  join raw_responses r on r.id = m.raw_response_id and r.is_usable
  where m.project_id = p_project
    and m.captured_on between p_from and p_to
    and (p_engines   is null or m.engine_id = any(p_engines))
    and (p_countries is null or m.country   = any(p_countries))
    and m.prompt_id in (select id from sp)
  group by 1, 2;
$$;
