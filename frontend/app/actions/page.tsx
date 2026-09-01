import { ChartCard } from "@/components/chart-card";
import { createBriefFromGap } from "@/lib/actions/briefs";
import { getCurrentProjectId } from "@/lib/current-project";
import {
  getBrandMetrics,
  getFilterOptions,
  getSegmentMatrix,
  parseMetricsFilter,
  rangeFromPreset,
  todayUtc,
} from "@/lib/metrics";
import {
  getAnswerBrandMentions,
  getCitations,
  getDomainTypes,
  getPrompts,
  getTrackedUrls,
  getUnmatchedBrandMentions,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

type ActionCard = {
  category: string;
  title: string;
  detail: string;
  priority: number; // higher = more urgent, sorted descending
  action?: { label: string; formAction: (fd: FormData) => Promise<void> };
};

/**
 * Turns data that already exists into a ranked to-do list — Peec's
 * "Actions" surface. No new fetching or classification: every input here
 * is already computed by another page's query, just re-read and re-scored.
 * Priority is a plain weighted score (recency/magnitude + a fixed
 * per-category weight), not ML — matches "auto-generated, prioritized"
 * without overbuilding a recommendation engine nobody asked for.
 */
export default async function ActionsPage() {
  const projectId = await getCurrentProjectId();
  const filterOptions = await getFilterOptions(projectId);
  const range = rangeFromPreset("30d", filterOptions.dataRange?.last ?? todayUtc());
  const filter = parseMetricsFilter({}, projectId, filterOptions);
  filter.range = range;

  const [gapCitations, prompts, competitors, ownBrand, metrics, unmatched] = await Promise.all([
    getCitations({ realOnly: true, notMentioningBrand: true }),
    getPrompts(),
    getTrackedUrls({ competitorsOnly: true }),
    getTrackedUrls({ ownOnly: true }),
    getBrandMetrics(filter),
    getUnmatchedBrandMentions(projectId),
  ]);
  const domainTypeByDomain = await getDomainTypes([...new Set(gapCitations.map((c) => c.domain))]);
  const promptTextById = new Map(prompts.map((p) => [p.id, p.query_text]));

  const cards: ActionCard[] = [];

  // --- 1 & 2: gap-analysis-derived actions -----------------------------
  const byUrl = new Map<
    string,
    { url: string; domain: string; citations: number; promptId: string }
  >();
  for (const c of gapCitations) {
    const existing = byUrl.get(c.url);
    if (existing) existing.citations += 1;
    else byUrl.set(c.url, { url: c.url, domain: c.domain, citations: 1, promptId: c.prompt_id });
  }
  const gapRows = [...byUrl.values()].sort((a, b) => b.citations - a.citations);

  for (const row of gapRows.slice(0, 6)) {
    const isEditorial = domainTypeByDomain.get(row.domain) === "Editorial";
    const promptText = promptTextById.get(row.promptId) ?? row.domain;
    cards.push({
      category: "Pitch this publication",
      title: row.domain,
      detail: `Cited ${row.citations}× by competitor answers, never naming you${isEditorial ? " — an editorial source, worth a real pitch" : ""}.`,
      priority: row.citations * (isEditorial ? 2 : 1),
      action: {
        label: "Draft content brief",
        formAction: createBriefFromGap.bind(null, promptText, `from action: ${row.domain}`),
      },
    });
  }

  // --- 3: untracked competitors -----------------------------------------
  const trackedNames = new Set(
    [...competitors, ...ownBrand].flatMap((b) => [b.name, ...(b.aliases ?? [])]).map((n) => n.toLowerCase()),
  );
  const sightingsByName = new Map<string, number>();
  for (const u of unmatched) {
    const key = u.name.trim().toLowerCase();
    if (!key || trackedNames.has(key)) continue;
    sightingsByName.set(u.name.trim(), (sightingsByName.get(u.name.trim()) ?? 0) + 1);
  }
  for (const [name, sightings] of sightingsByName) {
    if (sightings < 3) continue;
    cards.push({
      category: "Track this competitor",
      title: name,
      detail: `Mentioned in ${sightings} answers alongside a brand you already track, but isn't tracked itself.`,
      priority: sightings * 1.5,
    });
  }

  // --- 4: sentiment concern ---------------------------------------------
  const own = metrics.rows.find((r) => !r.isCompetitor);
  if (own && own.sentiment.value !== null && !own.sentiment.suppressed && own.sentiment.value < 60) {
    cards.push({
      category: "Sentiment concern",
      title: `${own.name}'s sentiment is ${own.sentiment.value}/100`,
      detail: `Below the neutral line over the last 30 days, across ${own.sentiment.support.observations} scored mention(s).`,
      priority: (60 - own.sentiment.value) * 2,
    });
  }

  // --- 5: low-visibility topics -------------------------------------------
  if (own) {
    const topicMatrix = await getSegmentMatrix(filter, {
      metric: "visibility",
      brandId: own.brandId,
      rowAxis: "topic",
      colAxis: "engine",
    });
    const projectAvg = own.visibility.value ?? 0;
    const byTopic = new Map<string, number[]>();
    for (const cell of topicMatrix.cells) {
      if (cell.value.value === null) continue;
      const list = byTopic.get(cell.rowKey) ?? [];
      list.push(cell.value.value);
      byTopic.set(cell.rowKey, list);
    }
    for (const key of topicMatrix.rowKeys) {
      const values = byTopic.get(key.key);
      if (!values?.length) continue;
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const gap = projectAvg - avg;
      if (gap < 15) continue; // not materially below average
      cards.push({
        category: "Low-visibility topic",
        title: key.label,
        detail: `${Math.round(avg)}% visibility vs. ${Math.round(projectAvg)}% overall — ${key.promptCount} prompt(s) in this topic.`,
        priority: gap,
      });
    }
  }

  cards.sort((a, b) => b.priority - a.priority);
  const byCategory = new Map<string, ActionCard[]>();
  for (const c of cards) {
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }

  return (
    <div className="pb-12">
      <section className="border-b border-[var(--border)] py-6">
        <h1 className="m-0 font-sans text-[26px] font-semibold tracking-[-0.02em]">Actions</h1>
        <p className="mt-1.5 max-w-[70ch] font-sans text-[13.5px] text-[var(--muted-2)]">
          Ranked recommendations, derived entirely from data already captured elsewhere in this app —
          no new fetching, no ML scoring, just a weighted priority order.
        </p>
      </section>

      {cards.length === 0 && (
        <p className="py-10 text-center font-sans text-[14px] text-[var(--muted-2)]">
          Nothing to act on yet — this fills in as more answers get captured.
        </p>
      )}

      {[...byCategory.entries()].map(([category, list]) => (
        <section key={category} className="py-6">
          <ChartCard title={category} subtitle={`${list.length} recommendation(s)`}>
            <div className="flex flex-col gap-2.5">
              {list.map((c, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-4 rounded-[10px] border border-[var(--border)] p-3.5"
                >
                  <div className="min-w-0">
                    <div className="font-sans text-[13.5px] font-medium text-[var(--ink)]">{c.title}</div>
                    <div className="mt-0.5 font-sans text-[12px] text-[var(--muted-2)]">{c.detail}</div>
                  </div>
                  {c.action && (
                    <form action={c.action.formAction} className="shrink-0">
                      <button
                        type="submit"
                        className="rounded-full border border-[var(--ink)] bg-[var(--ink)] px-3 py-1.5 font-sans text-[11.5px] font-medium whitespace-nowrap text-[var(--paper)]"
                      >
                        {c.action.label}
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          </ChartCard>
        </section>
      ))}
    </div>
  );
}
