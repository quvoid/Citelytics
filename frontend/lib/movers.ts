/**
 * What actually moved between the two most recent buckets that have data.
 *
 * "With data" is load-bearing. Fetches in this project land on roughly seven
 * scattered days a month, so the newest bucket's neighbour is very often
 * empty. Comparing against an empty bucket would report a collapse to zero
 * that never happened; comparing against the last bucket that HAS data is the
 * only honest reading, and the gap between them is returned so the UI can say
 * how far back it reached rather than implying the two are adjacent.
 */
import type { BrandSeries } from "@/lib/metrics/types";

export type Mover = {
  brandId: string;
  name: string;
  isOwn: boolean;
  latest: number;
  previous: number;
  /** Percentage points, latest − previous. */
  change: number;
  latestBucket: string;
  previousBucket: string;
  /** Empty buckets skipped to find a comparable previous value. 0 = adjacent. */
  bucketsSkipped: number;
};

/** Below this a change is noise dressed as a finding — a brand drifting by a
 *  point between two sampling weeks has not "moved". */
export const MIN_MOVE_POINTS = 2;

export function computeMovers(
  series: BrandSeries[],
  opts?: { minChange?: number; limit?: number },
): Mover[] {
  const minChange = opts?.minChange ?? MIN_MOVE_POINTS;
  const out: Mover[] = [];

  for (const s of series) {
    // Walk back from the end collecting the two most recent real values.
    const withData: { i: number; v: number }[] = [];
    for (let i = s.points.length - 1; i >= 0 && withData.length < 2; i--) {
      const v = s.points[i].value;
      if (v !== null) withData.push({ i, v });
    }
    if (withData.length < 2) continue; // nothing to compare against yet

    const [latest, previous] = withData;
    const change = Math.round((latest.v - previous.v) * 10) / 10;
    if (Math.abs(change) < minChange) continue;

    out.push({
      brandId: s.brandId,
      name: s.name,
      isOwn: !s.isCompetitor,
      latest: latest.v,
      previous: previous.v,
      change,
      latestBucket: s.points[latest.i].bucketStart,
      previousBucket: s.points[previous.i].bucketStart,
      // Buckets strictly between the two, all of them empty by construction.
      bucketsSkipped: latest.i - previous.i - 1,
    });
  }

  out.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  return opts?.limit ? out.slice(0, opts.limit) : out;
}
