import { ChartCard } from "@/components/chart-card";
import { CitationSankeyClient } from "@/components/citation-sankey-client";
import { DistributionBars } from "@/components/distribution-bars";
import { FilterBar, type FilterState } from "@/components/filter-bar";
import { SourceMetricsTable } from "@/components/source-metrics-table";
import { SourcesTable, type DomainGroup } from "@/components/sources-table";
import { getCurrentProjectId } from "@/lib/current-project";
import { getCitations, getDomainTypes, getEngines, getPrompts, getTrackedUrls } from "@/lib/queries";
import {
  applySystemFilter,
  getFilterOptions,
  getSourceMetrics,
  parseMetricsFilter,
  resolveFilterScope,
} from "@/lib/metrics";
import type { Citation } from "@/lib/types";

/** Beyond this the sankey's right-hand column stops being readable, so the
 * tail is folded into a single "Other domains" node rather than dropped —
 * the flow has to still add up to the total. */
const SANKEY_TOP_DOMAINS = 12;

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

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const projectId = await getCurrentProjectId();
  const filterOptions = await getFilterOptions(projectId);
  const systemParam = Array.isArray(sp.system) ? sp.system[0] : sp.system;
  const baseParsed = parseMetricsFilter(sp, projectId, filterOptions);
  const parsed = { ...baseParsed, ...(await applySystemFilter(baseParsed, systemParam)) };

  const [sourceMetrics, scope] = await Promise.all([
    getSourceMetrics(parsed),
    resolveFilterScope(parsed),
  ]);

  const [citations, ownBrand, prompts, engines] = await Promise.all([
    getCitations({
      promptIds: scope.promptIds,
      fromDate: scope.resolvedRange.from,
      toDate: scope.resolvedRange.to,
    }),
    getTrackedUrls({ ownOnly: true }),
    getPrompts(),
    getEngines(),
  ]);

  const state: FilterState = {
    preset: parsed.preset,
    models: parsed.engineIds,
    tag: parsed.tagIds,
    tagMode: parsed.tagMode,
    topic: parsed.topicIds,
    country: parsed.countries,
    system: systemParam,
  };

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

  // --- Sankey: topic → engine → domain type → domain ---
  // Every citation contributes 1 to each of the three hops, so each stage
  // sums to the same total and the ribbon widths stay comparable across the
  // whole diagram.
  const topicByPromptId = new Map(prompts.map((p) => [p.id, p.topic || "Uncategorized"]));
  const engineNameById = new Map(engines.map((e) => [e.id, e.name]));

  const domainTotals = new Map<string, number>();
  for (const c of citations) domainTotals.set(c.domain, (domainTotals.get(c.domain) ?? 0) + 1);
  const keptDomains = new Set(
    [...domainTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, SANKEY_TOP_DOMAINS)
      .map(([d]) => d)
  );

  // Depth-prefixed ids: sankey node names must be unique graph-wide, and a
  // topic can share a display name with a domain type.
  const linkTotals = new Map<string, number>();
  /* NUL joins the pair rather than a space: the ids themselves contain spaces
     ("0 Coconut Oil"), so splitting on one would tear them apart. */
  const bump = (source: string, target: string) => {
    const key = `${source}\u0000${target}`;
    linkTotals.set(key, (linkTotals.get(key) ?? 0) + 1);
  };
  const nodeDepth = new Map<string, number>();
  const see = (id: string, depth: number) => nodeDepth.set(id, depth);

  for (const c of citations) {
    const topic = `0 ${topicByPromptId.get(c.prompt_id) ?? "Uncategorized"}`;
    const engine = `1 ${engineNameById.get(c.engine_id) ?? "Unknown engine"}`;
    const type = `2 ${domainTypeByDomain.get(c.domain) ?? "Unclassified"}`;
    const domain = `3 ${keptDomains.has(c.domain) ? c.domain : "Other domains"}`;
    see(topic, 0);
    see(engine, 1);
    see(type, 2);
    see(domain, 3);
    bump(topic, engine);
    bump(engine, type);
    bump(type, domain);
  }

  const sankeyNodes = [...nodeDepth.entries()].map(([name, depth]) => ({ name, depth }));
  const sankeyLinks = [...linkTotals.entries()].map(([key, value]) => {
    const [source, target] = key.split("\u0000");
    return { source, target, value };
  });

  // Position is ordinal, so it gets buckets in rank order rather than a
  // sorted-by-size list — the order is the point.
  const positions = citations.map((c) => c.position).filter((p): p is number => p !== null);
  const positionBuckets = [
    { label: "#1", value: positions.filter((p) => p === 1).length },
    { label: "#2", value: positions.filter((p) => p === 2).length },
    { label: "#3", value: positions.filter((p) => p === 3).length },
    { label: "#4+", value: positions.filter((p) => p >= 4).length },
  ];

  return (
    <div>
      <section className="border-b border-[var(--ink)] py-11">
        <h1 className="m-0 font-serif text-[40px] font-normal tracking-[-0.02em]">Sources</h1>
        <p className="mt-2.5 max-w-[70ch] font-serif text-[16px] text-[var(--muted-2)] italic">
          {totalCitations} cited pages across {groups.length} domains — expand a domain to see
          which specific pages are cited and whether they name your brand.
        </p>
      </section>

      <FilterBar
        basePath="/sources"
        state={state}
        options={filterOptions}
        resolvedRange={sourceMetrics.resolvedRange}
        previousRange={null}
      />

      {/* Domain-type breakdown deliberately lives in the filter band inside
          SourcesTable, not here — plotting it twice on one page would be the
          same data in two places, and only that one drives the filter. */}
      <section className="py-8">
        <ChartCard
          title="Citation flow"
          subtitle={`How each topic's ${totalCitations} citations travel through the engines to the pages that actually get cited`}
        >
          <CitationSankeyClient nodes={sankeyNodes} links={sankeyLinks} />
        </ChartCard>
      </section>

      <section className="max-w-[520px] pb-8">
        <ChartCard
          title="Citation position"
          subtitle="Where cited pages land in the engine's source list"
        >
          <DistributionBars
            buckets={positionBuckets}
            emptyLabel="No engine returned a citation order yet."
          />
        </ChartCard>
      </section>

      <section className="pb-8">
        <SourceMetricsTable rows={sourceMetrics.rows} totalResponses={sourceMetrics.totalResponses} />
      </section>

      <SourcesTable groups={groups} />
    </div>
  );
}
