/**
 * Sums in, one metric out. This is the ONLY place in the codebase that
 * divides to produce a metric.
 *
 * The RPCs in migration 0011 deliberately return sums and counts, never
 * rates, because SUM(a)/SUM(b) re-aggregates correctly across days, engines
 * and countries in any direction while an average cannot be re-averaged
 * without carrying its weights. Centralising the division here is the other
 * half of that: it is what stops the backend and the frontend computing
 * "share of voice" two subtly different ways, which they already did.
 */

import type { MetricKey, MetricValue, Support } from "./types";

/** Exactly the shape every metrics_* RPC returns, camel-cased. */
export type MetricSums = {
  responses: number;
  mentionCount: number;
  consideredNotNamed: number;
  sentimentSum: number;
  sentimentN: number;
  positionSum: number;
  positionN: number;
  daysWithData: number;
};

export const ZERO_SUMS: MetricSums = {
  responses: 0,
  mentionCount: 0,
  consideredNotNamed: 0,
  sentimentSum: 0,
  sentimentN: 0,
  positionSum: 0,
  positionN: 0,
  daysWithData: 0,
};

/** Below these, a number is noise wearing a confident font. Rendering
 *  "#1.0 average position" off two observations is the fastest way to lose
 *  a user's trust in every other number on the page. */
// Neither constant is exported — both are used only inside this file.
// app/perception/page.tsx references MIN_OBS_FOR_MEAN by name in a comment
// (defining its own separate, locally-scoped constant with the same value,
// since perception has no RPC rollup to share this one through) — not a
// real import, confirmed by grep before trusting the comment.
const MIN_RESPONSES_FOR_RATE = 3;
const MIN_OBS_FOR_MEAN = 3;

/** Valid only because these are sums. Used to roll days into weeks, engines
 *  into a blended total, and so on. `daysWithData` is summed rather than
 *  max'd because callers only ever combine disjoint day slices. */
export function addSums(a: MetricSums, b: MetricSums): MetricSums {
  return {
    responses: a.responses + b.responses,
    mentionCount: a.mentionCount + b.mentionCount,
    consideredNotNamed: a.consideredNotNamed + b.consideredNotNamed,
    sentimentSum: a.sentimentSum + b.sentimentSum,
    sentimentN: a.sentimentN + b.sentimentN,
    positionSum: a.positionSum + b.positionSum,
    positionN: a.positionN + b.positionN,
    daysWithData: a.daysWithData + b.daysWithData,
  };
}

export function sumAll(list: MetricSums[]): MetricSums {
  return list.reduce(addSums, ZERO_SUMS);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * @param sovDenominator total mentions across ALL tracked brands in the same
 *   slice. Passed in rather than derived because it must not follow any brand
 *   filter the caller applied — otherwise hiding a competitor silently
 *   inflates your own share.
 */
export function finalize(
  metric: MetricKey,
  sums: MetricSums,
  sovDenominator: number,
): MetricValue {
  const support: Support = {
    responses: sums.responses,
    observations:
      metric === "position" ? sums.positionN : metric === "sentiment" ? sums.sentimentN : 0,
    daysWithData: sums.daysWithData,
  };

  const none = (suppressed: boolean): MetricValue => ({ value: null, support, suppressed });

  switch (metric) {
    case "visibility": {
      // An engine that rate-limited or returned nothing is already excluded
      // upstream (raw_responses.is_usable), so a zero here genuinely means
      // "we asked and the brand wasn't there".
      if (sums.responses === 0) return none(false);
      if (sums.responses < MIN_RESPONSES_FOR_RATE) return none(true);
      return { value: round1((sums.mentionCount / sums.responses) * 100), support, suppressed: false };
    }

    case "sov": {
      // No tracked brand named at all -> undefined, not 0%. "0% of nothing"
      // is not a share, and rendering it as one invents a measurement.
      if (sovDenominator === 0) return none(false);
      return {
        value: round1((sums.mentionCount / sovDenominator) * 100),
        support,
        suppressed: false,
      };
    }

    case "sentiment": {
      if (sums.sentimentN === 0) return none(false);
      if (sums.sentimentN < MIN_OBS_FOR_MEAN) return none(true);
      return { value: Math.round(sums.sentimentSum / sums.sentimentN), support, suppressed: false };
    }

    case "position": {
      // Conditional on being mentioned: "when you're named, where do you
      // rank?". Non-mentions are excluded, which makes this survivorship-
      // biased on its own — never render it without visibility beside it.
      if (sums.positionN === 0) return none(false);
      if (sums.positionN < MIN_OBS_FOR_MEAN) return none(true);
      return { value: round1(sums.positionSum / sums.positionN), support, suppressed: false };
    }
  }
}

/** How often this brand is named, as a share of the answers it was actually
 *  scored against — the honest denominator for a brand added mid-flight. */
export function coverageOf(sums: MetricSums, totalResponsesInSlice: number): number {
  if (totalResponsesInSlice === 0) return 1;
  return Math.min(1, sums.responses / totalResponsesInSlice);
}
