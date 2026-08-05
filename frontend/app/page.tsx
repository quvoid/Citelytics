import Link from "next/link";
import { EngineLabel } from "@/components/engine-icons";
import { MentionMark, ProvenanceLabel } from "@/components/marks";
import {
  getCitations,
  getDailyMetrics,
  getEngines,
  getPrompts,
  getRawResponses,
  getTrackedUrls,
} from "@/lib/queries";
import type { Citation } from "@/lib/types";

export const dynamic = "force-dynamic";

const TINTS = [
  { bg: "var(--tint-lavender)", fg: "var(--tint-lavender-fg)" },
  { bg: "var(--tint-mint)", fg: "var(--tint-mint-fg)" },
  { bg: "var(--tint-sky)", fg: "var(--tint-sky-fg)" },
  { bg: "var(--tint-peach)", fg: "var(--tint-peach-fg)" },
  { bg: "var(--tint-rose)", fg: "var(--tint-rose-fg)" },
  { bg: "var(--muted)", fg: "var(--ink)" },
];

async function getOverviewData() {
  const [prompts, engines, citations, rawResponses, dailyMetrics, ownBrand] = await Promise.all([
    getPrompts(),
    getEngines(),
    getCitations(),
    getRawResponses(),
    getDailyMetrics(),
    getTrackedUrls({ ownOnly: true }),
  ]);
  return { prompts, engines, citations, rawResponses, dailyMetrics, ownBrand };
}

function fmtDelta(latest: number | null, prev: number | null, suffix = ""): { text: string; color: string } {
  if (latest === null || prev === null) return { text: "", color: "var(--faint)" };
  const diff = Math.round((latest - prev) * 10) / 10;
  if (diff === 0) return { text: "±0", color: "var(--faint)" };
  return {
    text: `${diff > 0 ? "+" : ""}${diff}${suffix}`,
    color: diff > 0 ? "var(--green)" : "var(--red)",
  };
}

export default async function OverviewPage() {
  const { prompts, engines, citations, rawResponses, dailyMetrics, ownBrand } =
    await getOverviewData();
  const promptById = new Map(prompts.map((p) => [p.id, p.query_text]));
  const engineById = new Map(engines.map((e) => [e.id, e.name]));
  const brandName = ownBrand[0]?.name ?? "your brand";

  const [latestMetric, prevMetric] = dailyMetrics;

  const totalCitations = citations.length;
  const citationsMentioningBrand = citations.filter((c) => c.mentions_brand === true).length;
  const totalAnswers = rawResponses.length;
  const answersMentioningBrand = rawResponses.filter((r) => r.brand_mentioned_in_answer).length;
  const answerMentionPct = totalAnswers ? Math.round((answersMentioningBrand / totalAnswers) * 100) : 0;

  const domainCounts = new Map<string, number>();
  const domainOwned = new Set<string>();
  for (const c of citations) {
    domainCounts.set(c.domain, (domainCounts.get(c.domain) ?? 0) + 1);
    if (c.mentions_brand) domainOwned.add(c.domain);
  }

  const kpis = [
    { label: "Cited pages", value: String(totalCitations), delta: null as null | { text: string; color: string } },
    { label: "Pages naming you", value: String(citationsMentioningBrand), delta: null },
    {
      label: "Visibility",
      value: latestMetric?.visibility_pct != null ? `${latestMetric.visibility_pct}%` : "—",
      delta: fmtDelta(latestMetric?.visibility_pct ?? null, prevMetric?.visibility_pct ?? null, " pts"),
    },
    {
      label: "Share of voice",
      value: latestMetric?.sov_pct != null ? `${latestMetric.sov_pct}%` : "—",
      delta: fmtDelta(latestMetric?.sov_pct ?? null, prevMetric?.sov_pct ?? null, " pts"),
    },
    {
      label: "Sentiment",
      value: latestMetric?.avg_sentiment != null ? String(Math.round(latestMetric.avg_sentiment)) : "—",
      delta: fmtDelta(latestMetric?.avg_sentiment ?? null, prevMetric?.avg_sentiment ?? null),
    },
    {
      label: "Position",
      value: latestMetric?.avg_position != null ? `#${latestMetric.avg_position}` : "—",
      delta: fmtDelta(latestMetric?.avg_position ?? null, prevMetric?.avg_position ?? null),
    },
  ];

  const citationsByRawResponse = new Map<string, Citation[]>();
  for (const c of citations) {
    if (!c.raw_response_id) continue;
    const list = citationsByRawResponse.get(c.raw_response_id) ?? [];
    list.push(c);
    citationsByRawResponse.set(c.raw_response_id, list);
  }

  const byDay = new Map<string, number>();
  for (const c of citations) {
    const day = c.fetched_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const chartDays = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  const chartMax = Math.max(1, ...chartDays.map(([, v]) => v));

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

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className="rounded-[var(--radius-xl)] p-4"
            style={{ background: TINTS[i % TINTS.length].bg }}
          >
            <div
              className="font-sans text-[11px] font-medium tracking-[0.01em]"
              style={{ color: TINTS[i % TINTS.length].fg, opacity: 0.75 }}
            >
              {k.label}
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span
                className="font-sans text-[22px] leading-none font-bold tabular-nums"
                style={{ color: TINTS[i % TINTS.length].fg }}
              >
                {k.value}
              </span>
            </div>
            {k.delta?.text && (
              <div className="mt-1.5 font-sans text-[11.5px] font-medium" style={{ color: k.delta.color }}>
                {k.delta.color === "var(--green)" ? "▲" : k.delta.color === "var(--red)" ? "▼" : ""} {k.delta.text}
              </div>
            )}
            {!latestMetric && !k.delta && i >= 2 && (
              <div className="mt-1.5 font-sans text-[11px] opacity-60" style={{ color: TINTS[i % TINTS.length].fg }}>
                needs a fetch
              </div>
            )}
          </div>
        ))}
      </section>

      <section
        className="mt-5 rounded-[var(--radius-xl)] bg-[var(--card)] p-6"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="m-0 font-sans text-[16px] font-bold tracking-[-0.005em]">Citation volume</h2>
          <span className="font-sans text-[12.5px] text-[var(--muted-2)]">citations captured per fetch day</span>
        </div>
        {chartDays.length ? (
          <>
            <div className="flex h-[180px] items-end gap-2">
              {chartDays.map(([day, count], i) => (
                <div key={day} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <div className="font-sans text-[12px] font-medium text-[var(--muted-2)] tabular-nums">{count}</div>
                  <div
                    className="w-full max-w-[52px] rounded-t-[8px]"
                    style={{
                      height: `${Math.max(6, Math.round((count / chartMax) * 140))}px`,
                      background: i === chartDays.length - 1 ? "var(--ember)" : "var(--tint-peach)",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2 border-t border-[var(--rule)] pt-2.5">
              {chartDays.map(([day]) => (
                <div key={day} className="flex-1 text-center font-sans text-[11px] text-[var(--faint)]">
                  {day.slice(5)}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="font-sans text-[14px] text-[var(--muted-2)]">
            No citations yet — click &ldquo;Fetch citations now&rdquo; above to run the first pull.
          </p>
        )}
      </section>

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
