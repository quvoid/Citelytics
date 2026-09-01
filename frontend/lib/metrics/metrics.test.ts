/**
 * Unit tests for the pure half of the metrics module.
 *
 * These target the specific ways a metrics dashboard lies: zero standing in
 * for "unknown", a mean re-averaged without its weights, a rank improvement
 * painted red, and a first-ever data point rendered as "+100%".
 *
 * Run: npm run test:metrics
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { finalize, addSums, ZERO_SUMS, type MetricSums } from "./finalize.ts";
import { makeDelta, formatDelta, METRIC_POLARITY } from "./delta.ts";
import {
  bucketRange,
  daysInRange,
  previousPeriod,
  resolveRange,
  addDays,
} from "./period.ts";

const sums = (o: Partial<MetricSums>): MetricSums => ({ ...ZERO_SUMS, ...o });

// --- finalize ---------------------------------------------------------------

test("SoV with no brand mentioned at all is null, not 0%", () => {
  const v = finalize("sov", sums({ responses: 10, mentionCount: 0 }), 0);
  assert.equal(v.value, null, "0% would render as a real share of voice");
  assert.equal(v.suppressed, false, "this is absence of data, not weak data");
});

test("SoV matches Peec's documented worked example (4 of 16 = 25%)", () => {
  assert.equal(finalize("sov", sums({ mentionCount: 4 }), 16).value, 25);
});

test("visibility is mentions over usable responses", () => {
  assert.equal(finalize("visibility", sums({ responses: 10, mentionCount: 4 }), 0).value, 40);
});

test("visibility with no responses is null, not 0%", () => {
  assert.equal(finalize("visibility", sums({ responses: 0 }), 0).value, null);
});

test("a rate from too few responses is suppressed, not printed", () => {
  const v = finalize("visibility", sums({ responses: 2, mentionCount: 2 }), 0);
  assert.equal(v.value, null);
  assert.equal(v.suppressed, true, "100% off two answers is noise in a confident font");
});

test("position averages only answers where the brand was named", () => {
  // 4 mentions ranked 1,1,2,2 -> 1.5. Non-mentions must not drag this up.
  const v = finalize("position", sums({ responses: 20, positionSum: 6, positionN: 4 }), 0);
  assert.equal(v.value, 1.5);
  assert.equal(v.support.observations, 4);
});

test("position from a single observation is suppressed", () => {
  const v = finalize("position", sums({ responses: 9, positionSum: 1, positionN: 1 }), 0);
  assert.equal(v.value, null);
  assert.equal(v.suppressed, true);
});

test("sentiment is a plain mean of scored mentions", () => {
  assert.equal(finalize("sentiment", sums({ sentimentSum: 180, sentimentN: 3 }), 0).value, 60);
});

// --- re-aggregation: the reason the RPCs return sums, not averages ----------

test("means re-aggregate correctly across days when carried as sums", () => {
  // Day 1: one mention at #1. Day 2: nine mentions at #3.
  const d1 = sums({ responses: 1, mentionCount: 1, positionSum: 1, positionN: 1 });
  const d2 = sums({ responses: 9, mentionCount: 9, positionSum: 27, positionN: 9 });

  const combined = finalize("position", addSums(d1, d2), 0).value;
  assert.equal(combined, 2.8, "= 28/10, weighted by observations");

  // Averaging the two daily means would give (1 + 3) / 2 = 2.0 — the exact
  // error the old avg_position column made structurally unavoidable.
  assert.notEqual(combined, 2.0);
});

// --- delta ------------------------------------------------------------------

const val = (value: number | null, responses = 50, observations = 20) => ({
  value,
  support: { responses, observations, daysWithData: 7 },
  suppressed: false,
});

test("position improving from #2 to #1 is DOWN and GOOD", () => {
  const d = makeDelta("position", val(1), val(2));
  assert.equal(d.change, -1);
  assert.equal(d.direction, "down");
  assert.equal(d.polarity, "good", "a rank improvement must never render red");
});

test("visibility falling is DOWN and BAD", () => {
  const d = makeDelta("visibility", val(30), val(42));
  assert.equal(d.direction, "down");
  assert.equal(d.polarity, "bad");
});

test("rate deltas are percentage points, not percent", () => {
  const d = makeDelta("visibility", val(42), val(30));
  assert.equal(d.change, 12, "+12pp");
  assert.equal(d.changePct, 40, "and separately +40% relative");
  assert.equal(formatDelta("visibility", d), "+12pp");
});

test("percentage change is meaningless for a rank, so it is null", () => {
  assert.equal(makeDelta("position", val(2), val(4)).changePct, null);
});

test("no prior data renders an em dash, never +100%", () => {
  const d = makeDelta("visibility", val(37), val(null, 0, 0));
  assert.equal(d.basis, "no-prior");
  assert.equal(d.change, null);
  assert.equal(formatDelta("visibility", d), null);
});

test("a brand appearing for the first time reads as New, not a percentage", () => {
  const d = makeDelta("visibility", val(20), val(null));
  assert.equal(d.basis, "new");
  assert.equal(formatDelta("visibility", d), "New");
});

test("a brand that disappeared reads as Lost", () => {
  const d = makeDelta("visibility", val(null), val(20));
  assert.equal(d.basis, "lost");
  assert.equal(formatDelta("visibility", d), "Lost");
});

test("a delta between two suppressed samples is refused", () => {
  const weak = { ...val(1), suppressed: true };
  assert.equal(makeDelta("position", weak, val(2)).basis, "no-prior");
});

test("no change is flat and neutral", () => {
  const d = makeDelta("sentiment", val(60), val(60));
  assert.equal(d.direction, "flat");
  assert.equal(d.polarity, "neutral");
  assert.equal(formatDelta("sentiment", d), "±0");
});

test("only position is lower-is-better", () => {
  assert.equal(METRIC_POLARITY.position, "lower-is-better");
  for (const m of ["visibility", "sov", "sentiment"] as const) {
    assert.equal(METRIC_POLARITY[m], "higher-is-better");
  }
});

// --- period -----------------------------------------------------------------

test("day counts are inclusive", () => {
  assert.equal(daysInRange({ from: "2026-08-01", to: "2026-08-01" }), 1);
  assert.equal(daysInRange({ from: "2026-08-01", to: "2026-08-30" }), 30);
});

test("previous period is equal-length, contiguous and non-overlapping", () => {
  const prev = previousPeriod({ from: "2026-08-01", to: "2026-08-30" });
  assert.deepEqual(prev, { from: "2026-07-02", to: "2026-07-31" });
  assert.equal(daysInRange(prev), 30);
  assert.equal(addDays(prev.to, 1), "2026-08-01", "must abut, never overlap");
});

test("ranges clamp to the last day that actually has data", () => {
  const { resolved, missingDays } = resolveRange(
    { from: "2026-08-01", to: "2026-08-31" },
    { first: "2026-07-31", last: "2026-08-24" },
  );
  assert.equal(resolved.to, "2026-08-24", "a trailing run of empty days is not a decline");
  assert.equal(missingDays, 7);
});

test("week buckets are Monday-aligned to match Postgres date_trunc", () => {
  const buckets = bucketRange({ from: "2026-08-01", to: "2026-08-31" }, "week");
  for (const b of buckets) {
    assert.equal(new Date(`${b.start}T00:00:00Z`).getUTCDay(), 1, `${b.start} should be a Monday`);
  }
  assert.equal(buckets[0].partial, true, "range starts mid-week");
});

test("day buckets cover every day in the range exactly once", () => {
  const buckets = bucketRange({ from: "2026-08-01", to: "2026-08-07" }, "day");
  assert.equal(buckets.length, 7);
  assert.equal(buckets[0].start, "2026-08-01");
  assert.equal(buckets[6].start, "2026-08-07");
  assert.ok(buckets.every((b) => !b.partial));
});
