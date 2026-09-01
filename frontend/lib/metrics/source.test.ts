/**
 * Unit tests for lib/metrics/source.ts — the honesty traps specific to
 * source-level metrics: a domain with zero citations is null, not 0; a
 * citation with unknown cited_in_text must never count as "not cited";
 * Retrieval Rate is a mean count, not a percentage, and can exceed 1.
 *
 * Run: node --experimental-strip-types --test lib/metrics/source.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  finalizeSource,
  sumSourceAll,
  ZERO_SOURCE_SUMS,
  MIN_CHATS_FOR_SOURCE_RATE,
  type SourceMetricSums,
} from "./source.ts";

const sums = (o: Partial<SourceMetricSums>): SourceMetricSums => ({ ...ZERO_SOURCE_SUMS, ...o });

test("a domain never retrieved, across a real nonzero scope, is a genuine 0%", () => {
  // 20 chats were actually looked at and this domain was in none of them —
  // that IS a measurement, same as visibility's 0% in finalize.ts.
  const v = finalizeSource("retrieved", sums({}), 20);
  assert.equal(v.value, 0);
  assert.equal(v.suppressed, false);
});

test("an empty scope (no chats at all) is null, not a fabricated 0%", () => {
  const v = finalizeSource("retrieved", sums({}), 0);
  assert.equal(v.value, null, "there was nothing to measure against, not a confirmed absence");
});

test("Retrieved % is distinct chats over total chats in scope", () => {
  const v = finalizeSource("retrieved", sums({ retrievedChats: 4, citationCount: 6 }), 20);
  assert.equal(v.value, 20);
});

test("Retrieval Rate is a mean count and can exceed 1", () => {
  // 8 citation rows from 4 chats total in scope -> 2 citations per chat on average.
  const v = finalizeSource("retrievalRate", sums({ citationCount: 8 }), 4);
  assert.equal(v.value, 2, "not a percentage, and not capped at 1");
});

test("Retrieval Rate below the chat-count floor is suppressed", () => {
  const v = finalizeSource("retrievalRate", sums({ citationCount: 1 }), MIN_CHATS_FOR_SOURCE_RATE - 1);
  assert.equal(v.value, null);
  assert.equal(v.suppressed, true);
});

test("Citation Rate excludes unknown cited_in_text from the denominator", () => {
  // 10 citations total: 4 confirmed cited-in-text, 6 of unknown status.
  // Denominator must be (10 - 6) = 4, not 10 -- folding unknown into "not
  // cited" would understate the rate to 40% instead of the true 100%.
  const v = finalizeSource(
    "citationRate",
    sums({ citationCount: 10, citedInTextCount: 4, citedInTextUnknownCount: 6 }),
    20,
  );
  assert.equal(v.value, 100);
});

test("Citation Rate is null when every citation's status is unknown", () => {
  const v = finalizeSource(
    "citationRate",
    sums({ citationCount: 5, citedInTextCount: 0, citedInTextUnknownCount: 5 }),
    20,
  );
  assert.equal(v.value, null, "no known citations to rate, not a 0% rate");
});

test("sums combine additively across buckets", () => {
  const day1 = sums({ retrievedChats: 1, citationCount: 2, citedInTextCount: 2 });
  const day2 = sums({ retrievedChats: 2, citationCount: 3, citedInTextCount: 1 });
  const combined = sumSourceAll([day1, day2]);
  assert.equal(combined.retrievedChats, 3);
  assert.equal(combined.citationCount, 5);
  assert.equal(combined.citedInTextCount, 3);
});
