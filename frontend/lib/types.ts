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

export type AnswerBrandMention = {
  id: string;
  raw_response_id: string;
  tracked_url_id: string;
  mentioned: boolean;
  position: number | null;
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

export type PerceptionFetchResponse = {
  processed: number;
};
