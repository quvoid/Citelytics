export type Prompt = {
  id: string;
  project_id: string;
  query_text: string;
  active: boolean;
};

export type Engine = {
  id: string;
  name: string;
};

export type TrackedUrl = {
  id: string;
  project_id: string;
  url: string;
  is_competitor: boolean;
};

export type Citation = {
  id: string;
  prompt_id: string;
  engine_id: string;
  url: string;
  domain: string;
  is_simulated: boolean;
  raw_response_id: string | null;
  mentions_brand: boolean | null;
  fetched_at: string;
};

export type EngineResult = {
  engine: "gemini" | "openrouter_demo";
  status: "success" | "rate_limited" | "error";
  message: string | null;
  citation_count: number;
};

export type PromptFetchStatus = {
  prompt_id: string;
  query_text: string;
  results: EngineResult[];
};

export type FetchCitationsResponse = {
  project_id: string;
  prompts_processed: number;
  statuses: PromptFetchStatus[];
};
