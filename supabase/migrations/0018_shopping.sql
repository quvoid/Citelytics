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
