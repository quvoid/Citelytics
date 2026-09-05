/**
 * Period-over-period comparison.
 *
 * The one idea worth stating plainly: **the sign of a change and whether that
 * change is good are two different facts.** Position going from #2 to #1 is a
 * decrease and an improvement. Collapsing those into one "is it up or down,
 * paint it green or red" boolean is how dashboards end up colouring a win red.
 * `direction` carries the sign; `polarity` carries the judgement.
 */

import type { Delta, DeltaBasis, MetricKey, MetricValue } from "./types";

export const METRIC_POLARITY: Record<MetricKey, "higher-is-better" | "lower-is-better"> = {
  visibility: "higher-is-better",
  sov: "higher-is-better",
  sentiment: "higher-is-better",
  position: "lower-is-better",
};

/** Units a delta is expressed in. Rates move in percentage POINTS, not
 *  percent: 30% -> 42% is +12pp and also +40%, and conflating the two is a
 *  reliable way to overstate a result by 3x. */
export const METRIC_DELTA_UNIT: Record<MetricKey, "pp" | "pts" | "rank"> = {
  visibility: "pp",
  sov: "pp",
  sentiment: "pts",
  position: "rank",
};

const NO_DELTA = (basis: DeltaBasis, previous: number | null): Delta => ({
  change: null,
  changePct: null,
  direction: "flat",
  polarity: "neutral",
  basis,
  previous,
});

export function makeDelta(
  metric: MetricKey,
  current: MetricValue,
  previous: MetricValue | null,
): Delta {
  // Nothing to compare against. Render "—". Never "+100%": a brand appearing
  // for the first time did not improve by 100%, it simply has no history.
  if (!previous || previous.support.responses === 0) return NO_DELTA("no-prior", null);

  // A delta between two samples too small to report is noise with a colour on
  // it. Suppress the comparison rather than dress it up.
  if (current.suppressed || previous.suppressed) return NO_DELTA("no-prior", previous.value);

  const cur = current.value;
  const prev = previous.value;

  if (prev === null && cur === null) return NO_DELTA("no-prior", null);
  if (prev === null && cur !== null) return { ...NO_DELTA("new", null), change: cur };
  if (prev !== null && cur === null) return { ...NO_DELTA("lost", prev), change: -prev };

  const change = Math.round((cur! - prev!) * 10) / 10;
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const better = METRIC_POLARITY[metric] === "lower-is-better" ? change < 0 : change > 0;

  return {
    change,
    // A percentage change in an ordinal rank is not a meaningful quantity —
    // "#4 to #2 is a 50% improvement" is a category error.
    changePct:
      metric === "position" || prev === 0 ? null : Math.round(((cur! - prev!) / prev!) * 1000) / 10,
    direction,
    polarity: change === 0 ? "neutral" : better ? "good" : "bad",
    basis: "compared",
    previous: prev,
  };
}

/** Display string for a delta, unit included. Returns null when there is
 *  nothing honest to show, so callers render an em dash. */
export function formatDelta(metric: MetricKey, delta: Delta): string | null {
  if (delta.basis === "no-prior") return null;
  if (delta.basis === "new") return "New";
  if (delta.basis === "lost") return "Lost";
  if (delta.change === null) return null;
  if (delta.change === 0) return "±0";

  const unit = METRIC_DELTA_UNIT[metric];
  const sign = delta.change > 0 ? "+" : "−";
  const magnitude = Math.abs(delta.change);
  return unit === "rank" ? `${sign}${magnitude}` : `${sign}${magnitude}${unit === "pp" ? "pp" : ""}`;
}
