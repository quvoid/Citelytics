import Link from "next/link";
import { PromptComposer } from "@/components/prompt-composer";
import { PromptResearchPanel } from "@/components/prompt-research-panel";
import { PromptsTable, type PromptRow } from "@/components/prompts-table";
import { TopicRollupTable, type TopicRow } from "@/components/topic-rollup-table";
import { getCurrentProjectId } from "@/lib/current-project";
import {
  getAnswerBrandMentions,
  getCitations,
  getPrompts,
  getRawResponses,
  getTrackedUrls,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // "vs. preceding week"

function inWindow(iso: string, start: number, end: number): boolean {
  const t = new Date(iso).getTime();
  return t >= start && t < end;
}

function buildHref(params: { view?: string; compare?: string }): string {
  const qs = new URLSearchParams();
  if (params.view) qs.set("view", params.view);
  if (params.compare) qs.set("compare", params.compare);
  const s = qs.toString();
  return s ? `/prompts?${s}` : "/prompts";
}

export default async function PromptsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; compare?: string }>;
}) {
  const { view, compare: compareParam } = await searchParams;
  const isTopicView = view === "topic";
  const compare = compareParam === "1";

  const [prompts, citations, rawResponses, ownBrand, projectId] = await Promise.all([
    getPrompts("citation"),
    getCitations(),
    getRawResponses(),
    getTrackedUrls({ ownOnly: true }),
    getCurrentProjectId(),
  ]);
  const ownId = ownBrand[0]?.id ?? null;
  const mentions = await getAnswerBrandMentions(rawResponses.map((r) => r.id));

  const now = Date.now();
  const currentStart = now - WINDOW_MS;
  const priorStart = now - WINDOW_MS * 2;

  // --- Per-prompt stats (all-time totals, plus current/prior window deltas) ---
  type PromptStats = {
    citations: number;
    mentions: number;
    real: boolean;
    lastFetched: string | null;
    sentiments: number[];
    positions: number[];
    currentCitations: number;
    priorCitations: number;
    currentMentions: number;
    priorMentions: number;
  };
  const emptyStats = (): PromptStats => ({
    citations: 0,
    mentions: 0,
    real: false,
    lastFetched: null,
    sentiments: [],
    positions: [],
    currentCitations: 0,
    priorCitations: 0,
    currentMentions: 0,
    priorMentions: 0,
  });
  const stats = new Map<string, PromptStats>();
  const statsFor = (promptId: string) => {
    const existing = stats.get(promptId) ?? emptyStats();
    stats.set(promptId, existing);
    return existing;
  };

  for (const c of citations) {
    const s = statsFor(c.prompt_id);
    s.citations += 1;
    if (c.mentions_brand === true) s.mentions += 1;
    if (!c.is_simulated) s.real = true;
    if (!s.lastFetched || c.fetched_at > s.lastFetched) s.lastFetched = c.fetched_at;

    if (inWindow(c.fetched_at, currentStart, now)) {
      s.currentCitations += 1;
      if (c.mentions_brand === true) s.currentMentions += 1;
    } else if (inWindow(c.fetched_at, priorStart, currentStart)) {
      s.priorCitations += 1;
      if (c.mentions_brand === true) s.priorMentions += 1;
    }
  }
  for (const r of rawResponses) {
    const s = statsFor(r.prompt_id);
    if (r.brand_sentiment_score !== null) s.sentiments.push(r.brand_sentiment_score);
    if (r.brand_position !== null) s.positions.push(r.brand_position);
  }

  const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null);

  const rows: PromptRow[] = prompts.map((p) => {
    const s = stats.get(p.id) ?? emptyStats();
    return {
      ...p,
      citations: s.citations,
      mentions: s.mentions,
      real: s.real,
      lastFetched: s.lastFetched,
      avgSentiment: avg(s.sentiments),
      avgPosition: avg(s.positions),
      citeDelta: s.currentCitations - s.priorCitations,
      mentionDelta: s.currentMentions - s.priorMentions,
    };
  });

  // --- Topic rollup: current vs prior window, real Share of Voice per topic ---
  const rawResponseById = new Map(rawResponses.map((r) => [r.id, r]));

  const byTopic = new Map<string, { promptIds: Set<string> }>();
  for (const p of prompts) {
    const topic = p.topic ?? "Uncategorized";
    const g = byTopic.get(topic) ?? { promptIds: new Set<string>() };
    g.promptIds.add(p.id);
    byTopic.set(topic, g);
  }

  const topicRows: TopicRow[] = Array.from(byTopic.entries())
    .map(([topic, g]) => {
      const topicRRIds = new Set(
        rawResponses.filter((r) => g.promptIds.has(r.prompt_id)).map((r) => r.id)
      );
      const currentRR = new Set(
        [...topicRRIds].filter((id) => {
          const r = rawResponseById.get(id);
          return r && inWindow(r.fetched_at, currentStart, now);
        })
      );
      const priorRR = new Set(
        [...topicRRIds].filter((id) => {
          const r = rawResponseById.get(id);
          return r && inWindow(r.fetched_at, priorStart, currentStart);
        })
      );

      const sovFor = (rrIds: Set<string>) => {
        const relevant = mentions.filter((m) => rrIds.has(m.raw_response_id) && m.mentioned);
        const own = ownId ? relevant.filter((m) => m.tracked_url_id === ownId).length : 0;
        const total = relevant.length;
        return { own, sov: total ? Math.round((own / total) * 100) : 0 };
      };

      const current = sovFor(currentRR);
      const prior = sovFor(priorRR);

      return {
        topic,
        mentions: current.own,
        prior: prior.own,
        sov: current.sov,
        sovPrior: prior.sov,
      };
    })
    .sort((a, b) => b.mentions - a.mentions);

  return (
    <div>
      <section className="flex items-end justify-between gap-10 border-b border-[var(--ink)] py-9">
        <div>
          <h1 className="m-0 font-serif text-[40px] font-normal tracking-[-0.02em]">
            Tracked prompts
          </h1>
          <p className="mt-2.5 font-serif text-[16px] text-[var(--muted-2)] italic">
            {rows.length} prompts, {rows.filter((r) => r.active).length} active — queried on each
            &ldquo;Fetch citations&rdquo; run.
          </p>
        </div>
      </section>

      <PromptComposer
        promptType="citation"
        toggleLabel="Add a prompt"
        fieldLabel="New prompt"
        placeholder="e.g. is almond oil good for hair growth"
      />
      <PromptResearchPanel projectId={projectId} />

      <section className="flex items-center justify-between gap-6 pt-4.5">
        <div className="flex gap-1">
          <Link
            href={buildHref({ compare: compareParam })}
            className="border px-3.5 py-1.5 font-sans text-[11px] tracking-[0.06em] uppercase no-underline"
            style={{
              borderColor: !isTopicView ? "var(--ink)" : "var(--rule)",
              background: !isTopicView ? "var(--ink)" : "transparent",
              color: !isTopicView ? "var(--cream)" : "var(--muted-2)",
            }}
          >
            By prompt
          </Link>
          <Link
            href={buildHref({ view: "topic", compare: compareParam })}
            className="border px-3.5 py-1.5 font-sans text-[11px] tracking-[0.06em] uppercase no-underline"
            style={{
              borderColor: isTopicView ? "var(--ink)" : "var(--rule)",
              background: isTopicView ? "var(--ink)" : "transparent",
              color: isTopicView ? "var(--cream)" : "var(--muted-2)",
            }}
          >
            By topic
          </Link>
        </div>
        <Link
          href={buildHref({ view, compare: compare ? undefined : "1" })}
          className="border px-3.5 py-1.5 font-sans text-[11px] tracking-[0.06em] uppercase no-underline"
          style={{
            borderColor: compare ? "var(--ink)" : "var(--rule)",
            background: compare ? "var(--ink)" : "transparent",
            color: compare ? "var(--cream)" : "var(--muted-2)",
          }}
        >
          vs. preceding week{compare ? " ✓" : ""}
        </Link>
      </section>

      {isTopicView ? (
        <TopicRollupTable topics={topicRows} compare={compare} />
      ) : (
        <PromptsTable prompts={rows} compare={compare} />
      )}
    </div>
  );
}
