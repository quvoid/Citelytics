import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIN_ANSWERS_PER_SIDE,
  brandTerms,
  searchDepth,
  searchedVsNamed,
  shareOfSearch,
  targetedPublications,
} from "./fanout-analysis.ts";

const BRANDS = brandTerms([
  { name: "Motorola", aliases: ["Moto", "Razr"], is_competitor: false },
  { name: "Samsung", aliases: ["Galaxy"], is_competitor: true },
  { name: "Vivo", aliases: [], is_competitor: true },
]);
const OWN = BRANDS.find((b) => b.isOwn)!;

test("share of search counts aliases, and own brand is flagged", () => {
  const { rows, totalSearches, brandedSearches } = shareOfSearch(
    [
      { query_text: "best Motorola phone under 20000" },
      { query_text: "Moto G review 2026" }, // alias
      { query_text: "Galaxy S25 camera" }, // alias
      { query_text: "best camera phone india" }, // unbranded
    ],
    BRANDS,
  );
  assert.equal(totalSearches, 4);
  assert.equal(brandedSearches, 3);
  assert.equal(rows[0].name, "Motorola");
  assert.equal(rows[0].searches, 2);
  assert.equal(rows[0].sharePct, 50);
  assert.equal(rows[0].isOwn, true);
});

test("share of search is null, not 0%, when there are no sub-searches at all", () => {
  const { rows } = shareOfSearch([], BRANDS);
  assert.equal(rows[0].sharePct, null);
});

test("a brand name inside a longer word is not a match", () => {
  const { rows } = shareOfSearch([{ query_text: "motorolaphile fan forum" }], BRANDS);
  assert.equal(rows.find((r) => r.name === "Motorola")!.searches, 0);
});

test("searched-vs-named splits answers and reports the gap in points", () => {
  const answers = [
    ...Array.from({ length: 10 }, () => ({ queries: ["motorola edge review"], named: true })),
    ...Array.from({ length: 10 }, () => ({ queries: ["best phone"], named: false })),
  ];
  const r = searchedVsNamed(answers, OWN);
  assert.equal(r.searchedTotal, 10);
  assert.equal(r.searchedPct, 100);
  assert.equal(r.notSearchedPct, 0);
  assert.equal(r.liftPoints, 100);
});

test("the gap is suppressed when either side is below the support floor", () => {
  const answers = [
    ...Array.from({ length: MIN_ANSWERS_PER_SIDE }, () => ({ queries: ["moto g"], named: true })),
    // one lonely answer on the other side — a real split, not a reportable gap
    { queries: ["best phone"], named: false },
  ];
  const r = searchedVsNamed(answers, OWN);
  assert.equal(r.notSearchedTotal, 1);
  assert.equal(r.notSearchedPct, 0); // the raw rate still exists
  assert.equal(r.liftPoints, null); // ...but the comparison is withheld
});

test("site: operators are parsed, deduped and flagged against domains that cite you", () => {
  const rows = targetedPublications(
    [
      { query_text: "site:samsung.com Galaxy Z Fold" },
      { query_text: "site:www.samsung.com foldable price" },
      { query_text: "site:https://91mobiles.com best phones" },
      { query_text: "no operator here" },
    ],
    new Set(["91mobiles.com"]),
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => [r.domain, r.searches, r.citesYou]),
    [
      ["samsung.com", 2, false],
      ["91mobiles.com", 1, true],
    ],
  );
});

test("search depth buckets responses and reports the hardest prompts once each", () => {
  const byResponse = new Map<string, string[]>([
    ["r1", ["a"]],
    ["r2", ["a", "b", "c"]],
    ["r3", Array.from({ length: 9 }, (_, i) => `q${i}`)],
    // Same prompt as r3, answered by a second engine with fewer searches —
    // must not produce a second row in "hardest prompts".
    ["r4", ["a", "b"]],
  ]);
  const prompts: Record<string, { id: string; query_text: string }> = {
    r1: { id: "p1", query_text: "one" },
    r2: { id: "p2", query_text: "two" },
    r3: { id: "p3", query_text: "three" },
    r4: { id: "p3", query_text: "three" },
  };
  const { buckets, median, deepest } = searchDepth(byResponse, (id) => prompts[id]);
  assert.deepEqual(
    buckets.map((b) => [b.label, b.value]),
    [
      ["1", 1],
      ["2-3", 2],
      ["4-6", 0],
      ["7+", 1],
    ],
  );
  // counts are [1, 2, 3, 9] — an even list, so the median is the mean of the
  // two middle values, not the upper one.
  assert.equal(median, 2.5);
  assert.equal(deepest[0].searches, 9);
  assert.equal(deepest.filter((d) => d.promptId === "p3").length, 1);
});
