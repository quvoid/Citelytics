import { SourcesTable, type DomainGroup } from "@/components/sources-table";
import { getCitations, getDomainTypes, getTrackedUrls } from "@/lib/queries";
import type { Citation } from "@/lib/types";

export const dynamic = "force-dynamic";

const MOVER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3-day windows for trending/losing comparison

type UrlRow = {
  url: string;
  title: string;
  citations: number;
  mentions: boolean | null;
  contentType: string | null;
};

/** Collapses repeat citations of the same URL into one row.
 *
 * Deliberately order-independent: a URL cited several times may have rows
 * from before content_type / mentions_brand were populated, so prefer any
 * definite value over null rather than trusting whichever row sorts first. */
function aggregateUrls(citations: Citation[]): UrlRow[] {
  const byUrl = new Map<string, UrlRow>();

  for (const c of citations) {
    const existing = byUrl.get(c.url);
    if (!existing) {
      byUrl.set(c.url, {
        url: c.url,
        title: titleFromUrl(c.url),
        citations: 1,
        mentions: c.mentions_brand,
        contentType: c.content_type,
      });
      continue;
    }
    existing.citations += 1;
    if (c.mentions_brand === true) existing.mentions = true;
    else if (existing.mentions === null) existing.mentions = c.mentions_brand;
    existing.contentType ??= c.content_type;
  }

  return [...byUrl.values()].sort((a, b) => b.citations - a.citations);
}

function titleFromUrl(url: string): string {
  try {
    const { pathname } = new URL(url);
    const last = pathname.split("/").filter(Boolean).pop() ?? "";
    const cleaned = last.replace(/[-_]/g, " ").replace(/\.\w+$/, "");
    return cleaned ? cleaned.replace(/\b\w/g, (c) => c.toUpperCase()) : url;
  } catch {
    return url;
  }
}

export default async function SourcesPage() {
  const [citations, ownBrand] = await Promise.all([
    getCitations(),
    getTrackedUrls({ ownOnly: true }),
  ]);

  const ownDomains = new Set(ownBrand.map((b) => b.url));
  const domainTypeByDomain = await getDomainTypes([...new Set(citations.map((c) => c.domain))]);

  const totalCitations = citations.length;
  const now = Date.now();

  const byDomain = new Map<string, { citations: Citation[] }>();
  for (const c of citations) {
    const g = byDomain.get(c.domain) ?? { citations: [] };
    g.citations.push(c);
    byDomain.set(c.domain, g);
  }

  const groups: DomainGroup[] = Array.from(byDomain.entries())
    .map(([domain, g]) => {
      const known = g.citations.filter((c) => c.mentions_brand !== null);
      const mentionRate = known.length
        ? Math.round((known.filter((c) => c.mentions_brand).length / known.length) * 100)
        : 0;

      const timestamps = g.citations.map((c) => new Date(c.fetched_at).getTime());
      const firstSeen = Math.min(...timestamps);
      const recentCount = timestamps.filter((t) => now - t <= MOVER_WINDOW_MS).length;
      const priorCount = timestamps.filter(
        (t) => now - t > MOVER_WINDOW_MS && now - t <= MOVER_WINDOW_MS * 2
      ).length;

      const positions = g.citations.map((c) => c.position).filter((p): p is number => p !== null);
      const avgPosition = positions.length
        ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10
        : null;

      return {
        domain,
        domainType: domainTypeByDomain.get(domain) ?? null,
        citations: g.citations.length,
        mentionRate,
        shareOfSources: totalCitations ? Math.round((g.citations.length / totalCitations) * 100) : 0,
        owned: ownDomains.has(domain),
        isNew: now - firstSeen <= MOVER_WINDOW_MS,
        recentCount,
        priorCount,
        avgPosition,
        urls: aggregateUrls(g.citations),
      };
    })
    .sort((a, b) => b.citations - a.citations);

  return (
    <div>
      <section className="border-b border-[var(--ink)] py-11">
        <h1 className="m-0 font-serif text-[40px] font-normal tracking-[-0.02em]">Sources</h1>
        <p className="mt-2.5 max-w-[70ch] font-serif text-[16px] text-[var(--muted-2)] italic">
          {totalCitations} cited pages across {groups.length} domains — expand a domain to see
          which specific pages are cited and whether they name your brand.
        </p>
      </section>
      <SourcesTable groups={groups} />
    </div>
  );
}
