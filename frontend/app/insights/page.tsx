import Link from "next/link";
import { ChartCard } from "@/components/chart-card";
import { ChatRow } from "@/components/chat-row";
import { FilterBar, type FilterState } from "@/components/filter-bar";
import { GapMatrixView } from "@/components/gap-matrix";
import { KpiStrip } from "@/components/kpi-strip";
import { MultiTrendChart } from "@/components/multi-trend-chart";
import { SegmentHeatmap } from "@/components/segment-heatmap";
import { TopBrandsTable } from "@/components/top-brands-table";
import { TopRankings } from "@/components/top-rankings";
import { getCurrentProjectId } from "@/lib/current-project";
import { getAnswerBrandMentions, getChats, getEngines, getTrackedUrls } from "@/lib/queries";
import type { RankedBrand } from "@/lib/highlight-brands";
import {
  applySystemFilter,
  getBrandMetrics,
  getBrandTimeSeries,
  getEngineBreakdown,
  getFilterOptions,
  getGapMatrix,
  getSegmentMatrix,
  getTopRankings,
  parseMetricsFilter,
} from "@/lib/metrics/api";
import type { Bucket, MetricKey, MetricsWarning, SegmentAxis } from "@/lib/metrics/types";

export const dynamic = "force-dynamic";

const AXES: SegmentAxis[] = ["topic", "tag", "engine", "country"];

function warningText(w: MetricsWarning): string {
  switch (w.kind) {
    case "no-prior-period":
      return "No preceding period to compare against yet, so changes show as “—” rather than a made-up number.";
    case "partial-period":
      return `${w.missingDays} day(s) in this range have no captured answers; the range was trimmed to days with data.`;
    case "degenerate-sov":
      return w.brandsWithMentions === 0
        ? "No tracked brand was named in this period, so share of voice is undefined rather than 0%."
        : "Only one brand has been named so far, so share of voice is 100% by default — not a real comparison yet.";
    case "engine-imbalance":
      return `One model ran ${w.ratio}× more often than another, so blended figures lean toward it.`;
    case "brand-partial-coverage":
      return `${w.brandName} was only scored against ${Math.round(w.coverage * 100)}% of this period's answers.`;
  }
}

/** Only the headline claim needs a confidence gate — the rest of the page is
 *  honest about thin data via each value's own support. */
function headline(rank: number | null, total: number, enough: boolean): { title: string; sub: string } {
  if (!enough || rank === null) {
    return {
      title: "Not enough data yet",
      sub: "Capture more answers before reading these numbers as a trend.",
    };
  }
  // "#1 of 1" is not a ranking. Until a competitor has been scored, say what
  // is actually known instead of implying you beat a field that isn't there.
  if (total <= 1) {
    return {
      title: "You’re the only brand measured so far",
      sub: "Competitors have been added but not yet scored against stored answers, so there is nothing to rank against yet.",
    };
  }
  if (rank === 1) {
    return {
      title: "You’re #1 in AI visibility",
      sub: `You appear in more AI answers than the other ${total - 1} tracked brand(s).`,
    };
  }
  return {
    title: `You’re #${rank} in AI visibility`,
    sub: `${rank - 1} tracked brand(s) appear in more AI answers than you do.`,
  };
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const projectId = await getCurrentProjectId();
  const options = await getFilterOptions(projectId);
  const systemParam = Array.isArray(sp.system) ? sp.system[0] : sp.system;
  const baseParsed = parseMetricsFilter(sp, projectId, options);
  // applySystemFilter's return type is the plain MetricsFilter (it only ever
  // touches promptIds) — spread back over baseParsed so preset/bucket survive.
  const parsed = { ...baseParsed, ...(await applySystemFilter(baseParsed, systemParam)) };

  const metric = (Array.isArray(sp.metric) ? sp.metric[0] : sp.metric) as MetricKey | undefined;
  const activeMetric: MetricKey = (
    ["visibility", "sov", "sentiment", "position"] as const
  ).includes(metric as MetricKey)
    ? (metric as MetricKey)
    : "visibility";

  const rowAxisParam = (Array.isArray(sp.rows) ? sp.rows[0] : sp.rows) as SegmentAxis | undefined;
  const rowAxis: SegmentAxis = AXES.includes(rowAxisParam as SegmentAxis)
    ? (rowAxisParam as SegmentAxis)
    : "tag";
  const colAxis: SegmentAxis = rowAxis === "tag" ? "topic" : "tag";

  const bucketParam = (Array.isArray(sp.bucket) ? sp.bucket[0] : sp.bucket) as string | undefined;
  const bucket: Bucket = bucketParam === "week" || bucketParam === "month" ? bucketParam : "day";

  const metrics = await getBrandMetrics(parsed);
  const own = metrics.rows.find((r) => !r.isCompetitor) ?? metrics.rows[0] ?? null;

  // Own brand + top 5 competitors by visibility — matches Peec's "your brand
  // and top 6 competitors" trend chart exactly.
  const trendBrandIds = [
    ...(own ? [own.brandId] : []),
    ...metrics.rows
      .filter((r) => r.isCompetitor)
      .sort((a, b) => (b.visibility.value ?? -1) - (a.visibility.value ?? -1))
      .slice(0, 5)
      .map((r) => r.brandId),
  ];

  const [breakdowns, rankings, matrix, gapMatrix, trendSeries] = await Promise.all([
    own ? getEngineBreakdown(parsed, { metric: activeMetric, brandIds: [own.brandId] }) : Promise.resolve([]),
    getTopRankings(parsed),
    own
      ? getSegmentMatrix(parsed, { metric: activeMetric, brandId: own.brandId, rowAxis, colAxis })
      : Promise.resolve(null),
    own ? getGapMatrix(parsed, own.brandId) : Promise.resolve(null),
    trendBrandIds.length
      ? getBrandTimeSeries(parsed, { metric: activeMetric, bucket, brandIds: trendBrandIds })
      : Promise.resolve([]),
  ]);

  // Recent chats — Peec's Performance page keeps this inline, not only on a
  // separate page. Small fixed slice, not filtered by the metrics range:
  // this is "what just happened", the full /chats page is where filtering lives.
  const [engines, trackedUrls, recentChats] = await Promise.all([
    getEngines(),
    getTrackedUrls(),
    getChats({ projectId, limit: 6 }),
  ]);
  const engineNameById = new Map(engines.map((e) => [e.id, e.name]));
  const trackedById = new Map(trackedUrls.map((t) => [t.id, t]));
  const recentMentions = await getAnswerBrandMentions(recentChats.rows.map((c) => c.id));
  const rankedByResponse = new Map<string, RankedBrand[]>();
  for (const m of recentMentions) {
    if (!m.mentioned || m.position == null) continue;
    const t = trackedById.get(m.tracked_url_id);
    if (!t) continue;
    const list = rankedByResponse.get(m.raw_response_id) ?? [];
    list.push({ name: t.name, isOwn: !t.is_competitor, position: m.position, sentiment: m.sentiment_score });
    rankedByResponse.set(m.raw_response_id, list);
  }
  for (const list of rankedByResponse.values()) list.sort((a, b) => a.position - b.position);

  const ranked = metrics.rows
    .filter((r) => r.visibility.value !== null)
    .sort((a, b) => (b.visibility.value ?? 0) - (a.visibility.value ?? 0));
  const rank = own ? ranked.findIndex((r) => r.brandId === own.brandId) + 1 || null : null;
  const enough = Boolean(own && !own.visibility.suppressed && own.visibility.value !== null);
  const { title, sub } = headline(rank, ranked.length, enough);

  const state: FilterState = {
    preset: parsed.preset,
    models: parsed.engineIds,
    tag: parsed.tagIds,
    tagMode: parsed.tagMode,
    topic: parsed.topicIds,
    country: parsed.countries,
    system: systemParam,
  };

  const metricHref = (m: MetricKey) => {
    const qs = new URLSearchParams(
      Object.entries(sp).flatMap(([k, v]) =>
        v === undefined ? [] : [[k, Array.isArray(v) ? v.join(",") : v] as [string, string]],
      ),
    );
    qs.set("metric", m);
    return `/insights?${qs.toString()}`;
  };

  const switchAxisHref = (() => {
    const qs = new URLSearchParams(
      Object.entries(sp).flatMap(([k, v]) =>
        v === undefined ? [] : [[k, Array.isArray(v) ? v.join(",") : v] as [string, string]],
      ),
    );
    qs.set("rows", rowAxis === "tag" ? "topic" : "tag");
    return `/insights?${qs.toString()}`;
  })();

  const bucketHref = (b: Bucket) => {
    const qs = new URLSearchParams(
      Object.entries(sp).flatMap(([k, v]) =>
        v === undefined ? [] : [[k, Array.isArray(v) ? v.join(",") : v] as [string, string]],
      ),
    );
    qs.set("bucket", b);
    return `/insights?${qs.toString()}`;
  };

  return (
    <div className="pb-12">
      <section className="py-8">
        <h1 className="m-0 font-sans text-[36px] font-bold tracking-[-0.03em]">{title}</h1>
        <p className="mt-1.5 font-sans text-[14px] text-[var(--muted-2)]">{sub}</p>
      </section>

      <FilterBar
        basePath="/insights"
        state={state}
        options={options}
        resolvedRange={metrics.resolvedRange}
        previousRange={metrics.previousRange}
        extra={{ metric: activeMetric, rows: rowAxis, bucket }}
      />

      {metrics.warnings.length > 0 && (
        <section className="mt-4 flex flex-col gap-1.5">
          {metrics.warnings.slice(0, 3).map((w, i) => (
            <p
              key={i}
              className="m-0 rounded-[var(--radius-sm)] px-3 py-2 font-sans text-[12px]"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
            >
              {warningText(w)}
            </p>
          ))}
        </section>
      )}

      {own && (
        <section className="mt-5">
          <KpiStrip brand={own} breakdown={breakdowns[0] ?? null} />
        </section>
      )}

      <section className="mt-3 flex flex-wrap gap-1.5">
        {(["visibility", "sov", "sentiment", "position"] as MetricKey[]).map((m) => (
          <a
            key={m}
            href={metricHref(m)}
            className="rounded-full border px-3 py-1.5 font-sans text-[12px] font-medium capitalize no-underline"
            style={{
              borderColor: activeMetric === m ? "var(--ink)" : "var(--border)",
              background: activeMetric === m ? "var(--ink)" : "var(--card)",
              color: activeMetric === m ? "var(--paper)" : "var(--muted-2)",
            }}
          >
            {m === "sov" ? "Share of voice" : m}
          </a>
        ))}
      </section>

      <section className="mt-5">
        <ChartCard
          title={`${activeMetric === "sov" ? "Share of voice" : activeMetric} over time`}
          subtitle="Your brand vs. up to 5 competitors, ranked by visibility"
          action={
            <div className="flex items-center gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-0.5">
              {(["day", "week", "month"] as Bucket[]).map((b) => (
                <a
                  key={b}
                  href={bucketHref(b)}
                  className="rounded-[6px] px-2.5 py-1 font-sans text-[11px] font-medium capitalize no-underline"
                  style={{
                    background: bucket === b ? "var(--ink)" : "transparent",
                    color: bucket === b ? "var(--paper)" : "var(--muted-2)",
                  }}
                >
                  {b}
                </a>
              ))}
            </div>
          }
        >
          <MultiTrendChart series={trendSeries} metric={activeMetric} />
        </ChartCard>
      </section>

      <section className="mt-5">
        <TopBrandsTable rows={metrics.rows} totalResponses={metrics.totalResponses} />
      </section>

      <section className="mt-5 grid grid-cols-1 gap-5">
        <ChartCard
          title="Named vs. cited"
          subtitle="Whether your brand is named and/or its own site is cited as a source — two independent facts, not one"
        >
          <GapMatrixView matrix={gapMatrix} />
        </ChartCard>

        <ChartCard
          title="Performance matrix"
          subtitle={`${activeMetric === "sov" ? "Share of voice" : activeMetric} by ${rowAxis} and ${colAxis} — rates only, so rows and columns deliberately don't total`}
        >
          {matrix ? (
            <SegmentHeatmap matrix={matrix} switchAxisHref={switchAxisHref} />
          ) : (
            <p className="font-sans text-[13px] text-[var(--muted-2)]">No brand to segment yet.</p>
          )}
        </ChartCard>

        <ChartCard
          title="Top rankings"
          subtitle="Which brand each model reaches for first, by average position"
        >
          <TopRankings rankings={rankings} />
        </ChartCard>
      </section>

      <section className="mt-5">
        <div className="flex items-center justify-between px-1">
          <h2 className="m-0 font-sans text-[15px] font-semibold tracking-[-0.01em]">Recent chats</h2>
          <Link href="/chats" className="font-sans text-[12px] font-medium text-[var(--ember)] no-underline">
            View all →
          </Link>
        </div>
        <div className="mt-2 rounded-[var(--radius-xl)] bg-[var(--card)] px-4" style={{ boxShadow: "var(--shadow-card)" }}>
          {recentChats.rows.map((c) => (
            <ChatRow
              key={c.id}
              chat={c}
              engineName={engineNameById.get(c.engine_id)}
              ranked={rankedByResponse.get(c.id) ?? []}
            />
          ))}
          {!recentChats.rows.length && (
            <p className="py-6 text-center font-sans text-[13px] text-[var(--muted-2)]">
              No chats captured yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
