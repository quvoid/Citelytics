import { AddBrandForm } from "@/components/add-brand-form";
import { BarList } from "@/components/bar-list";
import { BrandsTable } from "@/components/brands-table";
import { ChartCard } from "@/components/chart-card";
import { CompetitorSuggestions, type CompetitorSuggestion } from "@/components/competitor-suggestions";
import { FilterBar, type FilterState } from "@/components/filter-bar";
import { getCurrentProjectId } from "@/lib/current-project";
import {
  getAnswerBrandMentions,
  getCitations,
  getRawResponses,
  getTrackedUrls,
  getUnmatchedBrandMentions,
} from "@/lib/queries";
import { applySystemFilter, getFilterOptions, parseMetricsFilter, resolveFilterScope } from "@/lib/metrics";

/** Aggregates raw sightings into ranked suggestions, filtering out anything
 * that (case-insensitively) already matches a tracked name or alias — a
 * name can go from "unmatched" to "tracked" after some sightings were
 * recorded, and the write-time dedup in store.py only sees brands tracked
 * AT THAT MOMENT, so this has to filter defensively too. */
function buildCompetitorSuggestions(
  raw: { name: string; created_at: string }[],
  trackedNames: Set<string>,
  minSightings = 2,
): CompetitorSuggestion[] {
  const byKey = new Map<string, { name: string; sightings: number; lastSeen: string }>();
  for (const r of raw) {
    const key = r.name.trim().toLowerCase();
    if (!key || trackedNames.has(key)) continue;
    const existing = byKey.get(key);
    if (existing) {
      existing.sightings += 1;
      if (r.created_at > existing.lastSeen) existing.lastSeen = r.created_at;
    } else {
      byKey.set(key, { name: r.name.trim(), sightings: 1, lastSeen: r.created_at });
    }
  }
  return [...byKey.values()]
    .filter((s) => s.sightings >= minSightings)
    .sort((a, b) => b.sightings - a.sightings)
    .slice(0, 12);
}

export const dynamic = "force-dynamic";

function matchesDomain(citationDomain: string, brandDomain: string): boolean {
  return citationDomain === brandDomain || citationDomain.endsWith(`.${brandDomain}`);
}

export default async function BrandsPage({
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
  const scope = await resolveFilterScope(parsed);

  const [brands, citations, rawResponses, unmatched] = await Promise.all([
    getTrackedUrls(),
    getCitations({ promptIds: scope.promptIds, fromDate: scope.resolvedRange.from, toDate: scope.resolvedRange.to }),
    getRawResponses(undefined, {
      promptIds: scope.promptIds,
      fromDate: scope.resolvedRange.from,
      toDate: scope.resolvedRange.to,
    }),
    getUnmatchedBrandMentions(projectId),
  ]);

  const trackedNames = new Set(
    brands.flatMap((b) => [b.name, ...(b.aliases ?? [])]).map((n) => n.trim().toLowerCase()),
  );
  const suggestions = buildCompetitorSuggestions(unmatched, trackedNames);

  const state: FilterState = {
    preset: parsed.preset,
    models: parsed.engineIds,
    tag: parsed.tagIds,
    tagMode: parsed.tagMode,
    topic: parsed.topicIds,
    country: parsed.countries,
    system: systemParam,
  };

  const mentions = await getAnswerBrandMentions(rawResponses.map((r) => r.id));

  const totalAnswers = rawResponses.length;
  const totalMentionedAcrossAllBrands = mentions.filter((m) => m.mentioned).length;

  const rows = brands.map((b) => {
    const matchedCitations = citations.filter((c) => matchesDomain(c.domain, b.url));
    const brandMentions = mentions.filter((m) => m.tracked_url_id === b.id && m.mentioned);
    const positions = brandMentions.map((m) => m.position).filter((p): p is number => p !== null);
    const avgPosition = positions.length ? positions.reduce((a, c) => a + c, 0) / positions.length : null;
    // Grounded on (the engine's own retrieval pulled this brand's domain in
    // as a source) but never actually named in the visible answer — the
    // "in the running, didn't make the final cut" gap. See AnswerBrandMention.
    const consideredNotNamed = mentions.filter(
      (m) => m.tracked_url_id === b.id && m.considered && !m.mentioned
    ).length;

    // How many of this slice's answers were actually scored against this
    // brand. A brand added today has none, and without this every metric
    // below would render a confident 0% — absence of data dressed up as a
    // measurement. The reclassify backfill is what turns this non-zero.
    const scoredAnswers = mentions.filter((m) => m.tracked_url_id === b.id).length;

    return {
      ...b,
      scoredAnswers,
      visibility: totalAnswers ? Math.round((brandMentions.length / totalAnswers) * 100) : 0,
      shareOfVoice: totalMentionedAcrossAllBrands
        ? Math.round((brandMentions.length / totalMentionedAcrossAllBrands) * 100)
        : 0,
      answers: brandMentions.length,
      avgPosition,
      pages: new Set(matchedCitations.map((c) => c.url)).size,
      consideredNotNamed,
    };
  });

  // Emphasis form: your brand is the story, competitors are the context, so
  // one accented bar against grey rather than a colour per brand.
  const sovItems = rows
    .filter((r) => r.shareOfVoice > 0)
    .sort((a, b) => b.shareOfVoice - a.shareOfVoice)
    .map((r) => ({
      label: r.name,
      value: r.shareOfVoice,
      sublabel: `${r.answers} of ${totalAnswers} answers`,
      emphasis: !r.is_competitor,
    }));

  return (
    <div>
      <section className="flex items-end justify-between gap-10 border-b border-[var(--ink)] py-11">
        <div>
          <h1 className="m-0 font-serif text-[40px] font-normal tracking-[-0.02em]">Brands</h1>
          <p className="mt-2.5 max-w-[59ch] font-serif text-[16px] text-[var(--muted-2)] italic">
            Share of voice across {totalAnswers} tracked AI answers — how often each brand is
            actually named, not just cited as a domain.
          </p>
        </div>
      </section>

      <FilterBar
        basePath="/brands"
        state={state}
        options={filterOptions}
        resolvedRange={scope.resolvedRange}
        previousRange={null}
      />

      <section className="py-8">
        <ChartCard
          title="Share of voice"
          subtitle="Of every brand mention across tracked answers, how much is yours"
        >
          {sovItems.length > 1 ? (
            <BarList items={sovItems} unit="%" />
          ) : (
            /* A lone 100% bar would read as dominance when it actually means
               nobody else was named — say that instead of drawing it. */
            <p className="m-0 font-sans text-[13.5px] text-[var(--muted-2)]">
              {sovItems.length === 1
                ? `Only ${sovItems[0].label} has been named so far, so share of voice is 100% by default — add competitors to make this a real comparison.`
                : "No brand has been named in a tracked answer yet."}
            </p>
          )}
        </ChartCard>
      </section>

      <CompetitorSuggestions suggestions={suggestions} />

      <AddBrandForm />

      <BrandsTable rows={rows} />
    </div>
  );
}
