-- Per-prompt country targeting.
--
-- Before this, the market every engine call was biased toward lived in a
-- single backend env var (ENGINE_LOCALE_COUNTRY) — one market per
-- deployment, changeable only by editing .env and restarting the workers.
-- That made "how do we look in the US vs the UK?" unanswerable, which is a
-- core question for every commercial AEO tool.
--
-- Model: a project has a home market (default_country); a prompt may
-- override it (prompts.country null = inherit the project's). The resolved
-- country is then stamped onto every raw_response and citation it produces,
-- so historical data stays correctly attributed even if the prompt's country
-- is changed later.

alter table projects add column if not exists default_country text not null default 'IN';

-- null = inherit projects.default_country at fetch time
alter table prompts add column if not exists country text;

-- The country actually resolved and sent to the engine for this answer.
-- Denormalized onto citations too (they already carry prompt_id/engine_id
-- the same way) so the Sources pages can filter by market without joining.
alter table raw_responses add column if not exists country text;
alter table citations add column if not exists country text;

create index if not exists citations_country_idx on citations(country);
create index if not exists raw_responses_country_idx on raw_responses(country);

-- Daily rollups gain a market dimension so the trend line can answer
-- "visibility in which market?" rather than silently blending them.
-- country = '' is the all-markets aggregate row (what the Overview KPI trend
-- reads by default); one additional row per country is written alongside it.
-- NOT NULL rather than nullable because upserts key on this column, and
-- Postgres unique constraints treat every null as distinct — which would
-- let the aggregate row be inserted over and over.
alter table daily_metrics add column if not exists country text not null default '';

alter table daily_metrics drop constraint if exists daily_metrics_project_id_date_key;

alter table daily_metrics
  drop constraint if exists daily_metrics_project_id_date_country_key;
alter table daily_metrics
  add constraint daily_metrics_project_id_date_country_key
  unique (project_id, date, country);

-- The frontend writes prompts directly via the anon key (see 0001), so the
-- country column is covered by the existing insert/update policies — no new
-- policy needed here.
