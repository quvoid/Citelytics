/**
 * Types for the metrics layer.
 *
 * The whole module exists to kill four copies of the same arithmetic that had
 * drifted apart across app/brands, app/prompts, app/page and app/sources —
 * and to make the answers honest about what they don't know. Two conventions
 * carry most of that weight:
 *
 *   `null` never means zero. A brand with no mentions has SoV `null`
 *   (undefined — nothing to take a share of), not `0`, which would render as
 *   a real "0% share" and read as a measurement rather than its absence.
 *
 *   Every value ships with its `support`. A position of #1.0 from two
 *   observations and one from two hundred are different claims, and the UI
 *   cannot tell them apart unless the type forces the question.
 */

export type MetricKey = "visibility" | "sov" | "sentiment" | "position";
export type Bucket = "day" | "week" | "month";

/** Inclusive UTC calendar dates, "YYYY-MM-DD".
 *
 * Deliberately strings, not Date objects: three pages currently mix UTC
 * string slicing with local-time `Date.now()` windows, which is two different
 * calendars on one screen. A string that is UTC by definition can't drift. */
export type DateRange = { from: string; to: string };

// "brand" / "attribute" are used by the Perception page's brand x attribute
// competitive matrix — hand-built there (perception has no RPC rollup, see
// app/perception/page.tsx), reusing SegmentHeatmap's generic row/col
// rendering rather than duplicating it.
export type SegmentAxis = "topic" | "tag" | "engine" | "country" | "prompt" | "brand" | "attribute";

export type MetricsFilter = {
  projectId: string;
  range: DateRange;
  /** undefined or [] means "all". Within a dimension: OR. Across: AND. */
  engineIds?: string[];
  tagIds?: string[];
  /** How multiple tagIds combine. "or" (default) = any of them; "and" =
   *  every one of them, on the same prompt. Only meaningful when tagIds has
   *  2+ entries — see metrics_scoped_prompts (0017). */
  tagMode?: "and" | "or";
  topicIds?: string[];
  countries?: string[];
  /** Escape hatch for the prompt-detail page; intersected with the above. */
  promptIds?: string[];
  /** Default false — a paused prompt's history still happened. */
  excludeInactivePrompts?: boolean;
};

export type Support = {
  /** Usable responses in the slice — the visibility denominator. */
  responses: number;
  /** Observations behind a mean (position_n / sentiment_n). 0 for rates. */
  observations: number;
  /** Distinct days with data. Drives gap rendering in charts. */
  daysWithData: number;
};

export type MetricValue = {
  /** null = no data, or too little to report. Never 0-as-missing. */
  value: number | null;
  support: Support;
  /** Data exists but falls below the minimum support — render muted, not blank. */
  suppressed: boolean;
};

export type DeltaBasis =
  | "compared" // both periods have enough data
  | "new" // prior had none, current has some
  | "lost" // prior had some, current has none
  | "no-prior"; // prior period has no data at all — render "—", never "+100%"

export type Delta = {
  /** current - previous, in the metric's own units (points for rates, ranks for position). */
  change: number | null;
  /** Relative change. Always null for position: a % change in a rank is meaningless. */
  changePct: number | null;
  /** Sign of the change. Separate from whether that sign is good. */
  direction: "up" | "down" | "flat";
  /** Whether the change is an improvement. Position falls -> "good". */
  polarity: "good" | "bad" | "neutral";
  basis: DeltaBasis;
  previous: number | null;
};

export type MetricCell = MetricValue & { delta: Delta };

export type BrandMetricRow = {
  brandId: string;
  name: string;
  url: string;
  isCompetitor: boolean;
  /** ISO timestamp. With `coverage`, distinguishes "never mentioned" from "not yet tracked". */
  trackedSince: string | null;
  /** 0..1 — share of the slice's responses that were scored against this brand. */
  coverage: number;
  visibility: MetricCell; // %
  sov: MetricCell; // %
  sentiment: MetricCell; // 0-100
  position: MetricCell; // mean rank, lower is better
  mentionCount: number;
  /** Gemini-only by construction; null when the slice mixes engines. */
  consideredNotNamed: number | null;
};

export type MetricsWarning =
  | { kind: "engine-imbalance"; ratio: number }
  | { kind: "partial-period"; missingDays: number }
  | { kind: "degenerate-sov"; brandsWithMentions: number }
  | { kind: "brand-partial-coverage"; brandId: string; brandName: string; coverage: number }
  | { kind: "no-prior-period" };

export type BrandMetricsResult = {
  rows: BrandMetricRow[];
  /** After clamping to the last day with data. */
  resolvedRange: DateRange;
  previousRange: DateRange | null;
  totalResponses: number;
  /** SoV denominator — over ALL tracked brands, never the filtered subset. */
  totalTrackedMentions: number;
  responsesByEngine: { engineId: string; name: string; responses: number }[];
  warnings: MetricsWarning[];
};

export type SeriesPoint = {
  bucketStart: string;
  bucketEnd: string;
  /** null = gap. The line breaks here; it is not drawn through zero. */
  value: number | null;
  support: Support;
  /** Leading/trailing bucket clipped by the range — render de-emphasised. */
  partial: boolean;
};

export type BrandSeries = {
  brandId: string;
  name: string;
  isCompetitor: boolean;
  metric: MetricKey;
  points: SeriesPoint[];
};

export type EngineMetric = { engineId: string; engineName: string; value: MetricValue };

export type BrandEngineBreakdown = {
  brandId: string;
  name: string;
  metric: MetricKey;
  perEngine: EngineMetric[];
  /** null when fewer than two engines clear minimum support — naming a
   *  "strongest model" off one observation is worse than saying nothing. */
  strongest: EngineMetric | null;
  weakest: EngineMetric | null;
};

export type SegmentMatrix = {
  metric: MetricKey;
  brandId: string;
  rowAxis: SegmentAxis;
  colAxis: SegmentAxis;
  rowKeys: { key: string; label: string; promptCount: number }[];
  colKeys: { key: string; label: string; promptCount: number }[];
  /** Sparse — a missing (row, col) is an empty cell, not a zero. */
  cells: { rowKey: string; colKey: string; value: MetricValue }[];
  /** Cells are rates, never counts, so no total row or column may be rendered.
   *  A prompt carrying three tags lands in three cells: correct for a rate,
   *  flatly wrong for a count. Encoded here so the constraint is visible at
   *  the type level rather than living in a comment someone deletes. */
  ratesOnly: true;
};

export type GroupMetricRow = {
  key: string;
  label: string;
  promptCount: number;
  visibility: MetricCell;
  sov: MetricCell;
  sentiment: MetricCell;
  position: MetricCell;
  mentionCount: number;
};

export type GroupedMetricsResult = {
  groups: GroupMetricRow[];
  resolvedRange: DateRange;
  previousRange: DateRange | null;
  warnings: MetricsWarning[];
};

export type RankingsByEngine = {
  engineId: string;
  engineName: string;
  brands: {
    rank: number;
    brandId: string;
    name: string;
    isCompetitor: boolean;
    position: MetricValue;
  }[];
  /** Below minimum support: listed, but deliberately unranked. */
  unranked: { brandId: string; name: string; observations: number }[];
};

export type FilterOptions = {
  engines: { id: string; name: string }[];
  tags: { id: string; name: string; promptCount: number; groupName: string | null }[];
  topics: { id: string; name: string; promptCount: number }[];
  countries: { code: string; promptCount: number }[];
  /** Peec auto-assigns these two as tag-like filter dimensions on every
   *  prompt — surfaced here the same way real tags are, under a distinct
   *  key so the UI can render them as non-editable "System" filters. */
  system: {
    branded: { value: boolean; promptCount: number }[];
    intent: { value: string; promptCount: number }[];
  };
  /** null when the project has no usable responses at all. */
  dataRange: { first: string; last: string } | null;
};

/** One domain's row in the source-metrics table — Retrieved % / Retrieval
 *  Rate / Citation Rate, Peec's terms (see lib/metrics/source.ts). */
export type SourceMetricRow = {
  domain: string;
  retrieved: import("./source").SourceMetricValue;
  retrievalRate: import("./source").SourceMetricValue;
  citationRate: import("./source").SourceMetricValue;
  citationCount: number;
};

export type SourceMetricsResult = {
  rows: SourceMetricRow[];
  resolvedRange: DateRange;
  totalResponses: number;
};

/** The four-quadrant brand-vs-source visibility matrix: whether a brand was
 *  NAMED in the answer and/or its own domain was CITED as a source, tracked
 *  as two independent facts (see migration 0013's cited_domain column —
 *  `considered` conflates them into one OR, this doesn't). */
export type GapQuadrant = "namedAndCited" | "namedNotCited" | "citedNotNamed" | "neither";

export type GapMatrix = {
  brandId: string;
  totalResponses: number;
  namedAndCited: number;
  namedNotCited: number;
  citedNotNamed: number;
  neither: number;
};
