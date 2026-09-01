-- Specific models named per answer ("Edge 70 Fusion", "Razr Fold", "Galaxy
-- S23") — one level more specific than the existing brand-level tracking
-- (tracked_urls / answer_brand_mentions, which only know "Motorola").
-- Freely extracted per answer, not matched against a maintained SKU list,
-- so it covers new/unlisted products automatically — the trade-off is
-- looser matching than exact brand extraction, same trade-off already
-- accepted for the `topic` field.
--
-- NOTE: this migration originally also added a `category` column to
-- `prompts` (AI-decided aspect label — Camera/Display/Performance/...).
-- That's been dropped in favor of a proper user-managed tagging system
-- instead (see 0009_tags.sql) — never pushed live, so simplest to just
-- rewrite this file rather than ship a column for one migration cycle and
-- immediately deprecate it.

create table if not exists answer_product_tags (
  id uuid primary key default gen_random_uuid(),
  raw_response_id uuid not null references raw_responses(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now()
);
create index if not exists answer_product_tags_raw_response_idx on answer_product_tags(raw_response_id);

alter table answer_product_tags enable row level security;
create policy "public read answer_product_tags" on answer_product_tags for select using (true);
