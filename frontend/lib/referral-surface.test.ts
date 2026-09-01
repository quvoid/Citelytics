import assert from "node:assert/strict";
import { test } from "node:test";
import { domainBelongsToBrand, referralSurface } from "./referral-surface.ts";

const BRANDS = [
  { id: "m", name: "Motorola", url: "motorola.com", is_competitor: false },
  { id: "s", name: "Samsung", url: "samsung.com", is_competitor: true },
];

test("a brand's ccTLD site counts as its own — motorola.in is Motorola", () => {
  // The real case from this project's data: tracked as .com, cited as .in.
  assert.equal(domainBelongsToBrand("motorola.in", "motorola.com"), true);
  assert.equal(domainBelongsToBrand("www.motorola.in", "motorola.com"), true);
  assert.equal(domainBelongsToBrand("shop.motorola.in", "motorola.com"), true);
});

test("exact and subdomain matches work", () => {
  assert.equal(domainBelongsToBrand("samsung.com", "samsung.com"), true);
  assert.equal(domainBelongsToBrand("news.samsung.com", "samsung.com"), true);
});

test("a third-party host that merely starts with the brand name is rejected", () => {
  // The guard that keeps the ccTLD rule from swallowing the open web.
  assert.equal(domainBelongsToBrand("apple.fandom.com", "apple.com"), false);
  assert.equal(domainBelongsToBrand("motorola.reddit.com", "motorola.com"), false);
  assert.equal(domainBelongsToBrand("91mobiles.com", "motorola.com"), false);
});

test("counts citations, distinct pages and answers separately", () => {
  const { rows, totalBrandCitations } = referralSurface(
    [
      // one answer citing the same brand page twice + another of its pages
      { domain: "motorola.in", url: "https://motorola.in/a", raw_response_id: "r1" },
      { domain: "motorola.in", url: "https://motorola.in/a", raw_response_id: "r1" },
      { domain: "motorola.in", url: "https://motorola.in/b", raw_response_id: "r1" },
      { domain: "samsung.com", url: "https://samsung.com/x", raw_response_id: "r2" },
      // not a brand-owned domain at all
      { domain: "91mobiles.com", url: "https://91mobiles.com/y", raw_response_id: "r2" },
    ],
    BRANDS,
  );
  assert.equal(totalBrandCitations, 4);
  const moto = rows.find((r) => r.name === "Motorola")!;
  assert.equal(moto.citations, 3);
  assert.equal(moto.distinctPages, 2); // /a counted once
  assert.equal(moto.answers, 1); // all from one answer
  assert.equal(moto.sharePct, 75);
});

test("the AI referral tag is counted as a subset, not as the basis", () => {
  const { rows, taggedTotal } = referralSurface(
    [
      { domain: "motorola.in", url: "https://motorola.in/a?utm_source=openai", raw_response_id: "r1" },
      // Gemini tags nothing — this must still count as referral surface.
      { domain: "motorola.in", url: "https://motorola.in/b", raw_response_id: "r2" },
    ],
    BRANDS,
  );
  const moto = rows.find((r) => r.name === "Motorola")!;
  assert.equal(moto.citations, 2);
  assert.equal(moto.taggedCitations, 1);
  assert.equal(taggedTotal, 1);
});

test("no brand-owned citations is a null share, never 0%", () => {
  const { rows } = referralSurface(
    [{ domain: "91mobiles.com", url: "https://91mobiles.com/y", raw_response_id: "r1" }],
    BRANDS,
  );
  assert.equal(rows[0].citations, 0);
  assert.equal(rows[0].sharePct, null);
});
