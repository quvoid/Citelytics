// Trimmed to only what's actually imported through this barrel (`@/lib/metrics`)
// across the app — verified with a repo-wide grep, not assumed. Everything
// below still stays fully exported from its OWN file (finalize.ts, source.ts,
// api.ts) for the many call sites — several page components, both metrics
// test files — that import it directly instead; this only removes the
// redundant second export path knip found nobody was using.
export * from "./types";
export * from "./period";
export * from "./delta";
export {
  getBrandMetrics,
  getBrandTimeSeries,
  getSegmentMatrix,
  getSourceMetrics,
  getFilterOptions,
  parseMetricsFilter,
  resolveFilterScope,
  applySystemFilter,
} from "./api";
