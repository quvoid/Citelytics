import Link from "next/link";
import { PromptComposer } from "@/components/prompt-composer";
import { PromptResearchPanel } from "@/components/prompt-research-panel";
import { PromptsTable, type PromptRow } from "@/components/prompts-table";
import { TagManager } from "@/components/tag-manager";
import { TopicRollupTable, type TopicRow } from "@/components/topic-rollup-table";
import { getCurrentProjectId } from "@/lib/current-project";
import { COUNTRIES, countryName } from "@/lib/countries";
import {
  getAnswerBrandMentions,
  getCitations,
  getProject,
  getPromptTags,
  getPrompts,
  getRawResponses,
  getTags,
  getTrackedUrls,
} from "@/lib/queries";
import type { Tag } from "@/lib/types";

export const dynamic = "force-dynamic";

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // "vs. preceding week"

function inWindow(iso: string, start: number, end: number): boolean {
  const t = new Date(iso).getTime();
  return t >= start && t < end;
}

function buildHref(params: { view?: string; compare?: string; country?: string; tag?: string }): string {
  const qs = new URLSearchParams();
  if (params.view) qs.set("view", params.view);
  if (params.compare) qs.set("compare", params.compare);
  if (params.country) qs.set("country", params.country);
  if (params.tag) qs.set("tag", params.tag);
  const s = qs.toString();
  return s ? `/prompts?${s}` : "/prompts";
}

export default async function PromptsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; compare?: string; country?: string; tag?: string }>;
}) {
  const { view, compare: compareParam, country: countryParam, tag: tagParam } = await searchParams;
  const isTopicView = view === "topic";
  const isTagView = view === "tag";
  const compare = compareParam === "1";
  const country = COUNTRIES.some((c) => c.code === countryParam) ? countryParam : undefined;

  const projectId = await getCurrentProjectId();
  const [allPrompts, citations, rawResponses, ownBrand, project, tags] = await Promise.all([
    getPrompts("citation", projectId),
    getCitations(),
    getRawResponses(),
    getTrackedUrls({ ownOnly: true }),
    getProject(projectId),
    getTags(projectId),
  ]);
  const defaultCountry = project?.default_country ?? "IN";

  const promptTagRows = await getPromptTags(allPrompts.map((p) => p.id));
  const tagsByPrompt = new Map<string, Tag[]>();
  for (const { prompt_id, tag } of promptTagRows) {
    const list = tagsByPrompt.get(prompt_id) ?? [];
    list.push(tag);
    tagsByPrompt.set(prompt_id, list);
  }

  // Chips are built from the unfiltered set, so selecting a market/tag never
  // removes the other chips and strands the user there.
  const marketsInUse = [...new Set(allPrompts.map((p) => p.country ?? defaultCountry))].sort();
  const tagsInUse = tags.filter((t) => promptTagRows.some((pt) => pt.tag.id === t.id));

  let prompts = country
    ? allPrompts.filter((p) => (p.country ?? defaultCountry) === country)
    : allPrompts;
  if (tagParam) {
    prompts = prompts.filter((p) => tagsByPrompt.get(p.id)?.some((t) => t.id === tagParam));
  }

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
      // What the fetch will actually use. In practice this is always the
      // project's onboarding-chosen default_country now that the per-prompt
      // market control is gone; `p.country` is only ever non-null on rows
      // that predate that change, and is still honoured so their historical
      // answers stay attributed to the market they were actually fetched in.
      resolvedCountry: p.country ?? defaultCountry,
      citations: s.citations,
      mentions: s.mentions,
      real: s.real,
      lastFetched: s.lastFetched,
      avgSentiment: avg(s.sentiments),
      avgPosition: avg(s.positions),
      citeDelta: s.currentCitations - s.priorCitations,
      mentionDelta: s.currentMentions - s.priorMentions,
      tags: tagsByPrompt.get(p.id) ?? [],
    };
  });

  // --- Rollup: current vs prior window, real Share of Voice per GROUP ---
  // Shared between the topic view (AI-decided, one topic per prompt) and
  // the tag view (user-decided, a prompt can carry several) — same window
  // math and Share-of-Voice formula either way, only how prompts get
  // bucketed into groups differs.
  const rawResponseById = new Map(rawResponses.map((r) => [r.id, r]));

  function rollupByGroup(byGroup: Map<string, { promptIds: Set<string> }>): TopicRow[] {
    return Array.from(byGroup.entries())
      .map(([groupLabel, g]) => {
        const groupRRIds = new Set(
          rawResponses.filter((r) => g.promptIds.has(r.prompt_id)).map((r) => r.id)
        );
        const currentRR = new Set(
          [...groupRRIds].filter((id) => {
            const r = rawResponseById.get(id);
            return r && inWindow(r.fetched_at, currentStart, now);
          })
        );
        const priorRR = new Set(
          [...groupRRIds].filter((id) => {
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
          topic: groupLabel,
          mentions: current.own,
          prior: prior.own,
          sov: current.sov,
          sovPrior: prior.sov,
        };
      })
      .sort((a, b) => b.mentions - a.mentions);
  }

  const byTopic = new Map<string, { promptIds: Set<string> }>();
  for (const p of prompts) {
    const topic = p.topic ?? "Uncategorized";
    const g = byTopic.get(topic) ?? { promptIds: new Set<string>() };
    g.promptIds.add(p.id);
    byTopic.set(topic, g);
  }
  const topicRows = rollupByGroup(byTopic);

  // A prompt can carry several tags, so it contributes to EVERY tag group it
  // belongs to — not just one, unlike topic's single-value grouping above.
  const byTag = new Map<string, { promptIds: Set<string> }>();
  for (const p of prompts) {
    const promptTags = tagsByPrompt.get(p.id) ?? [];
    if (!promptTags.length) {
      const g = byTag.get("Untagged") ?? { promptIds: new Set<string>() };
      g.promptIds.add(p.id);
      byTag.set("Untagged", g);
      continue;
    }
    for (const t of promptTags) {
      const g = byTag.get(t.name) ?? { promptIds: new Set<string>() };
      g.promptIds.add(p.id);
      byTag.set(t.name, g);
    }
  }
  const tagRows = rollupByGroup(byTag);

  return (
    <div>
      <section className="border-b border-[var(--border)] py-6">
        <h1 className="m-0 font-sans text-[26px] font-semibold tracking-[-0.02em]">
          Tracked prompts
        </h1>
        <p className="mt-1.5 font-sans text-[13.5px] text-[var(--muted-2)]">
          {rows.length} prompts, {rows.filter((r) => r.active).length} active — queried on each
          &ldquo;Fetch citations&rdquo; run
          {country ? ` in ${countryName(country)}` : ""}.
        </p>
      </section>

      <PromptComposer
        promptType="citation"
        toggleLabel="Add a prompt"
        fieldLabel="New prompt"
        placeholder="e.g. is almond oil good for hair growth"
        defaultCountry={defaultCountry}
      />
      <PromptResearchPanel projectId={projectId} defaultCountry={defaultCountry} />
      <TagManager tags={tags} />

      <section className="flex flex-wrap items-center gap-1.5 pt-4">
        <span className="mr-1.5 font-sans text-[10px] font-medium tracking-[0.08em] text-[var(--faint)] uppercase">
          Market
        </span>
        <Link
          href={buildHref({ view, compare: compareParam, tag: tagParam })}
          className="rounded-full border px-3 py-1.5 font-sans text-[12px] font-medium tracking-[0.01em] no-underline"
          style={{
            borderColor: !country ? "var(--ink)" : "var(--border)",
            background: !country ? "var(--ink)" : "transparent",
            color: !country ? "var(--paper)" : "var(--muted-2)",
          }}
        >
          All
        </Link>
        {/* Only markets actually in use — the full 40-country list as chips
            would bury the two or three a project really tracks. */}
        {marketsInUse.map((code) => (
          <Link
            key={code}
            href={buildHref({ view, compare: compareParam, country: code, tag: tagParam })}
            className="rounded-full border px-3 py-1.5 font-sans text-[12px] font-medium tracking-[0.01em] no-underline"
            style={{
              borderColor: country === code ? "var(--ink)" : "var(--border)",
              background: country === code ? "var(--ink)" : "transparent",
              color: country === code ? "var(--paper)" : "var(--muted-2)",
            }}
          >
            {countryName(code)}
          </Link>
        ))}
      </section>

      {tagsInUse.length > 0 && (
        <section className="flex flex-wrap items-center gap-1.5 pt-2.5">
          <span className="mr-1.5 font-sans text-[10px] font-medium tracking-[0.08em] text-[var(--faint)] uppercase">
            Tag
          </span>
          <Link
            href={buildHref({ view, compare: compareParam, country })}
            className="rounded-full border px-3 py-1.5 font-sans text-[12px] font-medium tracking-[0.01em] no-underline"
            style={{
              borderColor: !tagParam ? "var(--ink)" : "var(--border)",
              background: !tagParam ? "var(--ink)" : "transparent",
              color: !tagParam ? "var(--paper)" : "var(--muted-2)",
            }}
          >
            All
          </Link>
          {tagsInUse.map((t) => (
            <Link
              key={t.id}
              href={buildHref({ view, compare: compareParam, country, tag: t.id })}
              className="rounded-full border px-3 py-1.5 font-sans text-[12px] font-medium tracking-[0.01em] no-underline"
              style={{
                borderColor: tagParam === t.id ? "var(--ink)" : "var(--border)",
                background: tagParam === t.id ? "var(--ink)" : "transparent",
                color: tagParam === t.id ? "var(--paper)" : "var(--muted-2)",
              }}
            >
              {t.name}
            </Link>
          ))}
        </section>
      )}

      <section className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pt-4 pb-4">
        <div className="flex flex-wrap gap-1">
          <Link
            href={buildHref({ compare: compareParam, country, tag: tagParam })}
            className="rounded-full border px-3.5 py-1.5 font-sans text-[12px] font-medium tracking-[0.01em] no-underline"
            style={{
              borderColor: !isTopicView && !isTagView ? "var(--ink)" : "var(--border)",
              background: !isTopicView && !isTagView ? "var(--ink)" : "transparent",
              color: !isTopicView && !isTagView ? "var(--paper)" : "var(--muted-2)",
            }}
          >
            By prompt
          </Link>
          <Link
            href={buildHref({ view: "topic", compare: compareParam, country, tag: tagParam })}
            className="rounded-full border px-3.5 py-1.5 font-sans text-[12px] font-medium tracking-[0.01em] no-underline"
            style={{
              borderColor: isTopicView ? "var(--ink)" : "var(--border)",
              background: isTopicView ? "var(--ink)" : "transparent",
              color: isTopicView ? "var(--paper)" : "var(--muted-2)",
            }}
          >
            By topic
          </Link>
          <Link
            href={buildHref({ view: "tag", compare: compareParam, country, tag: tagParam })}
            className="rounded-full border px-3.5 py-1.5 font-sans text-[12px] font-medium tracking-[0.01em] no-underline"
            style={{
              borderColor: isTagView ? "var(--ink)" : "var(--border)",
              background: isTagView ? "var(--ink)" : "transparent",
              color: isTagView ? "var(--paper)" : "var(--muted-2)",
            }}
          >
            By tag
          </Link>
        </div>
        <Link
          href={buildHref({ view, compare: compare ? undefined : "1", country, tag: tagParam })}
          className="rounded-full border px-3.5 py-1.5 font-sans text-[12px] font-medium tracking-[0.01em] no-underline"
          style={{
            borderColor: compare ? "var(--ink)" : "var(--border)",
            background: compare ? "var(--ink)" : "transparent",
            color: compare ? "var(--paper)" : "var(--muted-2)",
          }}
        >
          vs. preceding week{compare ? " ✓" : ""}
        </Link>
      </section>

      {isTopicView ? (
        <TopicRollupTable topics={topicRows} compare={compare} />
      ) : isTagView ? (
        <TopicRollupTable topics={tagRows} compare={compare} />
      ) : (
        <PromptsTable prompts={rows} allTags={tags} compare={compare} />
      )}
    </div>
  );
}
