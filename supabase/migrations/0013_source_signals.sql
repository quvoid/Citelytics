-- Two independent facts the app has never separately stored, both needed for
-- Peec-parity source features: whether a citation was actually drawn from in
-- the visible answer text (vs. quietly retrieved and never referenced), and
-- whether a tracked brand's own domain was cited AT ALL — independent of
-- whether the brand was also named.


-- ---------------------------------------------------------------------------
-- 1. citations.cited_in_text — real attribution vs. quiet influence
-- ---------------------------------------------------------------------------
-- Null = unknown, not "not cited". True for every OpenRouter citation (its
-- url_citation annotations only exist for text actually cited inline — see
-- clients/openrouter_client.py). For Gemini, set going forward by
-- gemini_client.py parsing groundingSupports; historical Gemini rows get
-- backfilled by backend/backfill_cited_in_text.py, which re-derives this
-- from raw_responses.raw_response — the full API response is already stored
-- as jsonb, so this needs no re-fetch and costs no Gemini quota.
alter table citations add column if not exists cited_in_text boolean;


-- ---------------------------------------------------------------------------
-- 2. answer_brand_mentions.cited_domain — retrieval, independent of naming
-- ---------------------------------------------------------------------------
-- `considered` (migration 0006) is `mentioned OR cited_domain` — an OR, not
-- two separate facts, so you cannot recover "was this brand's site cited
-- without ever being named" (a real, distinct signal — Peec's "cited but
-- never mentioned" content-authority gap) from `considered` alone. This
-- column is exactly the retrieval half on its own.
alter table answer_brand_mentions add column if not exists cited_domain boolean not null default false;

-- Backfillable in pure SQL — domain matching is deterministic string logic
-- (the same rule as backend/normalize.py::domain_matches: exact match or a
-- subdomain), not an LLM judgment call. No API cost, no quota, runs once for
-- all existing history.
update answer_brand_mentions m
set cited_domain = exists (
  select 1
  from citations c
  join tracked_urls t on t.id = m.tracked_url_id
  where c.raw_response_id = m.raw_response_id
    and (
      lower(c.domain) = lower(t.url)
      or lower(c.domain) like '%.' || lower(t.url)
    )
)
where true;
