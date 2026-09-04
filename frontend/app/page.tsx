import Link from "next/link";
import { BrandLeaderboard } from "@/components/brand-leaderboard";
import { ChartCard } from "@/components/chart-card";
import { EngineLabel } from "@/components/engine-icons";
import { KpiCard } from "@/components/kpi-card";
import { MentionMark, ProvenanceLabel } from "@/components/marks";
import { ModelPerformanceTable, type ModelRow } from "@/components/model-performance-table";
import { MoversList } from "@/components/movers-list";
import { ShareOfSearchBars } from "@/components/share-of-search-bars";
import { MultiTrendChart } from "@/components/multi-trend-chart";
import { ReferralSurfaceTable } from "@/components/referral-surface-table";
import { SourceVisibilityTable } from "@/components/source-visibility-table";
import { TrendChart } from "@/components/trend-chart";
import { getCurrentProjectId } from "@/lib/current-project";
import {
  getCitations,
  getEngines,
  getPrompts,
  getQueryFanouts,
  getRawResponses,
  getTrackedUrls,
} from "@/lib/queries";
import {
  getBrandMetrics,
  getBrandTimeSeries,
  getFilterOptions,
  getSourceMetrics,
  rangeFromPreset,
  todayUtc,
} from "@/lib/metrics";
import { brandTerms, shareOfSearch } from "@/lib/fanout-analysis";
import { computeMovers } from "@/lib/movers";
import { referralSurface } from "@/lib/referral-surface";
import type { Citation } from "@/lib/types";

export const dynamic = "force-dynamic";

async function getOverviewData() {
  const [prompts, engines, citations, rawResponses, ownBrand] = await Promise.all([
    getPrompts(),
    getEngines(),
    getCitations(),
    getRawResponses(),
    getTrackedUrls({ ownOnly: true }),
  ]);
  return { prompts, engines, citations, rawResponses, ownBrand };
}


export default async function OverviewPage() {
  const { prompts, engines, citations, rawResponses, ownBrand } = await getOverviewData();

  // --- Metrics layer: the same sums-first numbers /insights reports, so the
  // Overview can never disagree with the page it links into. -----------------
  const projectId = await getCurrentProjectId();
  const filterOptions = await getFilterOptions(projectId);
  const filter = {
    projectId,
    range: rangeFromPreset("30d", filterOptions.dataRange?.last ?? todayUtc()),
  };

  // Everything in this batch is independent of everything else in it —
  // allBrands and fanouts don't touch `filter` at all, and nothing here
  // depends on another call's result. It used to be four sequential
  // `await`s in a row, which is exactly the kind of waterfall that turned a
  // page that should load in ~1-2s into one taking 10-20s: a real user hit
  // this and assumed the site had hung, not just that it was slow. Four
  // network round trips run one after another instead of together is the
  // actual bug; the loading UI (navigation-progress-bar.tsx, app/loading.tsx)
  // is the honest fallback for whatever latency is left AFTER this fix, not
  // a replacement for fixing it.
  const [metrics, sourceMetrics, allBrands, fanouts] = await Promise.all([
    getBrandMetrics(filter),
    getSourceMetrics(filter),
    getTrackedUrls(),
    getQueryFanouts(rawResponses.map((r) => r.id)),
  ]);
  const own = metrics.rows.find((r) => !r.isCompetitor) ?? null;

  // Own brand + top 5 competitors, matching the trend chart on /insights —
  // computed before the next batch since trendSeries below needs it.
  const trendBrandIds = [
    ...(own ? [own.brandId] : []),
    ...metrics.rows
      .filter((r) => r.isCompetitor)
      .sort((a, b) => (b.visibility.value ?? -1) - (a.visibility.value ?? -1))
      .slice(0, 5)
      .map((r) => r.brandId),
  ];

  // Per-engine performance and the trend series both depend on `metrics`
  // above, but NOT on each other — they used to run one after the other for
  // no reason. Run together instead.
  const [modelResults, trendSeries] = await Promise.all([
    own
      ? Promise.all(
          metrics.responsesByEngine.map(async (e) => {
            const m = await getBrandMetrics({ ...filter, engineIds: [e.engineId] });
            const row = m.rows.find((r) => r.brandId === own.brandId);
            return row
              ? {
                  engineId: e.engineId,
                  engineName: e.name,
                  visibility: row.visibility,
                  sov: row.sov,
                  mentionCount: row.mentionCount,
                  position: row.position,
                  responses: e.responses,
                }
              : null;
          }),
        )
      : Promise.resolve([]),
    trendBrandIds.length
      ? getBrandTimeSeries(filter, { metric: "sov", bucket: "week", brandIds: trendBrandIds })
      : Promise.resolve([]),
  ]);
  // Per-engine performance: one scoped call per engine rather than a new RPC.
  // Engine count is small (single digits) and this reuses the exact same
  // finalisation path, so the per-model figures cannot drift from the totals.
  const modelRows: ModelRow[] = modelResults.filter((r): r is ModelRow => r !== null);
  modelRows.sort((a, b) => (b.sov.value ?? -1) - (a.sov.value ?? -1));

  const ownDomains = new Set(ownBrand.map((b) => b.url));

  // Referral surface: clickable paths into each brand's own site that the
  // engines actually placed. Uses every tracked brand, not just your own.
  const referral = referralSurface(citations, allBrands);

  // Share of search: who the engines went LOOKING for, from their own
  // sub-queries. Upstream of share of voice — see lib/fanout-analysis.ts.
  const sos = shareOfSearch(fanouts, brandTerms(allBrands));

  // Movers reuse the weekly series the trend chart already fetched, so this
  // costs no extra query.
  const movers = computeMovers(trendSeries, { limit: 5 });
  const promptById = new Map(prompts.map((p) => [p.id, p.query_text]));
  const engineById = new Map(engines.map((e) => [e.id, e.name]));
  const brandName = ownBrand[0]?.name ?? "your brand";


  const totalCitations = citations.length;
  const citationsMentioningBrand = citations.filter((c) => c.mentions_brand === true).length;
  const totalAnswers = rawResponses.length;
  const answersMentioningBrand = rawResponses.filter((r) => r.brand_mentioned_in_answer).length;
  const answerMentionPct = totalAnswers ? Math.round((answersMentioningBrand / totalAnswers) * 100) : 0;

  const domainCounts = new Map<string, number>();
  const domainOwned = new Set<string>();
  const byDay = new Map<string, number>();
  const byDayNaming = new Map<string, number>();
  for (const c of citations) {
    domainCounts.set(c.domain, (domainCounts.get(c.domain) ?? 0) + 1);
    if (c.mentions_brand) domainOwned.add(c.domain);
    const day = c.fetched_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
    if (c.mentions_brand) byDayNaming.set(day, (byDayNaming.get(day) ?? 0) + 1);
  }

  const chartDays = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));


  const citationsByRawResponse = new Map<string, Citation[]>();
  for (const c of citations) {
    if (!c.raw_response_id) continue;
    const list = citationsByRawResponse.get(c.raw_response_id) ?? [];
    list.push(c);
    citationsByRawResponse.set(c.raw_response_id, list);
  }

  const topDomains = Array.from(domainCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 7);
  const domainMax = topDomains.length ? topDomains[0][1] : 1;

  const recentAnswers = rawResponses.slice(0, 6);

  return (
    <div className="py-7">
      <div className="mb-6 flex items-end justify-between gap-8">
        <div>
          <h1 className="m-0 font-sans text-[26px] leading-[1.25] font-bold tracking-[-0.01em] text-balance">
            <span>
              {citationsMentioningBrand} of {totalCitations}
            </span>{" "}
            cited pages mention <span className="text-[var(--ember)]">{brandName}</span> — named
            in <span>{answerMentionPct}%</span> of answers
          </h1>
          <p className="mt-2 max-w-[62ch] font-sans text-[14px] leading-[1.55] text-[var(--muted-2)]">
            Answer engines cite plenty of pages that never name {brandName} — the ones that do are
            the real signal here.
          </p>
        </div>
      </div>

      {/* Headline metrics come from the metrics layer, not from daily_metrics,
          so this page and /insights can never quote different numbers for the
          same thing. Each carries its own change vs. the preceding period. */}
      {own && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Share of voice"
            metric="sov"
            cell={own.sov}
            hint="Your share of every tracked brand mention across this period's answers"
            sub={`${own.mentionCount} mentions`}
          />
          <KpiCard
            label="Brand visibility"
            metric="visibility"
            cell={own.visibility}
            hint="Share of answers that name your brand"
            sub={`${own.visibility.support.responses} answers scored`}
          />
          <KpiCard
            label="Sentiment"
            metric="sentiment"
            cell={own.sentiment}
            hint="How the answers portray your brand, 0-100"
            sub={
              own.sentiment.support.observations
                ? `${own.sentiment.support.observations} scored mentions`
                : undefined
            }
          />
          <KpiCard
            label="Avg. position"
            metric="position"
            cell={own.position}
            hint="Where you rank among named brands, when you are named. Lower is better."
            sub={`${own.position.support.observations} ranked mentions`}
          />
        </section>
      )}

      <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard
          title="Share of voice over time"
          subtitle="You against your top competitors, week by week"
        >
          <MultiTrendChart series={trendSeries} metric="sov" />
        </ChartCard>

        <ChartCard
          title="Performance by model"
          subtitle="How each answer engine treats you — bars compare engines against each other"
        >
          <ModelPerformanceTable rows={modelRows} />
        </ChartCard>
      </section>

      <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard
          title="Most cited sources"
          subtitle="The domains answers actually draw on, and how much of the period each reaches"
        >
          <SourceVisibilityTable rows={sourceMetrics.rows} ownDomains={ownDomains} />
        </ChartCard>

        <ChartCard
          title="Citation volume"
          subtitle="Citations captured per fetch day"
        >
          <TrendChart points={chartDays.map(([day, value]) => ({ day, value }))} />
        </ChartCard>
      </section>

      <section className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard
          title="Brand leaderboard"
          subtitle="Every tracked brand ranked by share of voice — who is actually winning these answers"
        >
          <BrandLeaderboard rows={metrics.rows} />
        </ChartCard>

        <ChartCard
          title="What moved"
          subtitle="Biggest share-of-voice changes between the last two periods that have data"
        >
          <MoversList movers={movers} />
        </ChartCard>
      </section>

      <section className="mt-5">
        <ChartCard
          title="Share of search"
          subtitle="Who the engines went looking for in their own background sub-searches — upstream of share of voice, which counts who they ended up recommending"
        >
          <ShareOfSearchBars
            rows={sos.rows}
            totalSearches={sos.totalSearches}
            brandedSearches={sos.brandedSearches}
          />
        </ChartCard>
      </section>

      <section className="mt-5">
        <ChartCard
          title="Referral surface"
          subtitle="Clickable paths into each brand's own site that AI answers actually placed — the observable counterpart to a competitor traffic estimate"
        >
          <ReferralSurfaceTable
            rows={referral.rows}
            totalBrandCitations={referral.totalBrandCitations}
            taggedTotal={referral.taggedTotal}
          />
        </ChartCard>
      </section>

      {/* The legacy "Citation volume" section rendered here was an exact
          duplicate of the ChartCard above — same TrendChart, same data,
          twice on one page. Removed; the card above is the one. */}

      <section className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_1.5fr]">
        <div
          className="rounded-[var(--radius-xl)] bg-[var(--card)] p-6"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <h2 className="m-0 font-sans text-[16px] font-bold tracking-[-0.005em]">Where answers come from</h2>
          <p className="m-0 mt-1 mb-4 font-sans text-[12.5px] text-[var(--muted-2)]">
            {totalCitations} cited pages across {domainCounts.size} domains
          </p>
          <div className="flex flex-col gap-3.5">
            {topDomains.map(([domain, count], i) => (
              <Link
                key={domain}
                href="/sources"
                className="block rounded-[10px] no-underline transition-colors duration-150 hover:bg-[var(--muted)]"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="w-[16px] font-sans text-[11px] text-[var(--faint)] tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-sans text-[13px] font-medium tracking-[-0.005em]">{domain}</span>
                    {domainOwned.has(domain) && (
                      <span className="rounded-full bg-[var(--tint-mint)] px-2 py-0.5 font-sans text-[9.5px] font-medium text-[var(--tint-mint-fg)]">
                        names you
                      </span>
                    )}
                  </div>
                  <span className="font-sans text-[14px] font-semibold tabular-nums">{count}</span>
                </div>
                <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-[var(--rule-light)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round((count / domainMax) * 100)}%`,
                      background: domainOwned.has(domain) ? "var(--green)" : "var(--faint)",
                    }}
                  />
                </div>
              </Link>
            ))}
            {!topDomains.length && (
              <p className="font-sans text-[13px] text-[var(--muted-2)]">No data yet.</p>
            )}
          </div>
        </div>

        <div
          className="rounded-[var(--radius-xl)] bg-[var(--card)] p-6"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <h2 className="m-0 font-sans text-[16px] font-bold tracking-[-0.005em]">Recent answers</h2>
          <p className="m-0 mt-1 mb-4 font-sans text-[12.5px] text-[var(--muted-2)]">newest fetch first</p>
          <div className="flex flex-col">
            {recentAnswers.map((r, i) => {
              const cited = citationsByRawResponse.get(r.id) ?? [];
              const real = cited.length ? cited.some((c) => !c.is_simulated) : true;
              const mentionCount = cited.filter((c) => c.mentions_brand === true).length;
              return (
                <article
                  key={r.id}
                  className="py-4"
                  style={{ borderTop: i === 0 ? "none" : "1px solid var(--rule-light)" }}
                >
                  <div className="flex items-baseline justify-between gap-6">
                    <div className="flex items-baseline gap-2.5 font-sans text-[11px] font-medium text-[var(--muted-2)]">
                      <span className="text-[var(--ink)]">
                        <EngineLabel name={engineById.get(r.engine_id)} size={13} />
                      </span>
                      <span>{new Date(r.fetched_at).toLocaleString()}</span>
                      <ProvenanceLabel real={real} />
                    </div>
                    <MentionMark
                      value={r.brand_mentioned_in_answer}
                      label={r.brand_mentioned_in_answer ? `${brandName} in answer` : "not in answer"}
                    />
                  </div>
                  <Link
                    href={`/prompts/${r.prompt_id}`}
                    className="mt-2 block font-sans text-[15px] leading-[1.35] font-semibold tracking-[-0.005em] text-[var(--ink)] no-underline hover:text-[var(--ember)]"
                  >
                    &ldquo;{promptById.get(r.prompt_id) ?? "—"}&rdquo;
                  </Link>
                  {r.answer_text && (
                    <p className="mt-2 max-w-[68ch] rounded-[10px] bg-[var(--muted)] p-3 font-sans text-[13px] leading-[1.6] text-[var(--muted-2)] text-pretty">
                      {r.answer_text.slice(0, 220)}
                      {r.answer_text.length > 220 ? "…" : ""}
                    </p>
                  )}
                  <div className="mt-2 flex gap-4 font-sans text-[11.5px] text-[var(--muted-2)]">
                    <span>{cited.length} pages cited</span>
                    <span>
                      {mentionCount} mention {brandName}
                    </span>
                  </div>
                </article>
              );
            })}
            {!recentAnswers.length && (
              <p className="font-sans text-[13px] text-[var(--muted-2)]">No fetches yet.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
