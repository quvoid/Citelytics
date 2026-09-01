-- Threads 0017's p_tag_mode through every RPC that scopes prompts —
-- 0017 gave metrics_scoped_prompts the parameter but nothing actually
-- called it with a caller-supplied value, so AND/OR tag filtering was wired
-- into the frontend and the innermost scoping function without ever
-- reaching the metric RPCs in between. Caught before it shipped: every one
-- of these functions is a plain input-parameter addition with a default
-- (return columns unchanged), so CREATE OR REPLACE is safe here — no DROP
-- needed, unlike 0016's return-shape change.

create or replace function metrics_brand_rollup(
  p_project uuid, p_from date, p_to date,
  p_engines uuid[] default null, p_countries text[] default null,
  p_tags uuid[] default null, p_topics uuid[] default null,
  p_prompts uuid[] default null, p_exclude_inactive boolean default false,
  p_tag_mode text default 'or'
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
    from metrics_scoped_prompts(p_project, p_tags, p_topics, p_prompts, p_exclude_inactive, p_tag_mode) t
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
  p_prompts uuid[] default null, p_exclude_inactive boolean default false,
  p_tag_mode text default 'or'
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
    from metrics_scoped_prompts(p_project, p_tags, p_topics, p_prompts, p_exclude_inactive, p_tag_mode) t
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
  p_prompts uuid[] default null, p_exclude_inactive boolean default false,
  p_tag_mode text default 'or'
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
    from metrics_scoped_prompts(p_project, p_tags, p_topics, p_prompts, p_exclude_inactive, p_tag_mode) t
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

create or replace function metrics_group_rollup(
  p_project uuid, p_from date, p_to date,
  p_group text, p_brand uuid,
  p_engines uuid[] default null, p_countries text[] default null,
  p_tags uuid[] default null, p_topics uuid[] default null,
  p_prompts uuid[] default null, p_exclude_inactive boolean default false,
  p_tag_mode text default 'or'
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
    from metrics_scoped_prompts(p_project, p_tags, p_topics, p_prompts, p_exclude_inactive, p_tag_mode) t
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

create or replace function metrics_segment_matrix(
  p_project uuid, p_from date, p_to date,
  p_brand uuid, p_row text, p_col text,
  p_engines uuid[] default null, p_countries text[] default null,
  p_tags uuid[] default null, p_topics uuid[] default null,
  p_prompts uuid[] default null, p_exclude_inactive boolean default false,
  p_tag_mode text default 'or'
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
    from metrics_scoped_prompts(p_project, p_tags, p_topics, p_prompts, p_exclude_inactive, p_tag_mode) t
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

create or replace function metrics_slice_responses(
  p_project uuid, p_from date, p_to date,
  p_engines uuid[] default null, p_countries text[] default null,
  p_tags uuid[] default null, p_topics uuid[] default null,
  p_prompts uuid[] default null, p_exclude_inactive boolean default false,
  p_tag_mode text default 'or'
) returns table (
  engine_id uuid,
  responses bigint,
  days_with_data bigint
) language sql stable as $$
  with sp as (
    select t as id
    from metrics_scoped_prompts(p_project, p_tags, p_topics, p_prompts, p_exclude_inactive, p_tag_mode) t
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

create or replace function metrics_source_rollup(
  p_project uuid, p_from date, p_to date,
  p_engines uuid[] default null, p_countries text[] default null,
  p_tags uuid[] default null, p_topics uuid[] default null,
  p_prompts uuid[] default null, p_exclude_inactive boolean default false,
  p_tag_mode text default 'or'
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
    from metrics_scoped_prompts(p_project, p_tags, p_topics, p_prompts, p_exclude_inactive, p_tag_mode) t
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
  p_prompts uuid[] default null, p_exclude_inactive boolean default false,
  p_tag_mode text default 'or'
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
    from metrics_scoped_prompts(p_project, p_tags, p_topics, p_prompts, p_exclude_inactive, p_tag_mode) t
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

-- Product RPCs (0019) hardcoded 'or' since p_tag_mode didn't exist as a
-- caller-supplied concept yet at the time they were written — parameterize
-- them the same way, still hardcoding 'shopping' for p_prompt_type since
-- that one is correctly fixed, not caller-supplied.
create or replace function metrics_product_rollup(
  p_project uuid, p_from date, p_to date,
  p_engines uuid[] default null, p_countries text[] default null,
  p_tags uuid[] default null, p_topics uuid[] default null,
  p_prompts uuid[] default null, p_exclude_inactive boolean default false,
  p_tag_mode text default 'or'
) returns table (
  product_id uuid,
  responses bigint,
  mention_count bigint,
  win_count bigint,
  position_sum bigint,
  position_n bigint,
  days_with_data bigint
) language sql stable as $$
  with sp as (
    select t as id
    from metrics_scoped_prompts(
      p_project, p_tags, p_topics, p_prompts, p_exclude_inactive, p_tag_mode, 'shopping'
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

create or replace function metrics_product_slice_responses(
  p_project uuid, p_from date, p_to date,
  p_engines uuid[] default null, p_countries text[] default null,
  p_tags uuid[] default null, p_topics uuid[] default null,
  p_prompts uuid[] default null, p_exclude_inactive boolean default false,
  p_tag_mode text default 'or'
) returns table (
  engine_id uuid,
  responses bigint,
  days_with_data bigint
) language sql stable as $$
  with sp as (
    select t as id
    from metrics_scoped_prompts(
      p_project, p_tags, p_topics, p_prompts, p_exclude_inactive, p_tag_mode, 'shopping'
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
