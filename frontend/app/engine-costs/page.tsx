import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

type ChatGptResult = {
  prompt: string;
  ok: boolean;
  error?: string;
  credits_consumed?: number | null;
  usage?: { input_tokens?: number; output_tokens?: number };
  search_calls?: number;
  search_queries_total?: number;
  citation_count?: number;
  logic_classification?: LogicClassification;
};

type GeminiResult = {
  prompt: string;
  ok: boolean;
  error?: string;
  credits_consumed?: number | null;
  usage?: { promptTokenCount?: number; candidatesTokenCount?: number };
  search_queries?: string[];
  grounding_chunk_count?: number;
  logic_classification?: LogicClassification;
};

type LogicClassification = {
  mentioned_brands: string[];
  is_branded_query: boolean;
  intent: string;
  topic: string | null;
};

// Common shape both engines get normalized into for rendering.
type Row = {
  prompt: string;
  ok: boolean;
  error?: string;
  credits?: number | null;
  tokensIn: number;
  tokensOut: number;
  searchCount: number;
  citationCount: number;
  classification?: LogicClassification;
};

// Credit → USD rate confirmed live from kie.ai/pricing (two independent
// model rows both showed a 200:1 ratio, e.g. 50.4 credits = $0.252) — not
// independently confirmed per model category, so treated as "very likely,
// not vendor-guaranteed."
const USD_PER_CREDIT = 0.005;
const CORPUS_SIZE = 8000;

function loadJson<T>(filename: string): T[] {
  const file = path.join(process.cwd(), "data", filename);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T[];
  } catch {
    return [];
  }
}

type BrandStat = { brand: string; mentions: number; visibilityPct: number; avgPosition: number | null };
type BrandFavorability = { sampleSize: number; brands: BrandStat[] };
type FavorabilityData = {
  geminiKie: BrandFavorability;
  chatGptKie: BrandFavorability;
  historicalGeminiDirect: BrandFavorability;
};

function loadFavorability(): FavorabilityData | null {
  const file = path.join(process.cwd(), "data", "brand-favorability.json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as FavorabilityData;
  } catch {
    return null;
  }
}

// groundingChunkIndices-based: was this specific mention of the brand's name
// inside a groundingSupports segment (backed by a real cited source) or
// outside every segment (the model saying it from memory)? Different
// question from BrandFavorability above, which only asks "was the brand
// named at all."
type GroundedBrandStat = {
  brand: string;
  grounded: number;
  ungrounded: number;
  groundedPct: number;
  sources: Record<string, number>;
};
type GroundedExample = { sentence: string; sources: string[] };
type GroundedFavorability = {
  brands: GroundedBrandStat[];
  examples: Record<string, GroundedExample[]>;
  sampleSize: number;
};

function loadGroundedFavorability(): GroundedFavorability | null {
  const file = path.join(process.cwd(), "data", "grounded-favorability.json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as GroundedFavorability;
  } catch {
    return null;
  }
}

function chatGptToRow(r: ChatGptResult): Row {
  return {
    prompt: r.prompt,
    ok: r.ok,
    error: r.error,
    credits: r.credits_consumed,
    tokensIn: r.usage?.input_tokens ?? 0,
    tokensOut: r.usage?.output_tokens ?? 0,
    searchCount: r.search_calls ?? 0,
    citationCount: r.citation_count ?? 0,
    classification: r.logic_classification,
  };
}

function geminiToRow(r: GeminiResult): Row {
  return {
    prompt: r.prompt,
    ok: r.ok,
    error: r.error,
    credits: r.credits_consumed,
    tokensIn: r.usage?.promptTokenCount ?? 0,
    tokensOut: r.usage?.candidatesTokenCount ?? 0,
    searchCount: r.search_queries?.length ?? 0,
    citationCount: r.grounding_chunk_count ?? 0,
    classification: r.logic_classification,
  };
}

function summarize(rows: Row[]) {
  const ok = rows.filter((r) => r.ok && r.credits != null);
  const totalCredits = ok.reduce((s, r) => s + (r.credits ?? 0), 0);
  const avgCredits = ok.length ? totalCredits / ok.length : 0;
  const brandMentions = rows.filter((r) => r.ok && (r.classification?.mentioned_brands.length ?? 0) > 0).length;
  return {
    attempted: rows.length,
    ok: ok.length,
    totalCredits,
    avgCredits,
    avgUsd: avgCredits * USD_PER_CREDIT,
    projectedCreditsFor8000: avgCredits * CORPUS_SIZE,
    projectedUsdFor8000: avgCredits * USD_PER_CREDIT * CORPUS_SIZE,
    tokensIn: ok.reduce((s, r) => s + r.tokensIn, 0),
    tokensOut: ok.reduce((s, r) => s + r.tokensOut, 0),
    searchCount: ok.reduce((s, r) => s + r.searchCount, 0),
    brandMentions,
  };
}

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-[var(--card)] px-4 py-3.5" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="font-sans text-[11px] font-medium text-[var(--muted-2)]" title={hint}>
        {label}
      </div>
      <div className="mt-2 font-sans text-[20px] font-semibold tabular-nums text-[var(--ink)]">{value}</div>
    </div>
  );
}

function ResultsTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: 900 }}>
        <thead>
          <tr className="border-y border-[var(--border)] bg-[var(--muted)]">
            <th className="px-3 py-2 text-left font-sans text-[11px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase">Prompt</th>
            <th className="px-3 py-2 text-right font-sans text-[11px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase">Credits</th>
            <th className="px-3 py-2 text-right font-sans text-[11px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase">Tokens in/out</th>
            <th className="px-3 py-2 text-right font-sans text-[11px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase">Searches</th>
            <th className="px-3 py-2 text-right font-sans text-[11px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase">Citations</th>
            <th className="px-3 py-2 text-left font-sans text-[11px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase">Brand / Intent / Topic</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[var(--border)] align-top last:border-b-0 hover:bg-[var(--muted)]" style={{ opacity: r.ok ? 1 : 0.5 }}>
              <td className="max-w-[320px] px-3 py-3">
                <div className="truncate font-sans text-[13px] font-medium text-[var(--ink)]" title={r.prompt}>
                  {r.prompt}
                </div>
                {!r.ok && (
                  <div className="mt-0.5 truncate font-sans text-[11px]" style={{ color: "var(--red, #dc2626)" }} title={r.error}>
                    {r.error || "failed"}
                  </div>
                )}
              </td>
              <td className="px-3 py-3 text-right font-sans text-[13px] tabular-nums">{r.ok ? r.credits?.toFixed(3) : "—"}</td>
              <td className="px-3 py-3 text-right font-sans text-[12px] tabular-nums text-[var(--muted-2)]">
                {r.ok ? `${r.tokensIn} / ${r.tokensOut}` : "—"}
              </td>
              <td className="px-3 py-3 text-right font-sans text-[12px] tabular-nums text-[var(--muted-2)]">{r.ok ? r.searchCount : "—"}</td>
              <td className="px-3 py-3 text-right font-sans text-[12px] tabular-nums text-[var(--muted-2)]">{r.ok ? r.citationCount : "—"}</td>
              <td className="px-3 py-3 font-sans text-[11.5px] text-[var(--muted-2)]">
                {r.ok && r.classification ? (
                  <div className="flex flex-wrap items-center gap-1">
                    {r.classification.mentioned_brands.length > 0 ? (
                      r.classification.mentioned_brands.map((b) => (
                        <span
                          key={b}
                          className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
                          style={{ background: "var(--tint-peach, #fde8d8)", color: "var(--tint-peach-fg, #9a4a13)" }}
                        >
                          {b}
                        </span>
                      ))
                    ) : (
                      <span className="text-[var(--faint)]">no tracked brand</span>
                    )}
                    <span className="text-[var(--border)]">·</span>
                    <span>{r.classification.intent}</span>
                    {r.classification.topic && (
                      <>
                        <span className="text-[var(--border)]">·</span>
                        <span>{r.classification.topic}</span>
                      </>
                    )}
                  </div>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const BAR_COLORS = ["#e8590c", "#d1541a", "#b8501f", "#9f4b23", "#864726", "#6d4229", "#543e2d", "#3b3930", "#333333", "#2b2b2b", "#242424"];

function BrandLeaderboard({ title, source, data }: { title: string; source: string; data: BrandFavorability }) {
  const top = data.brands[0];
  return (
    <div className="rounded-[var(--radius-lg)] bg-[var(--card)] p-4" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="m-0 font-sans text-[14px] font-semibold text-[var(--ink)]">{title}</h3>
        <span className="font-sans text-[11px] text-[var(--muted-2)]">n={data.sampleSize}</span>
      </div>
      <p className="mt-0.5 font-sans text-[11px] text-[var(--muted-2)]">{source}</p>

      {top && (
        <p className="mt-2 font-sans text-[12.5px]">
          <span className="font-semibold" style={{ color: "var(--accent, #e8590c)" }}>
            {top.brand}
          </span>{" "}
          <span className="text-[var(--muted-2)]">is favored most — named in {top.visibilityPct}% of answers.</span>
        </p>
      )}

      <div className="mt-3 flex flex-col gap-1.5">
        {data.brands.map((b, i) => (
          <div key={b.brand} className="flex items-center gap-2">
            <span className="w-16 flex-none truncate font-sans text-[12px] font-medium text-[var(--ink)]">{b.brand}</span>
            <div className="h-4 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${b.visibilityPct}%`, background: BAR_COLORS[i % BAR_COLORS.length] }}
              />
            </div>
            <span className="w-10 flex-none text-right font-sans text-[11px] tabular-nums text-[var(--muted-2)]">{b.visibilityPct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GroundedFavorabilityCard({ data }: { data: GroundedFavorability }) {
  return (
    <section className="mt-8">
      <h2 className="m-0 font-sans text-[19px] font-semibold">Grounded vs. memory-only favorability</h2>
      <p className="mt-1 max-w-[720px] font-sans text-[13px] text-[var(--muted-2)]">
        A different question from the leaderboards above: not just &ldquo;was the brand named,&rdquo; but{" "}
        <em>was that specific mention backed by a real cited source</em> (its sentence falls inside a real{" "}
        <code>groundingSupports</code> segment) or is the model just saying it from memory (no source covers it)?
        From <code>groundingChunkIndices</code> in your {data.sampleSize} real historical Gemini responses (1 Aug
        2026).
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        {data.brands.map((b) => {
          const total = b.grounded + b.ungrounded;
          const topSources = Object.entries(b.sources)
            .sort((a, z) => z[1] - a[1])
            .slice(0, 4);
          return (
            <div key={b.brand} className="rounded-[var(--radius-lg)] bg-[var(--card)] p-4" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-baseline justify-between">
                <h3 className="m-0 font-sans text-[14px] font-semibold text-[var(--ink)]">{b.brand}</h3>
                <span className="font-sans text-[11px] text-[var(--muted-2)]">{total} mentions</span>
              </div>

              <div className="mt-2.5 h-5 overflow-hidden rounded-full bg-[var(--muted)]">
                <div
                  className="flex h-full items-center rounded-full"
                  style={{ width: `${b.groundedPct}%`, background: "var(--accent, #e8590c)" }}
                />
              </div>
              <div className="mt-1.5 flex justify-between font-sans text-[11.5px] text-[var(--muted-2)]">
                <span>
                  <strong className="text-[var(--ink)]">{b.groundedPct}%</strong> grounded ({b.grounded})
                </span>
                <span>{b.ungrounded} from memory only</span>
              </div>

              {topSources.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {topSources.map(([src, count]) => (
                    <span
                      key={src}
                      className="rounded-full px-1.5 py-0.5 font-sans text-[11px] font-medium text-[var(--muted-2)]"
                      style={{ background: "var(--muted)" }}
                    >
                      {src} ×{count}
                    </span>
                  ))}
                </div>
              )}

              {data.examples[b.brand]?.[0] && (
                <p className="mt-3 border-l-2 border-[var(--border)] pl-2.5 font-sans text-[11.5px] italic text-[var(--muted-2)]">
                  &ldquo;{data.examples[b.brand][0].sentence.slice(0, 140)}
                  {data.examples[b.brand][0].sentence.length > 140 ? "…" : ""}&rdquo; —{" "}
                  {data.examples[b.brand][0].sources.join(", ")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EngineSection({
  title,
  endpointNote,
  rows,
}: {
  title: string;
  endpointNote: string;
  rows: Row[];
}) {
  const s = summarize(rows);
  const failed = rows.filter((r) => !r.ok);
  return (
    <section className="mt-8">
      <h2 className="m-0 font-sans text-[19px] font-semibold">{title}</h2>
      <p className="mt-1 font-sans text-[13px] text-[var(--muted-2)]">{endpointNote}</p>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile label="Prompts run" value={`${s.ok}/${s.attempted}`} hint="Succeeded / attempted" />
        <Tile label="Total credits" value={s.totalCredits.toFixed(2)} />
        <Tile label="Total cost (USD)" value={`$${(s.totalCredits * USD_PER_CREDIT).toFixed(3)}`} />
        <Tile label="Avg credits / prompt" value={s.avgCredits.toFixed(3)} />
        <Tile label="8,000-prompt projection" value={`$${s.projectedUsdFor8000.toFixed(2)}`} hint={`${s.avgCredits.toFixed(3)} credits/prompt × 8,000`} />
        <Tile label="Brand mentioned" value={`${s.brandMentions}/${s.ok}`} />
      </div>

      {failed.length > 0 && (
        <p className="mt-3 rounded-[var(--radius-sm)] px-3 py-2 font-sans text-[12px]" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
          {failed.length} prompt(s) failed and are excluded from the totals above — see the table.
        </p>
      )}

      <div className="mt-4">
        <ResultsTable rows={rows} />
      </div>
    </section>
  );
}

export default function EngineCostsPage() {
  const chatGptRaw = loadJson<ChatGptResult>("kie-cost-test.json");
  const geminiRaw = loadJson<GeminiResult>("kie-gemini-cost-test.json");
  const favorability = loadFavorability();
  const groundedFavorability = loadGroundedFavorability();

  if (chatGptRaw.length === 0 && geminiRaw.length === 0) {
    return (
      <div className="py-8">
        <h1 className="m-0 font-sans text-[28px] font-semibold tracking-[-0.025em]">Engine cost test</h1>
        <p className="mt-1.5 font-sans text-[14px] text-[var(--muted-2)]">No test run recorded yet.</p>
      </div>
    );
  }

  const chatGptRows = chatGptRaw.map(chatGptToRow);
  const geminiRows = geminiRaw.map(geminiToRow);
  const chatGptSummary = summarize(chatGptRows);
  const geminiSummary = summarize(geminiRows);
  const combinedUsdFor8000 = chatGptSummary.projectedUsdFor8000 + geminiSummary.projectedUsdFor8000;

  return (
    <div className="pb-12">
      <section className="py-8">
        <h1 className="m-0 font-sans text-[28px] font-semibold tracking-[-0.025em]">KIE.ai cost test — real prompts, both engines</h1>
        <p className="mt-1.5 font-sans text-[14px] text-[var(--muted-2)]">
          Every number below is from a real API call through kie.ai — not a projection, except the 8,000-prompt
          columns, which scale the real per-prompt average.
        </p>
      </section>

      <section className="rounded-[var(--radius-lg)] px-5 py-4" style={{ background: "var(--ink)", color: "var(--paper)" }}>
        <div className="font-sans text-[11px] font-medium tracking-[0.06em] uppercase opacity-70">
          8,000-prompt corpus, both engines via kie.ai
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div className="font-sans text-[32px] font-semibold tabular-nums">${combinedUsdFor8000.toFixed(2)}</div>
          <div className="font-sans text-[13px] opacity-80">
            ChatGPT (gpt-5.6-luna): ${chatGptSummary.projectedUsdFor8000.toFixed(2)} · Gemini 3.6 Flash: $
            {geminiSummary.projectedUsdFor8000.toFixed(2)}
          </div>
        </div>
        <p className="mt-2 font-sans text-[12px] opacity-70">
          Scaled from real per-prompt averages: {chatGptSummary.avgCredits.toFixed(3)} credits/prompt (ChatGPT, n=
          {chatGptSummary.ok}) and {geminiSummary.avgCredits.toFixed(3)} credits/prompt (Gemini, n={geminiSummary.ok}).
        </p>
      </section>

      {favorability && (
        <section className="mt-8">
          <h2 className="m-0 font-sans text-[19px] font-semibold">Which brand does each engine favor?</h2>
          <p className="mt-1 font-sans text-[13px] text-[var(--muted-2)]">
            Visibility = share of answers naming that brand at all. Three independent real datasets — two engines,
            two time periods — all agree on the same #1.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <BrandLeaderboard
              title="Gemini 3.6 Flash (via kie.ai)"
              source="Fresh real run, 71 grounded answers"
              data={favorability.geminiKie}
            />
            <BrandLeaderboard
              title="ChatGPT (gpt-5.6-luna, via kie.ai)"
              source="Fresh real run, 97 answers"
              data={favorability.chatGptKie}
            />
            <BrandLeaderboard
              title="Gemini 3.6 Flash (direct, historical)"
              source="Your Supabase raw_responses, captured 1 Aug 2026"
              data={favorability.historicalGeminiDirect}
            />
          </div>
        </section>
      )}

      {groundedFavorability && <GroundedFavorabilityCard data={groundedFavorability} />}

      <EngineSection
        title="ChatGPT — gpt-5.6-luna"
        endpointNote="kie.ai /codex/v1/responses, web search tool on"
        rows={chatGptRows}
      />
      <EngineSection
        title="Gemini 3.6 Flash"
        endpointNote="kie.ai /gemini/v1/models/gemini-3-6-flash:streamGenerateContent, stream:true (required — grounding silently drops without it), googleSearch tool on"
        rows={geminiRows}
      />
    </div>
  );
}
