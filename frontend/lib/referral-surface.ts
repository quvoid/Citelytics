/**
 * Referral surface — how many clickable paths to each brand's own site an AI
 * answer actually puts in front of a reader.
 *
 * This is deliberately NOT competitor traffic. Nobody outside a company can
 * measure its traffic; every vendor that reports it is extrapolating from a
 * clickstream panel. What we CAN observe exactly is the link surface: each
 * time an engine cites a brand's own domain, that is one real, countable
 * opportunity for a click. Comparing that across brands is honest in a way an
 * estimated visit count is not.
 *
 * The `utm_source=openai` tag is carried as a sub-signal, not the basis:
 * measured against this project's own data, ChatGPT tags 79% of its citations
 * and Gemini tags none, so a tag-only metric would silently be a
 * ChatGPT-only metric.
 */

const AI_TAG = /[?&]utm_source=(openai|chatgpt|perplexity|gemini|copilot)\b/i;

/** Strips www and lowercases; everything below assumes this shape. */
function norm(d: string): string {
  return d.trim().toLowerCase().replace(/^www\./, "");
}

/**
 * Does this cited domain belong to this brand?
 *
 * Exact match and subdomains are obvious. The third rule exists because a
 * brand's tracked URL is one domain but its sites are many: Motorola is
 * tracked as motorola.com while the Indian site cited in these answers is
 * motorola.in. Matching the registrable label across TLDs catches that, and
 * the two-label guard stops it swallowing unrelated hosts — `apple.fandom.com`
 * must never count as Apple's own site.
 */
export function domainBelongsToBrand(citedDomain: string, brandDomain: string): boolean {
  const cited = norm(citedDomain);
  const brand = norm(brandDomain);
  if (!cited || !brand) return false;
  if (cited === brand || cited.endsWith(`.${brand}`)) return true;

  const brandLabel = brand.split(".")[0];
  // Compare against the cited host's registrable-ish domain (last two labels),
  // so shop.motorola.in resolves to motorola.in -> "motorola", while
  // apple.fandom.com resolves to fandom.com -> "fandom" and is rejected.
  const parts = cited.split(".");
  const registrable = parts.slice(-2).join(".");
  return registrable.split(".")[0] === brandLabel;
}

export type ReferralSurfaceRow = {
  brandId: string;
  name: string;
  isOwn: boolean;
  /** Citations pointing at a domain this brand owns. */
  citations: number;
  /** Of those, ones the engine explicitly tagged as an AI referral. */
  taggedCitations: number;
  /** Distinct pages of theirs that got cited — breadth, not just volume. */
  distinctPages: number;
  /** Answers that cited them at least once. Volume without this can be one
   *  answer citing the same site nine times. */
  answers: number;
  /** Share of all brand-owned referral citations. Null when there are none
   *  at all — a share of nothing is undefined, not zero. */
  sharePct: number | null;
};

export function referralSurface(
  citations: { domain: string; url: string; raw_response_id: string | null }[],
  brands: { id: string; name: string; url: string; is_competitor: boolean }[],
): { rows: ReferralSurfaceRow[]; totalBrandCitations: number; taggedTotal: number } {
  const buckets = new Map<
    string,
    { citations: number; tagged: number; pages: Set<string>; answers: Set<string> }
  >();
  for (const b of brands) {
    buckets.set(b.id, { citations: 0, tagged: 0, pages: new Set(), answers: new Set() });
  }

  let taggedTotal = 0;
  for (const c of citations) {
    // A citation is attributed to at most ONE brand — the first whose domain
    // owns it. Two brands cannot own the same host, so order is immaterial.
    const owner = brands.find((b) => domainBelongsToBrand(c.domain, b.url));
    if (!owner) continue;
    const bucket = buckets.get(owner.id);
    if (!bucket) continue;
    bucket.citations += 1;
    bucket.pages.add(c.url);
    if (c.raw_response_id) bucket.answers.add(c.raw_response_id);
    if (AI_TAG.test(c.url)) {
      bucket.tagged += 1;
      taggedTotal += 1;
    }
  }

  const total = [...buckets.values()].reduce((n, b) => n + b.citations, 0);

  const rows: ReferralSurfaceRow[] = brands
    .map((b) => {
      const bucket = buckets.get(b.id)!;
      return {
        brandId: b.id,
        name: b.name,
        isOwn: !b.is_competitor,
        citations: bucket.citations,
        taggedCitations: bucket.tagged,
        distinctPages: bucket.pages.size,
        answers: bucket.answers.size,
        sharePct: total ? Math.round((bucket.citations / total) * 100) : null,
      };
    })
    .sort((a, b) => b.citations - a.citations);

  return { rows, totalBrandCitations: total, taggedTotal };
}
