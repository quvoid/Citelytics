-- ============================================================
-- Citelytics — pending migrations 0017 through 0020 (round 3).
-- Generated from supabase/migrations/. Do not edit by hand.
-- Paste this whole file into the Supabase SQL Editor and Run.
-- ============================================================


-- ============================================================
-- 0017_tag_groups.sql
-- ============================================================

-- Tag groups + AND/OR tag combination — the two real gaps in the tag system
-- versus Peec's actual model (confirmed against docs.peec.ai directly, not
-- just the earlier summary doc).
--
-- Tag groups: Peec's own public API index lists list-tag-groups /
-- update-tag-group / delete-tag-group but NO create-tag-group endpoint —
-- groups aren't a separately-created hierarchical entity, they read as a
-- label that materializes from a field on the tag itself. Mirrored the same
-- way here: one nullable column, not a new junction table.
alter table tags add column if not exists group_name text;


-- AND/OR: metrics_scoped_prompts' tag filter has only ever been OR ("any of
-- these tags") — there was no way to ask for prompts carrying BOTH of two
-- tags at once, which Peec's Performance page explicitly supports
-- ("Filter by single tags or combinations, with AND/OR conditions").
--
-- Additive default parameter — CREATE OR REPLACE is safe here (unlike
-- 0016's brand-RPC change) because this only ADDS a trailing default
-- parameter; the return row type is unchanged, so no DROP FUNCTION needed.
create or replace function metrics_scoped_prompts(
  p_project uuid,
  p_tags uuid[] default null,
  p_topics uuid[] default null,
  p_prompts uuid[] default null,
  p_exclude_inactive boolean default false,
  p_tag_mode text default 'or',
  -- Which prompt_type this scoping applies to. Every existing caller wants
  -- 'citation' (the default preserves that), but the shopping metrics RPCs
  -- (0019) need 'shopping' instead — shopping prompts are a different
  -- prompt_type entirely and must never leak into brand-metrics rollups,
  -- or vice versa.
  p_prompt_type text default 'citation'
) returns setof uuid
language sql stable as $$
  select p.id
  from prompts p
  where p.project_id = p_project
    -- An explicit prompt list wins over the type filter, so the prompt-detail
    -- page can scope to a perception prompt if it ever needs to.
    and (p_prompts is not null or p.prompt_type = p_prompt_type)
    and (not p_exclude_inactive or p.active)
    and (p_prompts is null or p.id = any(p_prompts))
    and (p_topics  is null or p.topic_id = any(p_topics))
    and (
      p_tags is null
      or (
        p_tag_mode = 'and'
        and (
          select count(distinct pt.tag_id) from prompt_tags pt
          where pt.prompt_id = p.id and pt.tag_id = any(p_tags)
        ) = cardinality(p_tags)
      )
      or (
        p_tag_mode <> 'and'
        and exists (
          select 1 from prompt_tags pt
          where pt.prompt_id = p.id and pt.tag_id = any(p_tags)
        )
      )
    );
$$;


-- ---------------------------------------------------------------------------
-- metrics_filter_options: tag group_name + system tags (Branding, Intent)
-- ---------------------------------------------------------------------------
-- Peec auto-assigns two tag-LIKE dimensions to every prompt and filters by
-- them alongside real tags — "Branding" (branded/non-branded) and "Intent"
-- (Commercial/Informational/Transactional/Navigational). Citelytics already
-- computes both (prompts.is_branded, prompts.intent — local logic, zero
-- Gemini cost) but has never exposed them as filters. Free win: surface
-- them the same way real tags are surfaced, under a `system` key so the
-- frontend can render them as a visually distinct, non-editable group.
create or replace function metrics_filter_options(p_project uuid)
returns json language sql stable as $$
  select json_build_object(
    'engines', coalesce((
      select json_agg(json_build_object('id', e.id, 'name', e.name) order by e.name)
      from engines e), '[]'::json),

    'tags', coalesce((
      select json_agg(
        json_build_object('id', t.id, 'name', t.name, 'promptCount', c.n, 'groupName', t.group_name)
        order by t.name
      )
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

    'system', json_build_object(
      'branded', coalesce((
        select json_agg(json_build_object('value', x.is_branded, 'promptCount', x.n))
        from (
          select p.is_branded, count(*) as n
          from prompts p
          where p.project_id = p_project and p.prompt_type = 'citation'
          group by 1
        ) x), '[]'::json),
      'intent', coalesce((
        select json_agg(json_build_object('value', x.intent, 'promptCount', x.n) order by x.n desc)
        from (
          select p.intent, count(*) as n
          from prompts p
          where p.project_id = p_project and p.prompt_type = 'citation' and p.intent is not null
          group by 1
        ) x), '[]'::json)
    ),

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


-- ============================================================
-- 0018_shopping.sql
-- ============================================================

-- Shopping module schema — the same shape as brand tracking, one level down
-- (product instead of brand). Peec's real model, confirmed against
-- docs.peec.ai/products, /setting-up-shopping-prompts, /uploading-products:
-- shopping prompts are category-level ("best X for Y"), matched against
-- every product in that category via fanout — not one prompt per SKU.

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  -- "Brand or vendor name. Used to group products and resolve to a
  -- canonical brand" — Peec's own field description, kept verbatim as the
  -- column's purpose. Free text, not a tracked_urls FK: a product's brand
  -- as printed on a catalog feed doesn't need to be a brand you track.
  brand text not null,
  description text,
  -- Hierarchical, " > "-separated path per Peec's CSV format,
  -- e.g. "Hair Care > Oils". Plain text, not normalized — a handful of
  -- products in one category (this project's real scope) doesn't need a
  -- categories table.
  category text,
  price numeric,
  currency text,
  link text,
  image_link text,
  created_at timestamptz not null default now()
);
create index if not exists products_project_id_idx on products(project_id);

-- Mirrors answer_brand_mentions, denormalized the same way (0013's pattern)
-- so the same sums-first RPC style works unchanged.
create table if not exists product_mentions (
  id uuid primary key default gen_random_uuid(),
  raw_response_id uuid not null references raw_responses(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  mentioned boolean not null default false,
  -- 1-indexed rank among products actually recommended in this answer.
  -- Peec: "the metric to watch" — most users only see the first 2-3 results.
  position integer,
  -- The price the AI actually cited, vs. products.price (the catalog price)
  -- — the discrepancy itself is the signal, so this is stored raw rather
  -- than pre-diffed.
  mentioned_price numeric,
  project_id uuid references projects(id) on delete cascade,
  prompt_id uuid references prompts(id) on delete cascade,
  engine_id uuid references engines(id),
  country text default '',
  captured_on date,
  created_at timestamptz not null default now(),
  unique (raw_response_id, product_id)
);

create or replace function product_mentions_fill_denorm() returns trigger language plpgsql as $$
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

drop trigger if exists product_mentions_fill_denorm_trg on product_mentions;
create trigger product_mentions_fill_denorm_trg
  before insert on product_mentions
  for each row execute function product_mentions_fill_denorm();

create index if not exists product_mentions_slice_idx
  on product_mentions (project_id, captured_on, engine_id, product_id)
  include (mentioned, position);

-- Mirrors brand_attributes.
create table if not exists product_attributes (
  id uuid primary key default gen_random_uuid(),
  raw_response_id uuid not null references raw_responses(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  attribute text not null,
  created_at timestamptz not null default now()
);
create index if not exists product_attributes_raw_response_idx on product_attributes(raw_response_id);

alter table products enable row level security;
alter table product_mentions enable row level security;
alter table product_attributes enable row level security;

-- Products managed by the frontend (CSV upload runs through the backend's
-- service-role key, but manual add/remove should work the same way
-- tracked_urls does) — full public CRUD, matching tracked_urls' pattern.
drop policy if exists "public read products" on products;
drop policy if exists "public insert products" on products;
drop policy if exists "public update products" on products;
drop policy if exists "public delete products" on products;
create policy "public read products" on products for select using (true);
create policy "public insert products" on products for insert with check (true);
create policy "public update products" on products for update using (true);
create policy "public delete products" on products for delete using (true);

-- product_mentions / product_attributes are backend-written only (service
-- role, from the fetch pipeline) — read-only for the frontend, same as
-- answer_brand_mentions / brand_attributes.
create policy "public read product_mentions" on product_mentions for select using (true);
create policy "public read product_attributes" on product_attributes for select using (true);


-- ============================================================
-- 0019_shopping_rpc.sql
-- ============================================================

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


-- ============================================================
-- 0020_tag_mode_threading.sql
-- ============================================================

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

