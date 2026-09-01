import assert from "node:assert/strict";
import { test } from "node:test";

import { volumeBucket, volumeAge } from "./prompt-volume.ts";

test("null raw value is null, never a fabricated bucket", () => {
  assert.equal(volumeBucket(null, [10, 20, 30]), null);
});

test("too few other prompts to rank against is null, not a fake bucket of 1", () => {
  assert.equal(volumeBucket(50, []), null);
  assert.equal(volumeBucket(50, [30]), null);
});

test("percentile rank buckets 1-5 relative to the project's own prompts", () => {
  const population = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(volumeBucket(5, population), 1, "below everything -> lowest bucket");
  assert.equal(volumeBucket(95, population), 5, "above everything -> highest bucket");
  assert.equal(volumeBucket(55, population), 3, "roughly the middle -> middle bucket");
});

test("does not compare against itself when it's already in the population", () => {
  // A prompt's own value included in its own ranking population shouldn't
  // push it artificially higher than a value not-yet-persisted would be.
  const population = [10, 10, 10, 10, 90];
  const bucket = volumeBucket(10, population);
  assert.ok(bucket !== null && bucket <= 3, "four low values shouldn't rank as high-demand");
});

test("volumeAge renders relative staleness, not a raw timestamp", () => {
  assert.equal(volumeAge(null), null);
  const today = new Date().toISOString();
  assert.equal(volumeAge(today), "today");
  const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  assert.equal(volumeAge(yesterday), "1 day ago");
});
