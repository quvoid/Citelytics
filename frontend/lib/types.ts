export type Project = {
  id: string;
  name: string;
  domain: string;
  /** Home market — inherited by every prompt that doesn't override it. */
  default_country: string;
};

export type ContentBrief = {
  id: string;
  project_id: string;
  prompt_text: string;
  origin: string;
  status: "pending" | "scored";
  score: number | null;
  tone: string | null;
  content_intent: string | null;
  language: string | null;
  article_type: string | null;
  cell_notes: {
    tone?: string | null;
    content_intent?: string | null;
    language?: string | null;
    article_type?: string | null;
  } | null;
  main_topic: string | null;
  value_proposition: string | null;
  target_audience: string | null;
  key_takeaways: string[] | null;
  created_at: string;
  analysed_at: string | null;
};

export type Prompt = {
  id: string;
  project_id: string;
  query_text: string;
  active: boolean;
  prompt_type: "citation" | "perception";
  /** ISO 3166-1 alpha-2, or null to inherit the project's default_country. */
  country: string | null;
  topic: string | null;
  intent: "Commercial" | "Informational" | "Transactional" | "Navigational" | null;
  is_branded: boolean;
  /** Raw 0-100 Google Trends interest, set only from a "Track this" research
   * candidate — a manually-typed prompt has no research behind it and stays
   * null (unknown, never fabricated). NOT the 1-5 "relative" scale the UI
   * shows — see lib/prompt-volume.ts's volumeBucket(). */
  search_volume: number | null;
  search_volume_checked_at: string | null;
};

export type ProductTag = {
  id: string;
  raw_response_id: string;
  tag: string;
};

/** User-created, user-managed prompt label — SEMrush-style. Not AI-generated
 * (contrast with `topic`/`product_tags`), many-to-many with prompts via the
 * prompt_tags junction table. */
export type Tag = {
  id: string;
  project_id: string;
  name: string;
  /** Migration 0017 — thin grouping label, no separate group entity (matches
   *  Peec's own API, which has no create-tag-group endpoint). Null = ungrouped. */
  group_name: string | null;
};

export type Engine = {
  id: string;
  name: string;
};

export type TrackedUrl = {
  id: string;
  project_id: string;
  url: string;
  name: string;
  is_competitor: boolean;
  /** Other names this brand gets matched under ("Moto" for "Motorola") —
   * fed into classifier.py's local name-matching alongside `name`. */
  aliases: string[];
};

/** A brand name the classifier noticed but that isn't tracked — see
 * migration 0015. Only ever populated on answers where a tracked brand was
 * already detected (piggybacks the sentiment call rather than costing a
 * new one), so this misses a competitor discussed alone — real, stated
 * limitation, not a silent gap. */
export type UnmatchedBrandMention = {
  id: string;
  project_id: string;
  raw_response_id: string;
  name: string;
  created_at: string;
};

export type Citation = {
  id: string;
  prompt_id: string;
  engine_id: string;
  /** The market this citation was fetched under — stamped at fetch time, so
   * it stays correct even if the prompt's country is changed later. */
  country: string | null;
  url: string;
  domain: string;
  is_simulated: boolean;
  raw_response_id: string | null;
  mentions_brand: boolean | null;
  content_type: string | null;
  position: number | null;
  fetched_at: string;
};

export type RawResponse = {
  id: string;
  prompt_id: string;
  engine_id: string;
  country: string | null;
  answer_text: string | null;
  brand_mentioned_in_answer: boolean;
  brand_sentiment_score: number | null;
  brand_position: number | null;
  fetched_at: string;
};

/** A RawResponse joined with its prompt's query_text/topic — the row shape
 * the Chats log (`getChats()`) needs and plain `getRawResponses()` doesn't
 * bother fetching, since most callers already have the prompt loaded. */
export type ChatRow = RawResponse & {
  prompt: { query_text: string; topic: string | null } | null;
};

export type AnswerBrandMention = {
  id: string;
  raw_response_id: string;
  tracked_url_id: string;
  mentioned: boolean;
  position: number | null;
  /** True if this brand's own domain showed up among the response's
   * citations — the engine's retrieval step pulled it in — even when
   * `mentioned` is false (the brand was never named in the visible text).
   * Only ever richer than `mentioned` for Gemini rows; see migration 0006. */
  considered: boolean;
  /** 0-100 tone toward THIS brand in this answer — competitors included, not
   * just the tracked owner's brand (migration 0010). Null when the answer
   * never named the brand, or when the row predates per-brand scoring and
   * hasn't been through the reclassify backfill yet. */
  sentiment_score: number | null;
};

export type DomainType = {
  domain: string;
  domain_type: "Corporate" | "Editorial" | "UGC" | "Institutional" | "Reference" | "Other";
};

export type DailyMetric = {
  id: string;
  project_id: string;
  date: string;
  /** "" is the all-markets aggregate row; anything else is one market. */
  country: string;
  visibility_pct: number | null;
  sov_pct: number | null;
  avg_sentiment: number | null;
  avg_position: number | null;
};

export type QueryFanout = {
  id: string;
  raw_response_id: string;
  query_text: string;
  /** 1-indexed order this sub-query appeared in the engine's own
   * webSearchQueries array for that response — its first sub-query is
   * usually the primary read of intent, later ones are refinements. Null
   * for rows captured before this was tracked. */
  position: number | null;
};

export type BrandAttribute = {
  id: string;
  raw_response_id: string;
  tracked_url_id: string;
  attribute: string;
};

export type PromptCandidate = {
  prompt_text: string;
  topic: string;
  search_query: string;
  intent: string;
  relevance_note: string;
  /** Real Google Trends relative interest (0-100), scoped to the researched
   * market — never AI-prompt traffic, no such data exists anywhere.
   * null = unknown. */
  search_interest: number | null;
};

export type PromptResearchResponse = {
  candidates: PromptCandidate[];
};

export type FetchTriggerResponse = {
  batch_id: string;
  tasks_enqueued: number;
};

export type FetchTaskStatus = {
  prompt_id: string;
  engine_name: "gemini" | "openrouter";
  status: "pending" | "success" | "rate_limited" | "error";
  message: string | null;
  citation_count: number;
};

export type FetchBatchStatusResponse = {
  batch_id: string;
  project_id: string;
  tasks: FetchTaskStatus[];
  done: boolean;
};

export type PerceptionSkippedFetch = { prompt: string; engine: string; reason: string };

export type PerceptionFetchResponse = {
  processed: number;
  // Previously invisible — a rate-limited or dead-key run looked identical
  // to "nothing to do" (processed: 0 either way).
  skipped: PerceptionSkippedFetch[];
  message: string | null;
};
