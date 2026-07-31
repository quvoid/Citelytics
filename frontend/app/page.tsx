import Link from "next/link";
import { createAnonServerClient } from "@/lib/supabase/server";
import { DEMO_PROJECT_ID } from "@/lib/constants";
import { EngineLabel } from "@/components/engine-icons";
import type { Citation, DailyMetric, Engine, Prompt } from "@/lib/types";

export const dynamic = "force-dynamic";

type RawResponseRow = {
  id: string;
  prompt_id: string;
  engine_id: string;
  answer_text: string | null;
  brand_mentioned_in_answer: boolean;
  fetched_at: string;
};

async function getOverviewData() {
  const sb = createAnonServerClient();

  const { data: prompts } = await sb
    .from("prompts")
    .select("id, project_id, query_text, active")
    .eq("project_id", DEMO_PROJECT_ID)
    .returns<Prompt[]>();

  const { data: engines } = await sb.from("engines").select("id, name").returns<Engine[]>();

  const promptIds = (prompts ?? []).map((p) => p.id);
  const { data: citations } = promptIds.length
    ? await sb
        .from("citations")
        .select(
          "id, prompt_id, engine_id, url, domain, is_simulated, raw_response_id, mentions_brand, fetched_at"
        )
        .in("prompt_id", promptIds)
        .order("fetched_at", { ascending: true })
        .returns<Citation[]>()
    : { data: [] as Citation[] };

  const { data: rawResponses } = promptIds.length
    ? await sb
        .from("raw_responses")
        .select("id, prompt_id, engine_id, answer_text, brand_mentioned_in_answer, fetched_at")
        .in("prompt_id", promptIds)
        .order("fetched_at", { ascending: false })
        .returns<RawResponseRow[]>()
    : { data: [] as RawResponseRow[] };

  const { data: dailyMetrics } = await sb
    .from("daily_metrics")
    .select("id, project_id, date, visibility_pct, sov_pct, avg_sentiment, avg_position")
    .eq("project_id", DEMO_PROJECT_ID)
    .order("date", { ascending: false })
    .limit(8)
    .returns<DailyMetric[]>();

  return {
    prompts: prompts ?? [],
    engines: engines ?? [],
    citations: citations ?? [],
    rawResponses: rawResponses ?? [],
    dailyMetrics: dailyMetrics ?? [],
  };
}

function Dot({ real }: { real: boolean }) {
  return real ? (
    <span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--green)]" />
  ) : (
    <span className="inline-block h-[6px] w-[6px] rounded-full border border-[var(--faint)]" />
  );
}

function MentionMark({ yes, label }: { yes: boolean; label: string }) {
  return (
    <span
      className="flex items-center gap-1.5 text-[11px] tracking-[0.1em] whitespace-nowrap uppercase"
      style={{ color: yes ? "var(--green)" : "var(--faint)" }}
    >
      <span
        className="inline-block h-[9px] w-[9px]"
        style={{
          background: yes ? "var(--green)" : "transparent",
          border: `1px solid ${yes ? "var(--green)" : "var(--faint)"}`,
        }}
      />
      {label}
    </span>
  );
}

function fmtDelta(latest: number | null, prev: number | null, suffix = ""): { text: string; color: string } {
  if (latest === null || prev === null) return { text: "", color: "var(--faint)" };
  const diff = Math.round((latest - prev) * 10) / 10;
  if (diff === 0) return { text: "±0", color: "var(--faint)" };
  return {
    text: `${diff > 0 ? "+" : ""}${diff}${suffix}`,
    color: diff > 0 ? "var(--green)" : "var(--rust)",
  };
}

export default async function OverviewPage() {
  const { prompts, engines, citations, rawResponses, dailyMetrics } = await getOverviewData();
  const promptById = new Map(prompts.map((p) => [p.id, p.query_text]));
  const engineById = new Map(engines.map((e) => [e.id, e.name]));

  const [latestMetric, prevMetric] = dailyMetrics;
  const kpis = [
    {
      label: "Visibility",
      value: latestMetric?.visibility_pct !== null && latestMetric?.visibility_pct !== undefined ? `${latestMetric.visibility_pct}%` : "—",
      delta: fmtDelta(latestMetric?.visibility_pct ?? null, prevMetric?.visibility_pct ?? null, " pts"),
    },
    {
      label: "Sentiment",
      value: latestMetric?.avg_sentiment !== null && latestMetric?.avg_sentiment !== undefined ? Math.round(latestMetric.avg_sentiment) : "—",
      delta: fmtDelta(latestMetric?.avg_sentiment ?? null, prevMetric?.avg_sentiment ?? null),
    },
    {
      label: "Position",
      value: latestMetric?.avg_position !== null && latestMetric?.avg_position !== undefined ? `#${latestMetric.avg_position}` : "—",
      delta: fmtDelta(latestMetric?.avg_position ?? null, prevMetric?.avg_position ?? null),
    },
    {
      label: "Share of voice",
      value: latestMetric?.sov_pct !== null && latestMetric?.sov_pct !== undefined ? `${latestMetric.sov_pct}%` : "—",
      delta: fmtDelta(latestMetric?.sov_pct ?? null, prevMetric?.sov_pct ?? null, " pts"),
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

  const domainCounts = new Map<string, number>();
  const domainOwned = new Set<string>();
  for (const c of citations) {
    domainCounts.set(c.domain, (domainCounts.get(c.domain) ?? 0) + 1);
    if (c.mentions_brand) domainOwned.add(c.domain);
  }
  const topDomains = Array.from(domainCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 7);
  const domainMax = topDomains.length ? topDomains[0][1] : 1;

  const totalCitations = citations.length;
  const citationsMentioningBrand = citations.filter((c) => c.mentions_brand === true).length;
  const totalAnswers = rawResponses.length;
  const answersMentioningBrand = rawResponses.filter((r) => r.brand_mentioned_in_answer).length;
  const answerMentionPct = totalAnswers ? Math.round((answersMentioningBrand / totalAnswers) * 100) : 0;

  const recentAnswers = rawResponses.slice(0, 6);

  return (
    <div>
      <section className="grid grid-cols-1 gap-14 border-b border-[var(--rule)] py-12 md:grid-cols-[1.35fr_1fr] md:items-end">
        <div>
          <div className="mb-5 text-[11px] tracking-[0.14em] text-[var(--rust)] uppercase">
            Demo project · all engines
          </div>
          <h1 className="m-0 font-serif text-[42px] leading-[1.1] font-normal tracking-[-0.02em] text-balance md:text-[52px]">
            <span className="font-medium">
              {citationsMentioningBrand} of {totalCitations}
            </span>{" "}
            cited pages mention <span className="italic">Bajaj</span> — the brand is named in{" "}
            <span className="font-medium">{answerMentionPct}%</span> of answers.
          </h1>
          <p className="mt-6 max-w-[62ch] font-serif text-[17px] leading-[1.55] text-[var(--muted-2)]">
            Answer engines cite plenty of generic hair-oil coverage, but most of it never names
            Bajaj — pages that do are mostly retail listings, not editorial recommendations.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-px border border-[var(--rule)] bg-[var(--rule)]">
          {[
            { label: "Cited pages", value: totalCitations },
            { label: "Pages naming you", value: citationsMentioningBrand },
            { label: "Answers naming you", value: `${answerMentionPct}%` },
            { label: "Unique domains", value: domainCounts.size },
          ].map((s) => (
            <div key={s.label} className="bg-[var(--paper)] px-5 py-4.5">
              <div className="text-[10px] tracking-[0.11em] text-[var(--muted-2)] uppercase">
                {s.label}
              </div>
              <div className="mt-2.5 font-serif text-[36px] leading-[1.1] font-normal tracking-[-0.02em]">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-px border-b border-[var(--rule)] bg-[var(--rule)] py-px md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-[var(--cream)] px-5 py-5">
            <div className="text-[10px] tracking-[0.11em] text-[var(--muted-2)] uppercase">
              {k.label}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-serif text-[26px] leading-none">{k.value}</span>
              {k.delta.text && (
                <span className="font-serif text-[13px] italic" style={{ color: k.delta.color }}>
                  {k.delta.text}
                </span>
              )}
            </div>
            {!latestMetric && (
              <div className="mt-1 text-[11px] text-[var(--faint)]">
                needs at least one fetch today
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="border-b border-[var(--rule)] py-11">
        <h2 className="m-0 mb-8 font-serif text-[24px] font-normal tracking-[-0.01em]">
          Citation volume{" "}
          <span className="font-serif text-[17px] text-[var(--muted-2)] italic">
            citations captured per fetch day
          </span>
        </h2>
        {chartDays.length ? (
          <>
            <div className="flex h-[190px] items-end gap-0 border-b border-[var(--ink)]">
              {chartDays.map(([day, count], i) => (
                <div
                  key={day}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-2 px-1.5"
                >
                  <div className="font-serif text-[14px] text-[var(--muted-2)]">{count}</div>
                  <div
                    className="w-full max-w-[64px]"
                    style={{
                      height: `${Math.max(6, Math.round((count / chartMax) * 150))}px`,
                      background: i === chartDays.length - 1 ? "var(--rust)" : "#DCD3C2",
                      borderTop: `2px solid ${i === chartDays.length - 1 ? "var(--rust-dark)" : "#C4B9A4"}`,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex">
              {chartDays.map(([day]) => (
                <div
                  key={day}
                  className="flex-1 px-1 pt-2 text-center text-[11px] tracking-[0.03em] text-[var(--muted-2)]"
                >
                  {day.slice(5)}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="font-serif text-[15px] text-[var(--muted-2)] italic">
            No citations yet — click &ldquo;Fetch citations now&rdquo; above to run the first pull.
          </p>
        )}
      </section>

      <section className="grid grid-cols-1 items-start gap-17 py-11 md:grid-cols-[1fr_1.5fr]">
        <div>
          <h2 className="m-0 mb-1.5 font-serif text-[24px] font-normal tracking-[-0.01em]">
            Where answers come from
          </h2>
          <p className="m-0 mb-5 font-serif text-[14px] text-[var(--muted-2)] italic">
            {totalCitations} cited pages across {domainCounts.size} domains
          </p>
          {topDomains.map(([domain, count], i) => (
            <Link
              key={domain}
              href="/sources"
              className="block border-t border-[var(--rule)] py-3 no-underline hover:bg-[var(--paper)]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span className="w-[18px] font-serif text-[13px] text-[var(--faint)] italic">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[13px] tracking-[-0.005em] text-[var(--ink)]">
                    {domain}
                  </span>
                  {domainOwned.has(domain) && (
                    <span className="border border-[#B9CDBF] px-1.5 py-0.5 text-[9px] tracking-[0.1em] text-[var(--green)] uppercase">
                      names you
                    </span>
                  )}
                </div>
                <span className="font-serif text-[17px]">{count}</span>
              </div>
              <div className="mt-2 h-[3px] bg-[var(--rule-light)]">
                <div
                  className="h-[3px]"
                  style={{
                    width: `${Math.round((count / domainMax) * 100)}%`,
                    background: domainOwned.has(domain) ? "var(--green)" : "#B7AC98",
                  }}
                />
              </div>
            </Link>
          ))}
          {!topDomains.length && (
            <p className="border-t border-[var(--rule)] py-4 font-serif text-[14px] text-[var(--muted-2)] italic">
              No data yet.
            </p>
          )}
        </div>

        <div>
          <h2 className="m-0 mb-1.5 font-serif text-[24px] font-normal tracking-[-0.01em]">
            Recent answers
          </h2>
          <p className="m-0 mb-5 font-serif text-[14px] text-[var(--muted-2)] italic">
            newest fetch first
          </p>
          {recentAnswers.map((r) => {
            const cited = citationsByRawResponse.get(r.id) ?? [];
            const real = cited.length ? cited.some((c) => !c.is_simulated) : true;
            const mentionCount = cited.filter((c) => c.mentions_brand === true).length;
            return (
              <article key={r.id} className="border-t border-[var(--rule)] py-5.5">
                <div className="flex items-baseline justify-between gap-6">
                  <div className="flex items-baseline gap-2.5 text-[11px] tracking-[0.05em] text-[var(--muted-2)] uppercase">
                    <span className="text-[var(--ink)]">
                      <EngineLabel name={engineById.get(r.engine_id)} size={13} />
                    </span>
                    <span>{new Date(r.fetched_at).toLocaleString()}</span>
                    <span className="flex items-center gap-1.5 font-serif text-[13px] tracking-[0.02em] text-[var(--muted-2)] italic normal-case">
                      <Dot real={real} />
                      {real ? "real fetch" : "simulated"}
                    </span>
                  </div>
                  <MentionMark
                    yes={r.brand_mentioned_in_answer}
                    label={r.brand_mentioned_in_answer ? "Bajaj in answer" : "not in answer"}
                  />
                </div>
                <Link
                  href={`/prompts/${r.prompt_id}`}
                  className="mt-3 block font-serif text-[19px] leading-[1.3] tracking-[-0.01em] text-[var(--ink)] no-underline hover:text-[var(--rust)]"
                >
                  &ldquo;{promptById.get(r.prompt_id) ?? "—"}&rdquo;
                </Link>
                {r.answer_text && (
                  <p className="mt-2.5 max-w-[68ch] border-l-2 border-[var(--rule-light)] pl-4 font-serif text-[15px] leading-[1.6] text-[var(--muted-2)] text-pretty">
                    {r.answer_text.slice(0, 220)}
                    {r.answer_text.length > 220 ? "…" : ""}
                  </p>
                )}
                <div className="mt-3 flex gap-4 text-[12px] text-[var(--muted-2)]">
                  <span>{cited.length} pages cited</span>
                  <span>{mentionCount} mention Bajaj</span>
                </div>
              </article>
            );
          })}
          {!recentAnswers.length && (
            <p className="border-t border-[var(--rule)] py-4 font-serif text-[14px] text-[var(--muted-2)] italic">
              No fetches yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
