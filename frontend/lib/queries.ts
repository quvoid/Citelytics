import { createAnonServerClient } from "@/lib/supabase/server";
import { getCurrentProjectId } from "@/lib/current-project";
import type {
  AnswerBrandMention,
  BrandAttribute,
  Citation,
  ContentBrief,
  DomainType,
  Engine,
  Project,
  Prompt,
  ProductTag,
  QueryFanout,
  ChatRow,
  RawResponse,
  Tag,
  TrackedUrl,
  UnmatchedBrandMention,
} from "@/lib/types";

// Column lists live here so adding a column is a one-file change rather than
// hunting through every page that happens to select the same table.
//
// Standing lesson from earlier this session: selecting a column PostgREST
// doesn't have yet fails the WHOLE query silently (nothing here checks
// `error`, just `data ?? []`) — that broke Fanouts and Brands when
// "position"/"considered" were added before their migrations were pushed.
// Never add a new column to one of these lists until its migration is
// confirmed live.
// search_volume/search_volume_checked_at added by migration 0014, live and
// verified — see backend fetch for its meaning (raw 0-100 Google Trends
// interest, not the 1-5 "relative" bucket shown in the UI).
const PROMPT_COLS =
  "id, project_id, query_text, active, prompt_type, country, topic, intent, is_branded, search_volume, search_volume_checked_at";
const PRODUCT_TAG_COLS = "id, raw_response_id, tag";
// group_name added 2026-08-28 — migration 0017 confirmed live (curl probe: 200).
const TAG_COLS = "id, project_id, name, group_name";
const CITATION_COLS =
  "id, prompt_id, engine_id, country, url, domain, is_simulated, raw_response_id, mentions_brand, content_type, position, fetched_at";
const RAW_RESPONSE_COLS =
  "id, prompt_id, engine_id, country, answer_text, brand_mentioned_in_answer, brand_sentiment_score, brand_position, fetched_at";
// aliases added by migration 0014, live and verified.
const TRACKED_URL_COLS = "id, project_id, url, name, is_competitor, aliases";
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

/** Raw sightings for /brands' "seen in N answers" competitor suggestions —
 * aggregation (count, first/last seen) happens on the page, matching the
 * convention every other rollup in this file follows. Small table (see
 * migration 0015's own docstring on why this is append-only and niche), so
 * client-side aggregation over the raw rows is fine at this scale. */
export async function getUnmatchedBrandMentions(projectId?: string): Promise<UnmatchedBrandMention[]> {
  const sb = createAnonServerClient();
  const pid = projectId ?? (await getCurrentProjectId());
  const { data } = await sb
    .from("unmatched_brand_mentions")
    .select("id, project_id, raw_response_id, name, created_at")
    .eq("project_id", pid)
    .order("created_at", { ascending: false })
    .returns<UnmatchedBrandMention[]>();
  return data ?? [];
}

/** Citations for the whole project. `filters` narrows to the subsets the Gap
 * Analysis page needs (real citations that are confirmed not to name us). */
export async function getCitations(filters?: {
  promptId?: string;
  /** Explicit prompt-id set — the FilterBar-scoped list from
   *  resolveFilterScope, so a page can bound citations to whatever
   *  tag/topic/model filter is active, same as the metrics RPCs do.
   *  Ignored when `promptId` is also set. */
  promptIds?: string[];
  realOnly?: boolean;
  notMentioningBrand?: boolean;
  /** Inclusive "YYYY-MM-DD" range on fetched_at — the FilterBar date range. */
  fromDate?: string;
  toDate?: string;
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

  const promptIds = filters?.promptIds ?? (await getPrompts()).map((p) => p.id);
  if (!promptIds.length) return [];

  let query = sb.from("citations").select(CITATION_COLS).in("prompt_id", promptIds);
  if (filters?.realOnly) query = query.eq("is_simulated", false);
  if (filters?.notMentioningBrand) query = query.eq("mentions_brand", false);
  if (filters?.fromDate) query = query.gte("fetched_at", filters.fromDate);
  // Exclusive upper bound one day past `toDate` — fetched_at is a
  // timestamptz, so a plain lte("toDate") would cut off same-day citations
  // fetched after midnight UTC.
  if (filters?.toDate) {
    const next = new Date(`${filters.toDate}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    query = query.lt("fetched_at", next.toISOString());
  }

  const { data } = await query.order("fetched_at", { ascending: true }).returns<Citation[]>();
  return data ?? [];
}

export async function getRawResponses(
  promptId?: string,
  filters?: { promptIds?: string[]; fromDate?: string; toDate?: string },
): Promise<RawResponse[]> {
  const sb = createAnonServerClient();

  if (promptId) {
    const { data } = await sb
      .from("raw_responses")
      .select(RAW_RESPONSE_COLS)
      .eq("prompt_id", promptId)
      .returns<RawResponse[]>();
    return data ?? [];
  }

  const promptIds = filters?.promptIds ?? (await getPrompts()).map((p) => p.id);
  if (!promptIds.length) return [];

  let query = sb.from("raw_responses").select(RAW_RESPONSE_COLS).in("prompt_id", promptIds);
  if (filters?.fromDate) query = query.gte("fetched_at", filters.fromDate);
  if (filters?.toDate) {
    const next = new Date(`${filters.toDate}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    query = query.lt("fetched_at", next.toISOString());
  }

  const { data } = await query.order("fetched_at", { ascending: false }).returns<RawResponse[]>();
  return data ?? [];
}

/** Project-wide, paged answer log — the base unit everything else rolls up
 * from (Peec's "Chats"). Explicit `.range()` + a real `count`, not
 * `getRawResponses()`'s pull-everything-for-the-project shape: at daily
 * fetch cadence this table grows without bound, and the PostgREST
 * 1000-row default cap has already silently truncated a query once this
 * project (see the file header note) — a dedicated log view is exactly
 * where that would first go unnoticed. */
export async function getChats(opts?: {
  projectId?: string;
  promptType?: PromptType;
  engineId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: ChatRow[]; total: number }> {
  const sb = createAnonServerClient();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const promptIds = (await getPrompts(opts?.promptType, opts?.projectId)).map((p) => p.id);
  if (!promptIds.length) return { rows: [], total: 0 };

  let query = sb
    .from("raw_responses")
    .select(
      `id, prompt_id, engine_id, country, answer_text, brand_mentioned_in_answer, brand_sentiment_score, brand_position, fetched_at, prompt:prompts(query_text, topic)`,
      { count: "exact" },
    )
    .in("prompt_id", promptIds)
    .order("fetched_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (opts?.engineId) query = query.eq("engine_id", opts.engineId);

  const { data, count } = await query.returns<ChatRow[]>();
  return { rows: data ?? [], total: count ?? 0 };
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

export async function getAnswerBrandMentions(rawResponseIds: string[]): Promise<AnswerBrandMention[]> {
  if (!rawResponseIds.length) return [];
  const sb = createAnonServerClient();
  const { data } = await sb
    .from("answer_brand_mentions")
    // "considered" and "sentiment_score" are safe to select as of migrations
    // 0006 and 0010, both verified live. Historical note, because this bit
    // twice: selecting a column PostgREST doesn't have fails the WHOLE query
    // silently (every call here does `data ?? []` and ignores `error`), so
    // `mentioned` and `position` came back empty too and every brand showed
    // "0 answers, 0% named" despite real data. Never add a column here before
    // confirming its migration is applied.
    .select("id, raw_response_id, tracked_url_id, mentioned, position, considered, sentiment_score")
    .in("raw_response_id", rawResponseIds)
    .returns<AnswerBrandMention[]>();
  return data ?? [];
}

export async function getQueryFanouts(rawResponseIds: string[]): Promise<QueryFanout[]> {
  if (!rawResponseIds.length) return [];
  const sb = createAnonServerClient();
  const { data } = await sb
    .from("query_fanouts")
    // "position" restored — migration 0007 is applied and verified live.
    .select("id, raw_response_id, query_text, position")
    .in("raw_response_id", rawResponseIds)
    .returns<QueryFanout[]>();
  return data ?? [];
}

/** Specific model names named in each answer ("Edge 70 Fusion", "Razr
 * Fold") — one level more specific than the brand-level tracking in
 * answer_brand_mentions. New table (migration 0008), safe to select in
 * full immediately — unlike the columns-added-to-an-existing-table cases
 * above, there's no shared query to silently break if it isn't live yet;
 * a missing table just yields an empty result the normal way. */
export async function getAnswerProductTags(rawResponseIds: string[]): Promise<ProductTag[]> {
  if (!rawResponseIds.length) return [];
  const sb = createAnonServerClient();
  const { data } = await sb
    .from("answer_product_tags")
    .select(PRODUCT_TAG_COLS)
    .in("raw_response_id", rawResponseIds)
    .returns<ProductTag[]>();
  return data ?? [];
}

/** Every user-created tag for the current project — the full set you can
 * assign from, independent of whether any prompt currently carries them
 * (a tag with zero prompts is still a real tag you might use next). */
export async function getTags(projectId?: string): Promise<Tag[]> {
  const sb = createAnonServerClient();
  const pid = projectId ?? (await getCurrentProjectId());
  const { data } = await sb
    .from("tags")
    .select(TAG_COLS)
    .eq("project_id", pid)
    .order("name")
    .returns<Tag[]>();
  return data ?? [];
}

/** Which tags are actually assigned to which prompts — one row per
 * (prompt, tag) pairing, tag name embedded via the FK join so callers don't
 * need a second round trip to resolve tag_id -> name. */
export async function getPromptTags(promptIds: string[]): Promise<{ prompt_id: string; tag: Tag }[]> {
  if (!promptIds.length) return [];
  const sb = createAnonServerClient();
  const { data } = await sb
    .from("prompt_tags")
    .select(`prompt_id, tag:tags(${TAG_COLS})`)
    .in("prompt_id", promptIds)
    .returns<{ prompt_id: string; tag: Tag }[]>();
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
