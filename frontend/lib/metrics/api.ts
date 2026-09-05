/**
 * The metrics query API. Every page calls these; no page touches a fact row.
 *
 * Aggregation happens in Postgres (migration 0011) and what crosses the wire
 * is O(brands x buckets), never O(responses). That is not premature
 * optimisation — PostgREST caps responses at 1000 rows by default and nothing
 * in queries.ts sets .range() or checks `error`, so the previous
 * pull-everything-and-reduce-in-Node approach was on track to start computing
 * metrics from an arbitrary slice of the data, silently, with no error.
 */

import "server-only";

import { createAnonServerClient } from "@/lib/supabase/server";
import { makeDelta } from "./delta";
import { coverageOf, finalize, sumAll, ZERO_SUMS, type MetricSums } from "./finalize";
import { bucketRange, previousPeriod, rangeFromPreset, resolveRange, todayUtc } from "./period";
import { finalizeSource, type SourceMetricSums } from "./source";
import type {
  BrandEngineBreakdown,
  BrandMetricRow,
  BrandMetricsResult,
  BrandSeries,
  Bucket,
  DateRange,
  FilterOptions,
  GapMatrix,
  GroupedMetricsResult,
  MetricCell,
  MetricKey,
  MetricsFilter,
  MetricsWarning,
  RankingsByEngine,
  SegmentAxis,
  SegmentMatrix,
  SourceMetricRow,
  SourceMetricsResult,
} from "./types";

type RpcSumRow = {
  tracked_url_id: string;
  responses: number;
  mention_count: number;
  considered_not_named: number;
  sentiment_sum: number;
  sentiment_n: number;
  position_sum: number;
  position_n: number;
  days_with_data: number;
};

function toSums(r: Partial<RpcSumRow> & Record<string, unknown>): MetricSums {
  return {
    responses: Number(r.responses ?? 0),
    mentionCount: Number(r.mention_count ?? 0),
    consideredNotNamed: Number(r.considered_not_named ?? 0),
    sentimentSum: Number(r.sentiment_sum ?? 0),
    sentimentN: Number(r.sentiment_n ?? 0),
    positionSum: Number(r.position_sum ?? 0),
    positionN: Number(r.position_n ?? 0),
    daysWithData: Number(r.days_with_data ?? 0),
  };
}

/** Shared RPC argument shape. `null` means "no filter" on the SQL side.
 *  p_tag_mode confirmed live 2026-08-28 (curl probe: metrics_brand_rollup
 *  and metrics_product_rollup both accept it — migrations 0017-0020 applied). */
function rpcArgs(filter: MetricsFilter, range: DateRange) {
  const nn = (a?: string[]) => (a && a.length ? a : null);
  return {
    p_project: filter.projectId,
    p_from: range.from,
    p_to: range.to,
    p_engines: nn(filter.engineIds),
    p_countries: nn(filter.countries),
    p_tags: nn(filter.tagIds),
    p_topics: nn(filter.topicIds),
    p_prompts: nn(filter.promptIds),
    p_exclude_inactive: Boolean(filter.excludeInactivePrompts),
    p_tag_mode: filter.tagMode ?? "or",
  };
}

/**
 * Unlike every function in queries.ts, this checks `error`. A missing RPC or a
 * bad argument previously surfaced as an empty array via `data ?? []`, which
 * renders as "this brand has no data" — a lie that looks exactly like a fact.
 */
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  const sb = createAnonServerClient();
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(`metrics rpc ${fn} failed: ${error.message}`);
  return (data ?? []) as T[];
}

export async function getFilterOptions(projectId: string): Promise<FilterOptions> {
  const sb = createAnonServerClient();
  const { data, error } = await sb.rpc("metrics_filter_options", { p_project: projectId });
  if (error) throw new Error(`metrics_filter_options failed: ${error.message}`);
  const raw = (data ?? {}) as Partial<FilterOptions>;
  return {
    engines: raw.engines ?? [],
    tags: raw.tags ?? [],
    topics: raw.topics ?? [],
    countries: raw.countries ?? [],
    system: raw.system ?? { branded: [], intent: [] },
    dataRange: raw.dataRange ?? null,
  };
}

/** Parses the shared FilterBar's searchParams into a MetricsFilter. */
export function parseMetricsFilter(
  searchParams: Record<string, string | string[] | undefined>,
  projectId: string,
  options: FilterOptions,
): MetricsFilter & { preset: string; bucket: Bucket } {
  const one = (k: string): string | undefined => {
    const v = searchParams[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const many = (k: string): string[] | undefined => {
    const v = one(k);
    return v ? v.split(",").filter(Boolean) : undefined;
  };

  // Anchor ranges to the last day with data, not to today. With daily fetches
  // these are the same; when a run is missed they are not, and anchoring to
  // today would render a trailing run of empty days as a decline.
  const anchor = options.dataRange?.last ?? todayUtc();
  const preset = one("range") ?? "30d";
  const from = one("from");
  const to = one("to");
  const range: DateRange =
    from && to ? { from, to } : rangeFromPreset(preset, anchor);

  const bucketParam = one("bucket");
  const bucket: Bucket =
    bucketParam === "week" || bucketParam === "month" ? bucketParam : "day";

  const tagModeParam = one("tagMode");
  const tagMode: "and" | "or" = tagModeParam === "and" ? "and" : "or";

  return {
    projectId,
    range,
    engineIds: many("models"),
    tagIds: many("tag"),
    tagMode,
    topicIds: many("topic"),
    countries: many("country"),
    excludeInactivePrompts: one("active") === "1",
    preset,
    bucket,
  };
}

/**
 * Usable responses in the slice, counted independently of any brand.
 *
 * Prefers the metrics_slice_responses RPC (migration 0012). Falls back to
 * counting rows client-side when that migration hasn't been applied yet, so
 * the dashboard works before the DB catches up. The fallback is the same
 * pull-and-count-in-Node pattern this module exists to remove — it is fine at
 * a few hundred responses and wrong at a few thousand, so it is a bridge, not
 * a design.
 */
async function sliceResponses(
  filter: MetricsFilter,
  range: DateRange,
): Promise<{ engine_id: string; responses: number }[]> {
  try {
    return await rpc<{ engine_id: string; responses: number }>(
      "metrics_slice_responses",
      rpcArgs(filter, range),
    );
  } catch {
    const sb = createAnonServerClient();
    const { data: promptIds } = await sb.rpc("metrics_scoped_prompts", {
      p_project: filter.projectId,
      p_tags: filter.tagIds?.length ? filter.tagIds : null,
      p_topics: filter.topicIds?.length ? filter.topicIds : null,
      p_prompts: filter.promptIds?.length ? filter.promptIds : null,
      p_exclude_inactive: Boolean(filter.excludeInactivePrompts),
    });
    const ids = (promptIds ?? []) as string[];
    if (!ids.length) return [];

    let q = sb
      .from("raw_responses")
      .select("engine_id")
      .in("prompt_id", ids)
      .eq("is_usable", true)
      .gte("captured_on", range.from)
      .lte("captured_on", range.to);
    if (filter.engineIds?.length) q = q.in("engine_id", filter.engineIds);

    const { data } = await q;
    const counts = new Map<string, number>();
    for (const r of (data ?? []) as { engine_id: string }[]) {
      counts.set(r.engine_id, (counts.get(r.engine_id) ?? 0) + 1);
    }
    return [...counts.entries()].map(([engine_id, responses]) => ({ engine_id, responses }));
  }
}

async function trackedBrands(projectId: string) {
  const sb = createAnonServerClient();
  const { data } = await sb
    .from("tracked_urls")
    .select("id, name, url, is_competitor, created_at")
    .eq("project_id", projectId)
    .order("is_competitor");
  return (data ?? []) as {
    id: string;
    name: string;
    url: string;
    is_competitor: boolean;
    created_at: string | null;
  }[];
}

function cell(
  metric: MetricKey,
  sums: MetricSums,
  sovDenom: number,
  prior: { sums: MetricSums; sovDenom: number } | null,
): MetricCell {
  const current = finalize(metric, sums, sovDenom);
  const previous = prior ? finalize(metric, prior.sums, prior.sovDenom) : null;
  return { ...current, delta: makeDelta(metric, current, previous) };
}

export async function getBrandMetrics(
  filter: MetricsFilter,
  opts?: { compare?: boolean; brandIds?: string[] },
): Promise<BrandMetricsResult> {
  const compare = opts?.compare ?? true;
  const options = await getFilterOptions(filter.projectId);
  const { resolved, missingDays } = resolveRange(filter.range, options.dataRange);
  const previousRange = compare ? previousPeriod(resolved) : null;

  const [brands, curRows, prevRows, sliceRows] = await Promise.all([
    trackedBrands(filter.projectId),
    rpc<RpcSumRow>("metrics_brand_rollup", rpcArgs(filter, resolved)),
    previousRange
      ? rpc<RpcSumRow>("metrics_brand_rollup", rpcArgs(filter, previousRange))
      : Promise.resolve([]),
    sliceResponses(filter, resolved),
  ]);

  const cur = new Map(curRows.map((r) => [r.tracked_url_id, toSums(r)]));
  const prev = new Map(prevRows.map((r) => [r.tracked_url_id, toSums(r)]));

  // SoV denominators are computed over EVERY tracked brand, before any
  // brandIds filter is applied. Otherwise hiding a competitor inflates your
  // own share, which is the one number a competitor dashboard must not lie about.
  const sovDenom = curRows.reduce((n, r) => n + Number(r.mention_count), 0);
  const sovDenomPrev = prevRows.reduce((n, r) => n + Number(r.mention_count), 0);

  // Counted independently of any brand. Deriving this from the per-brand
  // rollup would make a brand's coverage gap invisible to itself: with one
  // tracked brand, max(per-brand responses) IS that brand's count, so 18-of-28
  // coverage would read as 100%.
  const totalResponses = sliceRows.reduce((n, r) => n + Number(r.responses), 0);
  const brandsWithMentions = curRows.filter((r) => Number(r.mention_count) > 0).length;

  // Per-engine response counts, so the UI can warn when one engine dominates
  // the blend — a rate-limited Gemini day silently reweights every pooled
  // metric toward the other engine.
  const engineNames = new Map(options.engines.map((e) => [e.id, e.name]));
  const responsesByEngine = sliceRows.map((r) => ({
    engineId: r.engine_id,
    name: engineNames.get(r.engine_id) ?? r.engine_id,
    responses: Number(r.responses),
  }));

  const selected = opts?.brandIds ? new Set(opts.brandIds) : null;
  const warnings: MetricsWarning[] = [];

  const rows: BrandMetricRow[] = brands
    .filter((b) => !selected || selected.has(b.id))
    .map((b) => {
      const sums = cur.get(b.id) ?? ZERO_SUMS;
      const priorSums = prev.get(b.id);
      const prior = priorSums ? { sums: priorSums, sovDenom: sovDenomPrev } : null;
      const coverage = coverageOf(sums, totalResponses);

      if (coverage < 0.9 && totalResponses > 0) {
        warnings.push({
          kind: "brand-partial-coverage",
          brandId: b.id,
          brandName: b.name,
          coverage,
        });
      }

      // Blending `considered` across engines produces a number whose value
      // depends on the engine mix rather than on the brand: Gemini's grounding
      // exposes everything its retrieval touched, OpenRouter's only exposes
      // what it cited. Only meaningful when a single engine is in scope.
      const singleEngine = (filter.engineIds?.length ?? 0) === 1;

      return {
        brandId: b.id,
        name: b.name,
        url: b.url,
        isCompetitor: b.is_competitor,
        trackedSince: b.created_at,
        coverage,
        visibility: cell("visibility", sums, sovDenom, prior),
        sov: cell("sov", sums, sovDenom, prior),
        sentiment: cell("sentiment", sums, sovDenom, prior),
        position: cell("position", sums, sovDenom, prior),
        mentionCount: sums.mentionCount,
        consideredNotNamed: singleEngine ? sums.consideredNotNamed : null,
      };
    });

  if (missingDays > 0) warnings.push({ kind: "partial-period", missingDays });
  if (brandsWithMentions <= 1) warnings.push({ kind: "degenerate-sov", brandsWithMentions });
  if (compare && prevRows.length === 0) warnings.push({ kind: "no-prior-period" });

  const counts = responsesByEngine.map((e) => e.responses).filter((n) => n > 0);
  if (counts.length > 1) {
    const ratio = Math.max(...counts) / Math.min(...counts);
    if (ratio >= 2) warnings.push({ kind: "engine-imbalance", ratio: Math.round(ratio * 10) / 10 });
  }

  return {
    rows,
    resolvedRange: resolved,
    previousRange,
    totalResponses,
    totalTrackedMentions: sovDenom,
    responsesByEngine,
    warnings,
  };
}

export async function getBrandTimeSeries(
  filter: MetricsFilter,
  opts: { metric: MetricKey; bucket: Bucket; brandIds?: string[] },
): Promise<BrandSeries[]> {
  const options = await getFilterOptions(filter.projectId);
  const { resolved } = resolveRange(filter.range, options.dataRange);

  const [brands, rows] = await Promise.all([
    trackedBrands(filter.projectId),
    rpc<RpcSumRow & { bucket_start: string }>("metrics_brand_series", {
      ...rpcArgs(filter, resolved),
      p_bucket: opts.bucket,
    }),
  ]);

  // Per bucket, across all brands — the SoV denominator has to be the bucket's
  // own total, not the period's, or every point would be a share of the wrong whole.
  const denomByBucket = new Map<string, number>();
  for (const r of rows) {
    const k = r.bucket_start.slice(0, 10);
    denomByBucket.set(k, (denomByBucket.get(k) ?? 0) + Number(r.mention_count));
  }

  const byBrandBucket = new Map<string, MetricSums>();
  for (const r of rows) {
    byBrandBucket.set(`${r.tracked_url_id}|${r.bucket_start.slice(0, 10)}`, toSums(r));
  }

  const buckets = bucketRange(resolved, opts.bucket);
  const selected = opts.brandIds ? new Set(opts.brandIds) : null;

  return brands
    .filter((b) => !selected || selected.has(b.id))
    .map((b) => ({
      brandId: b.id,
      name: b.name,
      isCompetitor: b.is_competitor,
      metric: opts.metric,
      points: buckets.map((bk) => {
        const sums = byBrandBucket.get(`${b.id}|${bk.start}`);
        // No row for this bucket = no fetch happened. The point stays null so
        // the line breaks. Zero-filling would assert "we asked and you weren't
        // there"; carrying forward would turn a resumed measurement into a crash.
        if (!sums) {
          return {
            bucketStart: bk.start,
            bucketEnd: bk.end,
            value: null,
            support: { responses: 0, observations: 0, daysWithData: 0 },
            partial: bk.partial,
          };
        }
        const v = finalize(opts.metric, sums, denomByBucket.get(bk.start) ?? 0);
        return {
          bucketStart: bk.start,
          bucketEnd: bk.end,
          value: v.value,
          support: v.support,
          partial: bk.partial,
        };
      }),
    }));
}

export async function getEngineBreakdown(
  filter: MetricsFilter,
  opts: { metric: MetricKey; brandIds?: string[] },
): Promise<BrandEngineBreakdown[]> {
  const options = await getFilterOptions(filter.projectId);
  const { resolved } = resolveRange(filter.range, options.dataRange);

  const [brands, rows] = await Promise.all([
    trackedBrands(filter.projectId),
    rpc<RpcSumRow & { engine_id: string }>("metrics_brand_by_engine", rpcArgs(filter, resolved)),
  ]);

  const denomByEngine = new Map<string, number>();
  for (const r of rows) {
    denomByEngine.set(
      r.engine_id,
      (denomByEngine.get(r.engine_id) ?? 0) + Number(r.mention_count),
    );
  }
  const engineNames = new Map(options.engines.map((e) => [e.id, e.name]));
  const selected = opts.brandIds ? new Set(opts.brandIds) : null;

  return brands
    .filter((b) => !selected || selected.has(b.id))
    .map((b) => {
      const perEngine = rows
        .filter((r) => r.tracked_url_id === b.id)
        .map((r) => ({
          engineId: r.engine_id,
          engineName: engineNames.get(r.engine_id) ?? r.engine_id,
          value: finalize(opts.metric, toSums(r), denomByEngine.get(r.engine_id) ?? 0),
        }));

      // Only rank engines that actually cleared the support bar. Naming a
      // "strongest model" off a single observation is worse than saying nothing.
      const ranked = perEngine
        .filter((e) => e.value.value !== null && !e.value.suppressed)
        .sort((x, y) =>
          opts.metric === "position"
            ? x.value.value! - y.value.value!
            : y.value.value! - x.value.value!,
        );

      return {
        brandId: b.id,
        name: b.name,
        metric: opts.metric,
        perEngine,
        strongest: ranked.length >= 2 ? ranked[0] : null,
        weakest: ranked.length >= 2 ? ranked[ranked.length - 1] : null,
      };
    });
}

export async function getTopRankings(filter: MetricsFilter): Promise<RankingsByEngine[]> {
  const options = await getFilterOptions(filter.projectId);
  const { resolved } = resolveRange(filter.range, options.dataRange);

  const [brands, rows] = await Promise.all([
    trackedBrands(filter.projectId),
    rpc<RpcSumRow & { engine_id: string }>("metrics_brand_by_engine", rpcArgs(filter, resolved)),
  ]);
  const brandById = new Map(brands.map((b) => [b.id, b]));
  const engineIds = [...new Set(rows.map((r) => r.engine_id))];
  const engineNames = new Map(options.engines.map((e) => [e.id, e.name]));

  return engineIds.map((engineId) => {
    const mine = rows.filter((r) => r.engine_id === engineId);
    const denom = mine.reduce((n, r) => n + Number(r.mention_count), 0);
    const scored = mine.map((r) => ({
      brand: brandById.get(r.tracked_url_id),
      value: finalize("position", toSums(r), denom),
    }));

    const ranked = scored
      .filter((s) => s.brand && s.value.value !== null && !s.value.suppressed)
      .sort((a, b) => a.value.value! - b.value.value!);

    return {
      engineId,
      engineName: engineNames.get(engineId) ?? engineId,
      brands: ranked.map((s, i) => ({
        rank: i + 1,
        brandId: s.brand!.id,
        name: s.brand!.name,
        isCompetitor: s.brand!.is_competitor,
        position: s.value,
      })),
      unranked: scored
        .filter((s) => s.brand && (s.value.value === null || s.value.suppressed))
        .map((s) => ({
          brandId: s.brand!.id,
          name: s.brand!.name,
          observations: s.value.support.observations,
        })),
    };
  });
}

export async function getGroupedMetrics(
  filter: MetricsFilter,
  opts: { groupBy: "prompt" | "topic" | "tag"; brandId: string; compare?: boolean },
): Promise<GroupedMetricsResult> {
  const compare = opts.compare ?? false;
  const options = await getFilterOptions(filter.projectId);
  const { resolved } = resolveRange(filter.range, options.dataRange);
  const previousRange = compare ? previousPeriod(resolved) : null;

  type GroupRow = {
    group_key: string;
    group_label: string;
    prompt_count: number;
  } & Omit<RpcSumRow, "tracked_url_id">;

  const call = (range: DateRange) =>
    rpc<GroupRow>("metrics_group_rollup", {
      ...rpcArgs(filter, range),
      p_group: opts.groupBy,
      p_brand: opts.brandId,
    });

  const [curRows, prevRows] = await Promise.all([
    call(resolved),
    previousRange ? call(previousRange) : Promise.resolve([]),
  ]);

  const prevByKey = new Map(prevRows.map((r) => [r.group_key, toSums(r)]));
  const sovDenom = curRows.reduce((n, r) => n + Number(r.mention_count), 0);
  const sovDenomPrev = prevRows.reduce((n, r) => n + Number(r.mention_count), 0);

  const groups = curRows
    .map((r) => {
      const sums = toSums(r);
      const priorSums = prevByKey.get(r.group_key);
      const prior = priorSums ? { sums: priorSums, sovDenom: sovDenomPrev } : null;
      return {
        key: r.group_key,
        label: r.group_label,
        promptCount: Number(r.prompt_count),
        visibility: cell("visibility", sums, sovDenom, prior),
        sov: cell("sov", sums, sovDenom, prior),
        sentiment: cell("sentiment", sums, sovDenom, prior),
        position: cell("position", sums, sovDenom, prior),
        mentionCount: sums.mentionCount,
      };
    })
    .sort((a, b) => b.mentionCount - a.mentionCount);

  const warnings: MetricsWarning[] = [];
  if (compare && prevRows.length === 0) warnings.push({ kind: "no-prior-period" });

  return { groups, resolvedRange: resolved, previousRange, warnings };
}

export async function getSegmentMatrix(
  filter: MetricsFilter,
  opts: { metric: MetricKey; brandId: string; rowAxis: SegmentAxis; colAxis: SegmentAxis },
): Promise<SegmentMatrix> {
  const options = await getFilterOptions(filter.projectId);
  const { resolved } = resolveRange(filter.range, options.dataRange);

  type CellRow = {
    row_key: string;
    row_label: string;
    col_key: string;
    col_label: string;
    prompt_count: number;
  } & Omit<RpcSumRow, "tracked_url_id">;

  const rows = await rpc<CellRow>("metrics_segment_matrix", {
    ...rpcArgs(filter, resolved),
    p_brand: opts.brandId,
    p_row: opts.rowAxis,
    p_col: opts.colAxis,
  });

  // For SoV the denominator is the whole slice, so a cell reads as "this
  // segment's share of your total voice" rather than a share of itself,
  // which would be 100% in every cell.
  const sovDenom = sumAll(rows.map(toSums)).mentionCount;

  const axisKeys = (which: "row" | "col") => {
    const seen = new Map<string, { key: string; label: string; promptCount: number }>();
    for (const r of rows) {
      const key = which === "row" ? r.row_key : r.col_key;
      const label = which === "row" ? r.row_label : r.col_label;
      const existing = seen.get(key);
      const n = Number(r.prompt_count);
      if (existing) existing.promptCount = Math.max(existing.promptCount, n);
      else seen.set(key, { key, label, promptCount: n });
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  };

  return {
    metric: opts.metric,
    brandId: opts.brandId,
    rowAxis: opts.rowAxis,
    colAxis: opts.colAxis,
    rowKeys: axisKeys("row"),
    colKeys: axisKeys("col"),
    cells: rows.map((r) => ({
      rowKey: r.row_key,
      colKey: r.col_key,
      value: finalize(opts.metric, toSums(r), sovDenom),
    })),
    ratesOnly: true,
  };
}

/** Bridges the same filters to citation-level queries (Sources, Gap Analysis),
 *  which aggregate over `citations` rather than brand mentions. Returns ids,
 *  not rows, so callers can page. */
export async function resolveFilterScope(
  filter: MetricsFilter,
  /** 'citation' (default) | 'perception' | 'shopping' — which prompt_type
   *  this scope applies to, forwarded to metrics_scoped_prompts (0017/0019).
   *  Perception's page must pass 'perception' explicitly: the RPC's own
   *  default is 'citation', so leaving this off would silently return zero
   *  prompt ids for every perception page call. */
  promptType: string = "citation",
): Promise<{
  promptIds: string[];
  resolvedRange: DateRange;
}> {
  const sb = createAnonServerClient();
  const options = await getFilterOptions(filter.projectId);
  const { resolved } = resolveRange(filter.range, options.dataRange);

  const { data, error } = await sb.rpc("metrics_scoped_prompts", {
    p_project: filter.projectId,
    p_tags: filter.tagIds?.length ? filter.tagIds : null,
    p_topics: filter.topicIds?.length ? filter.topicIds : null,
    p_prompts: filter.promptIds?.length ? filter.promptIds : null,
    p_exclude_inactive: Boolean(filter.excludeInactivePrompts),
    p_tag_mode: filter.tagMode ?? "or",
    p_prompt_type: promptType,
  });
  if (error) throw new Error(`metrics_scoped_prompts failed: ${error.message}`);

  return {
    promptIds: (data ?? []) as string[],
    resolvedRange: resolved,
  };
}

type RpcSourceSumRow = {
  domain: string;
  retrieved_chats: number;
  citation_count: number;
  cited_in_text_count: number;
  cited_in_text_unknown_count: number;
  days_with_data: number;
};

function toSourceSums(r: RpcSourceSumRow): SourceMetricSums {
  return {
    retrievedChats: Number(r.retrieved_chats ?? 0),
    citationCount: Number(r.citation_count ?? 0),
    citedInTextCount: Number(r.cited_in_text_count ?? 0),
    citedInTextUnknownCount: Number(r.cited_in_text_unknown_count ?? 0),
    daysWithData: Number(r.days_with_data ?? 0),
  };
}

/** Retrieved % / Retrieval Rate / Citation Rate per domain — the source-side
 *  counterpart to getBrandMetrics. Denominator is the SAME total-chats
 *  count the brand metrics use (via sliceResponses), so a domain's
 *  Retrieved % and a brand's Visibility % sit on one comparable scale. */
export async function getSourceMetrics(
  filter: MetricsFilter,
  opts?: { minCitations?: number },
): Promise<SourceMetricsResult> {
  const options = await getFilterOptions(filter.projectId);
  const { resolved } = resolveRange(filter.range, options.dataRange);

  const [sourceRows, sliceRows] = await Promise.all([
    rpc<RpcSourceSumRow>("metrics_source_rollup", rpcArgs(filter, resolved)),
    sliceResponses(filter, resolved),
  ]);

  const totalResponses = sliceRows.reduce((n, r) => n + Number(r.responses), 0);
  const minCitations = opts?.minCitations ?? 1;

  const rows: SourceMetricRow[] = sourceRows
    .filter((r) => Number(r.citation_count) >= minCitations)
    .map((r) => {
      const sums = toSourceSums(r);
      return {
        domain: r.domain,
        retrieved: finalizeSource("retrieved", sums, totalResponses),
        retrievalRate: finalizeSource("retrievalRate", sums, totalResponses),
        citationRate: finalizeSource("citationRate", sums, totalResponses),
        citationCount: sums.citationCount,
      };
    })
    .sort((a, b) => b.citationCount - a.citationCount);

  return { rows, resolvedRange: resolved, totalResponses };
}

/** The named/cited quadrant matrix for one brand, derived from sums the
 *  brand RPCs already return (0016 extended them with cited_domain_count /
 *  both_count) — no separate query shape needed. */
export async function getGapMatrix(filter: MetricsFilter, brandId: string): Promise<GapMatrix | null> {
  const options = await getFilterOptions(filter.projectId);
  const { resolved } = resolveRange(filter.range, options.dataRange);

  const rows = await rpc<
    RpcSumRow & { cited_domain_count: number; both_count: number }
  >("metrics_brand_rollup", rpcArgs(filter, resolved));
  const row = rows.find((r) => r.tracked_url_id === brandId);
  if (!row) return null;

  const responses = Number(row.responses);
  const mentioned = Number(row.mention_count);
  const cited = Number(row.cited_domain_count);
  const both = Number(row.both_count);
  const namedNotCited = mentioned - both;
  const citedNotNamed = cited - both;

  return {
    brandId,
    totalResponses: responses,
    namedAndCited: both,
    namedNotCited,
    citedNotNamed,
    neither: Math.max(0, responses - both - namedNotCited - citedNotNamed),
  };
}

/**
 * Resolves a "system" filter value ("branded" | "non-branded" |
 * "intent:Commercial") into the matching prompt ids and merges them into
 * `filter.promptIds` — reuses the explicit-prompt-list intersection every
 * scoping RPC already supports (metrics_scoped_prompts' `p_prompts`) rather
 * than adding yet another SQL parameter for what is, underneath, just
 * another prompt filter. A direct table query, not an RPC — this is exactly
 * the shape getFilterOptions' own dataRange-style simple lookups use, and
 * there's no aggregation here that needs Postgres-side sums.
 */
export async function applySystemFilter(
  filter: MetricsFilter,
  system: string | undefined,
): Promise<MetricsFilter> {
  if (!system) return filter;
  const sb = createAnonServerClient();
  let query = sb.from("prompts").select("id").eq("project_id", filter.projectId).eq("prompt_type", "citation");

  if (system === "branded") query = query.eq("is_branded", true);
  else if (system === "non-branded") query = query.eq("is_branded", false);
  else if (system.startsWith("intent:")) query = query.eq("intent", system.slice("intent:".length));
  else return filter;

  const { data } = await query;
  const ids = (data ?? []).map((r) => r.id as string);
  // Intersect with any prompt filter already in effect (e.g. the
  // prompt-detail page's own scoping), never silently replace it.
  const merged = filter.promptIds?.length ? filter.promptIds.filter((id) => ids.includes(id)) : ids;
  return { ...filter, promptIds: merged };
}
