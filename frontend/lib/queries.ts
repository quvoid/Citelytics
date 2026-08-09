import { createAnonServerClient } from "@/lib/supabase/server";
import { getCurrentProjectId } from "@/lib/current-project";
import type {
  AnswerBrandMention,
  BrandAttribute,
  Citation,
  ContentBrief,
  DailyMetric,
  DomainType,
  Engine,
  Project,
  Prompt,
  QueryFanout,
  RawResponse,
  TrackedUrl,
} from "@/lib/types";

// Column lists live here so adding a column is a one-file change rather than
// hunting through every page that happens to select the same table.
const PROMPT_COLS =
  "id, project_id, query_text, active, prompt_type, country, topic, intent, is_branded";
const CITATION_COLS =
  "id, prompt_id, engine_id, country, url, domain, is_simulated, raw_response_id, mentions_brand, content_type, position, fetched_at";
const RAW_RESPONSE_COLS =
  "id, prompt_id, engine_id, country, answer_text, brand_mentioned_in_answer, brand_sentiment_score, brand_position, fetched_at";
const TRACKED_URL_COLS = "id, project_id, url, name, is_competitor";
const CONTENT_BRIEF_COLS =
  "id, project_id, prompt_text, origin, status, score, tone, content_intent, language, article_type, cell_notes, main_topic, value_proposition, target_audience, key_takeaways, created_at, analysed_at";

export type PromptType = "citation" | "perception";

/** Returns every prompt regardless of market. Country filtering is left to
 * callers: `prompts.country` is null for anything inheriting the project's
 * market, so the filter needs the project's default_country to resolve —
 * which the pages already have loaded. */
export async function getPrompts(promptType?: PromptType, projectId?: string): Promise<Prompt[]> {
  const sb = createAnonServerClient();
  const pid = projectId ?? (await getCurrentProjectId());
  let query = sb.from("prompts").select(PROMPT_COLS).eq("project_id", pid);
  if (promptType) query = query.eq("prompt_type", promptType);
  const { data } = await query.order("query_text").returns<Prompt[]>();
  return data ?? [];
}

export async function getProjects(): Promise<Project[]> {
  const sb = createAnonServerClient();
  const { data } = await sb
    .from("projects")
    .select("id, name, domain, default_country")
    .order("created_at")
    .returns<Project[]>();
  return data ?? [];
}

export async function getProject(id: string): Promise<Project | null> {
  const sb = createAnonServerClient();
  const { data } = await sb
    .from("projects")
    .select("id, name, domain, default_country")
    .eq("id", id)
    .maybeSingle<Project>();
  return data ?? null;
}

export async function getPrompt(id: string): Promise<Prompt | null> {
  const sb = createAnonServerClient();
  const { data } = await sb.from("prompts").select(PROMPT_COLS).eq("id", id).maybeSingle<Prompt>();
  return data ?? null;
}

export async function getEngines(): Promise<Engine[]> {
  const sb = createAnonServerClient();
  const { data } = await sb.from("engines").select("id, name").returns<Engine[]>();
  return data ?? [];
}

export async function getTrackedUrls(
  options?: { competitorsOnly?: boolean; ownOnly?: boolean },
  projectId?: string
) {
  const sb = createAnonServerClient();
  const pid = projectId ?? (await getCurrentProjectId());
  let query = sb.from("tracked_urls").select(TRACKED_URL_COLS).eq("project_id", pid);
  if (options?.competitorsOnly) query = query.eq("is_competitor", true);
  if (options?.ownOnly) query = query.eq("is_competitor", false);
  const { data } = await query.order("is_competitor").returns<TrackedUrl[]>();
  return data ?? [];
}

/** Citations for the whole project. `filters` narrows to the subsets the Gap
 * Analysis page needs (real citations that are confirmed not to name us). */
export async function getCitations(filters?: {
  promptId?: string;
  realOnly?: boolean;
  notMentioningBrand?: boolean;
}): Promise<Citation[]> {
  const sb = createAnonServerClient();

  if (filters?.promptId) {
    const { data } = await sb
      .from("citations")
      .select(CITATION_COLS)
      .eq("prompt_id", filters.promptId)
      .order("fetched_at", { ascending: false })
      .returns<Citation[]>();
    return data ?? [];
  }

  const promptIds = (await getPrompts()).map((p) => p.id);
  if (!promptIds.length) return [];

  let query = sb.from("citations").select(CITATION_COLS).in("prompt_id", promptIds);
  if (filters?.realOnly) query = query.eq("is_simulated", false);
  if (filters?.notMentioningBrand) query = query.eq("mentions_brand", false);

  const { data } = await query.order("fetched_at", { ascending: true }).returns<Citation[]>();
  return data ?? [];
}

export async function getRawResponses(promptId?: string): Promise<RawResponse[]> {
  const sb = createAnonServerClient();

  if (promptId) {
    const { data } = await sb
      .from("raw_responses")
      .select(RAW_RESPONSE_COLS)
      .eq("prompt_id", promptId)
      .returns<RawResponse[]>();
    return data ?? [];
  }

  const promptIds = (await getPrompts()).map((p) => p.id);
  if (!promptIds.length) return [];

  const { data } = await sb
    .from("raw_responses")
    .select(RAW_RESPONSE_COLS)
    .in("prompt_id", promptIds)
    .order("fetched_at", { ascending: false })
    .returns<RawResponse[]>();
  return data ?? [];
}

export async function getDomainTypes(domains: string[]): Promise<Map<string, string>> {
  if (!domains.length) return new Map();
  const sb = createAnonServerClient();
  const { data } = await sb
    .from("domain_types")
    .select("domain, domain_type")
    .in("domain", domains)
    .returns<DomainType[]>();
  return new Map((data ?? []).map((d) => [d.domain, d.domain_type]));
}

/** `country` defaults to "" — the all-markets aggregate row. Pass a code to
 * read that market's own trend line; the rows are written per market at
 * fetch time, so this is a filter, not a recomputation. */
export async function getDailyMetrics(
  limit = 8,
  projectId?: string,
  country = ""
): Promise<DailyMetric[]> {
  const sb = createAnonServerClient();
  const pid = projectId ?? (await getCurrentProjectId());
  const { data } = await sb
    .from("daily_metrics")
    .select("id, project_id, date, country, visibility_pct, sov_pct, avg_sentiment, avg_position")
    .eq("project_id", pid)
    .eq("country", country)
    .order("date", { ascending: false })
    .limit(limit)
    .returns<DailyMetric[]>();
  return data ?? [];
}

export async function getAnswerBrandMentions(rawResponseIds: string[]): Promise<AnswerBrandMention[]> {
  if (!rawResponseIds.length) return [];
  const sb = createAnonServerClient();
  const { data } = await sb
    .from("answer_brand_mentions")
    .select("id, raw_response_id, tracked_url_id, mentioned, position")
    .in("raw_response_id", rawResponseIds)
    .returns<AnswerBrandMention[]>();
  return data ?? [];
}

export async function getQueryFanouts(rawResponseIds: string[]): Promise<QueryFanout[]> {
  if (!rawResponseIds.length) return [];
  const sb = createAnonServerClient();
  const { data } = await sb
    .from("query_fanouts")
    .select("id, raw_response_id, query_text")
    .in("raw_response_id", rawResponseIds)
    .returns<QueryFanout[]>();
  return data ?? [];
}

export async function getContentBriefs(projectId?: string): Promise<ContentBrief[]> {
  const sb = createAnonServerClient();
  const pid = projectId ?? (await getCurrentProjectId());
  const { data } = await sb
    .from("content_briefs")
    .select(CONTENT_BRIEF_COLS)
    .eq("project_id", pid)
    .order("created_at", { ascending: false })
    .returns<ContentBrief[]>();
  return data ?? [];
}

export async function getContentBrief(id: string): Promise<ContentBrief | null> {
  const sb = createAnonServerClient();
  const { data } = await sb
    .from("content_briefs")
    .select(CONTENT_BRIEF_COLS)
    .eq("id", id)
    .maybeSingle<ContentBrief>();
  return data ?? null;
}

export async function getBrandAttributes(rawResponseIds: string[]): Promise<BrandAttribute[]> {
  if (!rawResponseIds.length) return [];
  const sb = createAnonServerClient();
  const { data } = await sb
    .from("brand_attributes")
    .select("id, raw_response_id, tracked_url_id, attribute")
    .in("raw_response_id", rawResponseIds)
    .returns<BrandAttribute[]>();
  return data ?? [];
}
