/**
 * What the engine's own sub-searches reveal — the questions the citations
 * table cannot answer.
 *
 * A fanout is the query the engine typed into search BEFORE writing its
 * answer. That is upstream of everything else this app measures: whether you
 * were cited is the result, whether the engine went looking for you by name
 * is the cause. The two are measurably different — see `searchedVsNamed`.
 *
 * All pure functions over rows the caller already loaded, so the arithmetic
 * is unit-testable and the page stays a thin renderer.
 */

const WORD = (s: string) => new RegExp(`(?<!\\w)${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\w)`, "i");

export type BrandTerms = { name: string; terms: string[]; isOwn: boolean };

/** Brand + aliases as one candidate list, matching the classifier's rules so
 *  "searched for" and "named in the answer" mean the same thing by the same
 *  standard. */
export function brandTerms(
  brands: { name: string; aliases?: string[] | null; is_competitor: boolean }[],
): BrandTerms[] {
  return brands.map((b) => ({
    name: b.name,
    terms: [b.name, ...(b.aliases ?? [])].filter(Boolean),
    isOwn: !b.is_competitor,
  }));
}

function queryNamesBrand(query: string, b: BrandTerms): boolean {
  return b.terms.some((t) => WORD(t).test(query));
}

// --- 1. Share of Search --------------------------------------------------

export type ShareOfSearchRow = {
  name: string;
  isOwn: boolean;
  /** Sub-searches naming this brand. */
  searches: number;
  /** Of all sub-searches in the slice. Null when there are none at all —
   *  a share of nothing is undefined, not 0%. */
  sharePct: number | null;
};

/** Who the engine already has in mind, measured on its own queries rather
 *  than on the answer it eventually wrote. */
export function shareOfSearch(
  fanouts: { query_text: string }[],
  brands: BrandTerms[],
): { rows: ShareOfSearchRow[]; totalSearches: number; brandedSearches: number } {
  const total = fanouts.length;
  const rows = brands
    .map((b) => {
      const searches = fanouts.filter((f) => queryNamesBrand(f.query_text, b)).length;
      return {
        name: b.name,
        isOwn: b.isOwn,
        searches,
        sharePct: total ? Math.round((searches / total) * 100) : null,
      };
    })
    .sort((a, b) => b.searches - a.searches);

  const brandedSearches = fanouts.filter((f) => brands.some((b) => queryNamesBrand(f.query_text, b))).length;
  return { rows, totalSearches: total, brandedSearches };
}

// --- 2. Searched vs named ------------------------------------------------

export type SearchedVsNamed = {
  /** Answers where the engine typed your brand into search. */
  searchedTotal: number;
  searchedNamed: number;
  searchedPct: number | null;
  notSearchedTotal: number;
  notSearchedNamed: number;
  notSearchedPct: number | null;
  /** Percentage points. Null unless BOTH sides clear the support floor —
   *  a gap computed from three answers is noise wearing a number. */
  liftPoints: number | null;
};

/** Minimum answers on each side before a gap is reportable. Same instinct as
 *  lib/metrics/finalize.ts's support floors. */
export const MIN_ANSWERS_PER_SIDE = 8;

/** Does the engine searching for you by name coincide with you being named
 *  in the answer? Deliberately framed as a coincidence, not a cause: both can
 *  follow from the prompt itself mentioning the brand. The page must say so. */
export function searchedVsNamed(
  /** One entry per answer that has BOTH fanouts and a mention row. */
  answers: { queries: string[]; named: boolean }[],
  own: BrandTerms,
): SearchedVsNamed {
  let sT = 0, sN = 0, nT = 0, nN = 0;
  for (const a of answers) {
    const searched = a.queries.some((q) => queryNamesBrand(q, own));
    if (searched) {
      sT++;
      if (a.named) sN++;
    } else {
      nT++;
      if (a.named) nN++;
    }
  }
  const sPct = sT ? Math.round((sN / sT) * 100) : null;
  const nPct = nT ? Math.round((nN / nT) * 100) : null;
  const enough = sT >= MIN_ANSWERS_PER_SIDE && nT >= MIN_ANSWERS_PER_SIDE;
  return {
    searchedTotal: sT,
    searchedNamed: sN,
    searchedPct: sPct,
    notSearchedTotal: nT,
    notSearchedNamed: nN,
    notSearchedPct: nPct,
    liftPoints: enough && sPct !== null && nPct !== null ? sPct - nPct : null,
  };
}

// --- 3. site: operators --------------------------------------------------

export type TargetedPublication = { domain: string; searches: number; citesYou: boolean };

/** Publications the engine trusted enough to interrogate by name via a
 *  `site:` operator. This is not "where it found you" — it is where it went
 *  looking, which is a PR/content targeting list rather than a results list. */
export function targetedPublications(
  fanouts: { query_text: string }[],
  /** Domains that actually cite you, from the citations table. */
  domainsCitingYou: Set<string>,
): TargetedPublication[] {
  const counts = new Map<string, number>();
  for (const f of fanouts) {
    // site:example.com — tolerate a leading scheme/www and trailing punctuation.
    for (const m of f.query_text.matchAll(/site:\s*(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/gi)) {
      const d = m[1].toLowerCase().replace(/[.,;)]+$/, "");
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([domain, searches]) => ({ domain, searches, citesYou: domainsCitingYou.has(domain) }))
    .sort((a, b) => b.searches - a.searches);
}

// --- 4. Search depth -----------------------------------------------------

export type DepthBucket = { label: string; value: number };
export type DeepPrompt = { promptId: string; queryText: string; searches: number };

/** How many sub-searches an answer needed. A high count is the engine
 *  working hard to answer — those prompts are where the web's coverage is
 *  thinnest, which makes them content opportunities rather than a curiosity. */
export function searchDepth(
  fanoutsByResponse: Map<string, string[]>,
  promptOf: (responseId: string) => { id: string; query_text: string } | undefined,
): { buckets: DepthBucket[]; median: number | null; deepest: DeepPrompt[] } {
  const counts = [...fanoutsByResponse.values()].map((q) => q.length).sort((a, b) => a - b);
  // True median: average the two middle values on an even count rather than
  // taking the upper one, which silently overstates typical depth.
  const median = counts.length
    ? counts.length % 2
      ? counts[(counts.length - 1) / 2]
      : Math.round(((counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2) * 10) / 10
    : null;

  const buckets: DepthBucket[] = [
    { label: "1", value: counts.filter((c) => c === 1).length },
    { label: "2-3", value: counts.filter((c) => c >= 2 && c <= 3).length },
    { label: "4-6", value: counts.filter((c) => c >= 4 && c <= 6).length },
    { label: "7+", value: counts.filter((c) => c >= 7).length },
  ];

  // Deepest per PROMPT, not per response — the same prompt answered by two
  // engines would otherwise occupy two rows of a "hardest questions" list.
  const byPrompt = new Map<string, DeepPrompt>();
  for (const [responseId, queries] of fanoutsByResponse) {
    const p = promptOf(responseId);
    if (!p) continue;
    const existing = byPrompt.get(p.id);
    if (!existing || queries.length > existing.searches) {
      byPrompt.set(p.id, { promptId: p.id, queryText: p.query_text, searches: queries.length });
    }
  }
  const deepest = [...byPrompt.values()].sort((a, b) => b.searches - a.searches).slice(0, 8);

  return { buckets, median, deepest };
}
