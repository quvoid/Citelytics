import assert from "node:assert/strict";
import { test } from "node:test";
import { MIN_MOVE_POINTS, computeMovers } from "./movers.ts";
import type { BrandSeries } from "./metrics/types.ts";

const support = { responses: 10, observations: 10, daysWithData: 1 };
const pt = (bucketStart: string, value: number | null) => ({
  bucketStart,
  bucketEnd: bucketStart,
  value,
  support,
  partial: false,
});

const series = (
  name: string,
  values: (number | null)[],
  isCompetitor = true,
): BrandSeries => ({
  brandId: name.toLowerCase(),
  name,
  isCompetitor,
  metric: "sov",
  points: values.map((v, i) => pt(`2026-08-0${i + 1}`, v)),
});

test("reports the change between the two most recent buckets", () => {
  const m = computeMovers([series("Samsung", [10, 20, 30])]);
  assert.equal(m.length, 1);
  assert.equal(m[0].latest, 30);
  assert.equal(m[0].previous, 20);
  assert.equal(m[0].change, 10);
  assert.equal(m[0].bucketsSkipped, 0);
});

test("an empty neighbour is skipped, not treated as a fall to zero", () => {
  // The real data shape here: a populated week, a silent week, a populated
  // week. Naively comparing to the adjacent bucket would report -30.
  const m = computeMovers([series("Samsung", [10, 30, null, 25])]);
  assert.equal(m[0].previous, 30);
  assert.equal(m[0].latest, 25);
  assert.equal(m[0].change, -5);
  assert.equal(m[0].bucketsSkipped, 1);
  assert.equal(m[0].previousBucket, "2026-08-02");
});

test("a series with only one real value is omitted, not shown as +0", () => {
  const m = computeMovers([series("Oppo", [null, null, 12])]);
  assert.deepEqual(m, []);
});

test("movements below the noise floor are dropped", () => {
  const m = computeMovers([series("Vivo", [20, 20 + (MIN_MOVE_POINTS - 0.5)])]);
  assert.deepEqual(m, []);
});

test("sorted by magnitude regardless of direction, and own brand is flagged", () => {
  const m = computeMovers([
    series("Samsung", [10, 15]), // +5
    series("Motorola", [40, 20], false), // -20
    series("Vivo", [10, 18]), // +8
  ]);
  assert.deepEqual(
    m.map((x) => x.name),
    ["Motorola", "Vivo", "Samsung"],
  );
  assert.equal(m[0].isOwn, true);
  assert.equal(m[0].change, -20);
});

test("limit caps the list after sorting, keeping the biggest moves", () => {
  const m = computeMovers(
    [series("A", [10, 15]), series("B", [10, 40]), series("C", [10, 20])],
    { limit: 2 },
  );
  assert.deepEqual(
    m.map((x) => x.name),
    ["B", "C"],
  );
});
