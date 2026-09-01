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
