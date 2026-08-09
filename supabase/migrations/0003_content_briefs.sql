-- Content briefs: AI-generated writing briefs for a prompt/topic where the
-- brand is currently absent from the citation set. Two-step lifecycle:
-- created 'pending' (just the prompt + where it came from), then 'scored'
-- once analysed via Gemini (same structured-output pattern as
-- classifier.py) to fill in tone/intent/language/article type, three prose
-- blocks, and a takeaway list.

create table if not exists content_briefs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  prompt_text text not null,
  origin text not null, -- e.g. "from gap: healthline.com" or "manual entry"
  status text not null default 'pending', -- pending | scored
  score integer, -- 0-100, null until analysed
  tone text,
  content_intent text, -- Commercial | Informational | Transactional | Navigational
  language text,
  article_type text, -- e.g. Buying guide, Explainer, Comparison
  cell_notes jsonb, -- short annotation per cell: {tone, content_intent, language, article_type}
  main_topic text,
  value_proposition text,
  target_audience text,
  key_takeaways text[],
  created_at timestamptz not null default now(),
  analysed_at timestamptz
);

create index if not exists content_briefs_project_id_idx on content_briefs(project_id);

alter table content_briefs enable row level security;
create policy "public read content_briefs" on content_briefs for select using (true);
-- No frontend insert/update policy: briefs are created and analysed through
-- the backend (service-role key) only, since analysis needs the Gemini API
-- key — same reasoning as projects, not a frontend-direct-insert table.
