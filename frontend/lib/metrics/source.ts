/**
 * Source-level metrics — Retrieved %, Retrieval Rate, Citation Rate.
 *
 * A sibling to finalize.ts, not folded into it: Retrieval Rate is a MEAN
 * COUNT ("1.4 citations per chat on average"), not a percentage or a rank,
 * so it needs its own null-vs-zero and suppression rules rather than
 * stretching finalize()'s percentage/rank assumptions to cover a third
 * shape. Same discipline throughout: sums in, one division site, `null`
 * means "no data" and is never printed as `0`.
 */

import type { Support } from "./types";

export type SourceMetricKey = "retrieved" | "retrievalRate" | "citationRate";

/** Exactly what metrics_source_rollup / metrics_source_series return, camel-cased. */
export type SourceMetricSums = {
  retrievedChats: number;
  citationCount: number;
  citedInTextCount: number;
  citedInTextUnknownCount: number;
  daysWithData: number;
};

export const ZERO_SOURCE_SUMS: SourceMetricSums = {
  retrievedChats: 0,
  citationCount: 0,
  citedInTextCount: 0,
  citedInTextUnknownCount: 0,
  daysWithData: 0,
};

/** Below this many usable chats in scope, a domain's rate is noise. Lower
 *  than the brand-metrics threshold on purpose — a domain legitimately
 *  shows up in a handful of chats where a brand shows up in hundreds, and
 *  demanding the same sample size would suppress almost every real source. */
export const MIN_CHATS_FOR_SOURCE_RATE = 2;

export type SourceMetricValue = {
  value: number | null;
  support: Support;
  suppressed: boolean;
};

function addSourceSums(a: SourceMetricSums, b: SourceMetricSums): SourceMetricSums {
  return {
    retrievedChats: a.retrievedChats + b.retrievedChats,
    citationCount: a.citationCount + b.citationCount,
    citedInTextCount: a.citedInTextCount + b.citedInTextCount,
    citedInTextUnknownCount: a.citedInTextUnknownCount + b.citedInTextUnknownCount,
    daysWithData: a.daysWithData + b.daysWithData,
  };
}

export function sumSourceAll(list: SourceMetricSums[]): SourceMetricSums {
  return list.reduce(addSourceSums, ZERO_SOURCE_SUMS);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * @param totalChatsInScope the slice's total usable chats — from
 *   metrics_slice_responses, the SAME denominator the brand metrics use, so
 *   a domain's Retrieved % and a brand's Visibility % are directly
 *   comparable numbers.
 */
export function finalizeSource(
  metric: SourceMetricKey,
  sums: SourceMetricSums,
  totalChatsInScope: number,
): SourceMetricValue {
  const support: Support = {
    responses: totalChatsInScope,
    observations: sums.citationCount,
    daysWithData: sums.daysWithData,
  };
  const none = (suppressed: boolean): SourceMetricValue => ({ value: null, support, suppressed });

  switch (metric) {
    case "retrieved": {
      if (totalChatsInScope === 0) return none(false);
      if (totalChatsInScope < MIN_CHATS_FOR_SOURCE_RATE) return none(true);
      return {
        value: round1((sums.retrievedChats / totalChatsInScope) * 100),
        support,
        suppressed: false,
      };
    }

    case "retrievalRate": {
      if (totalChatsInScope === 0) return none(false);
      if (totalChatsInScope < MIN_CHATS_FOR_SOURCE_RATE) return none(true);
      // Not a percentage — a mean count, can exceed 1.
      return {
        value: round1(sums.citationCount / totalChatsInScope),
        support,
        suppressed: false,
      };
    }

    case "citationRate": {
      // The denominator excludes citations where cited_in_text is unknown
      // (null) — unknown must never be silently folded into "not cited",
      // that would understate the rate for exactly the citations (mostly
      // OpenRouter historically, or pre-backfill Gemini rows) where the
      // signal simply hasn't been captured yet.
      const known = sums.citationCount - sums.citedInTextUnknownCount;
      if (known === 0) return none(false);
      if (known < MIN_CHATS_FOR_SOURCE_RATE) return none(true);
      return {
        value: round1((sums.citedInTextCount / known) * 100),
        support: { ...support, observations: known },
        suppressed: false,
      };
    }
  }
}
