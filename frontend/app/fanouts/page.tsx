import { BarList } from "@/components/bar-list";
import { ChartCard } from "@/components/chart-card";
import { DistributionBars } from "@/components/distribution-bars";
import { FilterBar, type FilterState } from "@/components/filter-bar";
import { SearchIntentPanel } from "@/components/search-intent-panel";
import { getCurrentProjectId } from "@/lib/current-project";
import {
  getAnswerBrandMentions,
  getCitations,
  getEngines,
  getPrompts,
  getQueryFanouts,
  getRawResponses,
  getTrackedUrls,
} from "@/lib/queries";
import { applySystemFilter, getFilterOptions, parseMetricsFilter, resolveFilterScope } from "@/lib/metrics";
import {
  brandTerms,
  searchDepth,
  searchedVsNamed,
  shareOfSearch,
  targetedPublications,
} from "@/lib/fanout-analysis";

export const dynamic = "force-dynamic";

const STOPWORDS = new Set([
  "the", "a", "an", "of", "for", "and", "or", "in", "on", "to", "is", "are", "with",
  "best", "top", "how", "what", "does", "do", "you", "your", "which", "vs", "india",
]);

function bigrams(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
  const out: string[] = [];
  for (let i = 0; i < words.length - 1; i++) out.push(`${words[i]} ${words[i + 1]}`);
  return out;
}

export default async function FanoutsPage({
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

  const [prompts, rawResponses, engines, brands, citations] = await Promise.all([
    getPrompts(),
    getRawResponses(undefined, {
      promptIds: scope.promptIds,
      fromDate: scope.resolvedRange.from,
      toDate: scope.resolvedRange.to,
    }),
    getEngines(),
    getTrackedUrls(),
    getCitations({
      promptIds: scope.promptIds,
      fromDate: scope.resolvedRange.from,
      toDate: scope.resolvedRange.to,
    }),
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

  const promptById = new Map(prompts.map((p) => [p.id, p]));
  const promptIdByRawResponse = new Map(rawResponses.map((r) => [r.id, r.prompt_id]));
  // Fanout rows were never actually filtered by engine — this map is what
  // lets the page finally SHOW that, rather than the header just asserting
  // "Gemini-only" while silently carrying both engines' data underneath.
  const engineIdByRawResponse = new Map(rawResponses.map((r) => [r.id, r.engine_id]));
  const engineNameById = new Map(engines.map((e) => [e.id, e.name]));
  const engineLabel = (name: string | undefined) =>
    name === "openrouter" ? "ChatGPT" : name === "gemini" ? "Gemini" : name || "Unknown";

  const fanouts = await getQueryFanouts(rawResponses.map((r) => r.id));

  const distinctQueries = new Set(fanouts.map((f) => f.query_text.toLowerCase()));
  const totalOccurrences = fanouts.length;

  const byEngineTotals = new Map<string, number>();
  for (const f of fanouts) {
    const engineId = engineIdByRawResponse.get(f.raw_response_id);
    const label = engineLabel(engineNameById.get(engineId ?? ""));
    byEngineTotals.set(label, (byEngineTotals.get(label) ?? 0) + 1);
  }

  // Position is the order Gemini itself issued each sub-query in for that
  // response — its first sub-query is usually the primary read of intent,
  // later ones are refinements/follow-ups. Tracked per query text so a
  // recurring query's typical spot in the sequence shows up, not just how
  // often it fires.
  const byTopic = new Map<
    string,
    Map<string, { count: number; positions: number[]; engines: Set<string> }>
  >();
  for (const f of fanouts) {
    const promptId = promptIdByRawResponse.get(f.raw_response_id);
    const topic = (promptId && promptById.get(promptId)?.topic) || "Uncategorized";
    const topicMap =
      byTopic.get(topic) ??
      new Map<string, { count: number; positions: number[]; engines: Set<string> }>();
    const key = f.query_text.toLowerCase();
    const entry = topicMap.get(key) ?? { count: 0, positions: [], engines: new Set<string>() };
    entry.count += 1;
    // typeof-guard rather than `!== null`: the "position" column isn't in the
    // live DB yet (see the note in getQueryFanouts), so rows may come back
    // with it simply absent (undefined), not explicitly null.
    if (typeof f.position === "number") entry.positions.push(f.position);
    entry.engines.add(engineLabel(engineNameById.get(engineIdByRawResponse.get(f.raw_response_id) ?? "")));
    topicMap.set(key, entry);
    byTopic.set(topic, topicMap);
  }
  const topicGroups = Array.from(byTopic.entries())
    .map(([topic, queries]) => ({
      topic,
      total: Array.from(queries.values()).reduce((a, c) => a + c.count, 0),
      queries: Array.from(queries.entries())
        .map(([query_text, { count, positions, engines: engineSet }]) => ({
          query_text,
          count,
          avgPosition: positions.length
            ? positions.reduce((a, b) => a + b, 0) / positions.length
            : null,
          engines: Array.from(engineSet).sort(),
        }))
        .sort((a, b) => b.count - a.count)
        // 15 was fine while every topic bucket was small, but "Uncategorized"
        // (prompts with no topic label yet) can run much larger than any real
        // topic — and since ties all sort by insertion order, a tight cap on
        // a big bucket silently hid one engine's rows behind the other's
        // rather than actually showing both. 40 keeps real topics untouched
        // (none come close) while giving Uncategorized room to show its mix.
        .slice(0, 40),
    }))
    .sort((a, b) => b.total - a.total);

  const phraseCounts = new Map<string, number>();
  for (const f of fanouts) {
    for (const bg of bigrams(f.query_text)) {
      phraseCounts.set(bg, (phraseCounts.get(bg) ?? 0) + 1);
    }
  }
  const topPhrases = Array.from(phraseCounts.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // --- What the engine's own searches reveal (lib/fanout-analysis.ts) ------
  const terms = brandTerms(brands);
  const own = terms.find((t) => t.isOwn) ?? null;
  const sos = shareOfSearch(fanouts, terms);

  const queriesByResponse = new Map<string, string[]>();
  for (const f of fanouts) {
    const list = queriesByResponse.get(f.raw_response_id) ?? [];
    list.push(f.query_text);
    queriesByResponse.set(f.raw_response_id, list);
  }

  // Only answers that have BOTH a fanout record and a mention row can enter
  // the comparison — an answer missing either tells us nothing about it.
  const ownMentions = own
    ? await getAnswerBrandMentions(rawResponses.map((r) => r.id))
    : [];
  const ownBrandId = brands.find((b) => !b.is_competitor)?.id;
  const namedByResponse = new Map(
    ownMentions.filter((m) => m.tracked_url_id === ownBrandId).map((m) => [m.raw_response_id, m.mentioned]),
  );
  const comparison = own
    ? searchedVsNamed(
        [...queriesByResponse.entries()]
          .filter(([rid]) => namedByResponse.has(rid))
          .map(([rid, queries]) => ({ queries, named: Boolean(namedByResponse.get(rid)) })),
        own,
      )
    : null;

  const ownDomains = new Set(brands.filter((b) => !b.is_competitor).map((b) => b.url));
  const domainsCitingYou = new Set(
    citations.filter((c) => c.mentions_brand === true || ownDomains.has(c.domain)).map((c) => c.domain),
  );
  const targeted = targetedPublications(fanouts, domainsCitingYou);

  const depth = searchDepth(queriesByResponse, (rid) => {
    const pid = promptIdByRawResponse.get(rid);
    return pid ? promptById.get(pid) : undefined;
  });

  const ownBrandName = brands.find((b) => !b.is_competitor)?.name ?? "your brand";

  return (
    <div>
      <section className="border-b border-[var(--ink)] py-11">
        <h1 className="m-0 font-serif text-[40px] font-normal tracking-[-0.02em]">
          Query fanouts
        </h1>
        <p className="mt-2.5 max-w-[59ch] font-serif text-[16px] text-[var(--muted-2)] italic">
          The background sub-searches each engine actually ran before answering your tracked
          prompts. Gemini exposes these through its grounding tool; ChatGPT only exposes them when
          its real web-search API is used — the plain chat path doesn&apos;t carry them.
        </p>
      </section>

      <FilterBar
        basePath="/fanouts"
        state={state}
        options={filterOptions}
        resolvedRange={scope.resolvedRange}
        previousRange={null}
      />

      {/* The headline is the finding, not a row of counts. Volume lives in
          the one-line summary below it; the comparison is what this page
          knows that no other page does. */}
      <section className="mt-6">
        <ChartCard
          title={`Is the engine looking for ${ownBrandName}?`}
          subtitle="Whether your brand appears in the engine's own sub-searches — and whether that coincides with being named in the answer"
        >
          <SearchIntentPanel
            ownName={ownBrandName}
            comparison={comparison}
            share={sos.rows}
            totalSearches={sos.totalSearches}
            brandedSearches={sos.brandedSearches}
          />
        </ChartCard>
      </section>

      <p className="mt-4 mb-0 font-sans text-[12.5px] text-[var(--muted-2)] tabular-nums">
        {totalOccurrences} sub-searches · {distinctQueries.size} distinct ·{" "}
        {Array.from(byEngineTotals.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([label, count]) => `${count} from ${label}`)
          .join(" · ")}
      </p>

      <section className="mt-5">
        <ChartCard
          title="Publications the engine queries by name"
          subtitle="Sub-searches using a site: operator — where the engine goes looking, which is a targeting list rather than a results list"
        >
          {targeted.length ? (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {targeted.slice(0, 12).map((t) => (
                <li key={t.domain} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate font-sans text-[13px] text-[var(--ink)]">
                    {t.domain}
                  </span>
                  {t.citesYou ? (
                    <span
                      className="flex-none rounded-full px-2 py-0.5 font-sans text-[11px] font-semibold tracking-[0.04em] uppercase"
                      style={{ background: "var(--tint-mint)", color: "var(--tint-mint-fg)" }}
                      title="This domain also appears in your citations naming you"
                    >
                      cites you
                    </span>
                  ) : (
                    <span
                      className="flex-none rounded-full px-2 py-0.5 font-sans text-[11px] font-semibold tracking-[0.04em] uppercase"
                      style={{ background: "var(--tint-stone)", color: "var(--tint-stone-fg)" }}
                      title="The engine queries this publication but it has never cited you — a targeting gap"
                    >
                      gap
                    </span>
                  )}
                  <span className="w-[62px] flex-none text-right font-sans text-[12px] text-[var(--muted-2)] tabular-nums">
                    {t.searches}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 font-sans text-[13px] text-[var(--muted-2)]">
              No sub-search used a site: operator in this period.
            </p>
          )}
        </ChartCard>
      </section>

      <section className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        <ChartCard
          title="How hard the engine worked"
          subtitle={`Sub-searches per answer${depth.median !== null ? ` — median ${depth.median}` : ""}. A long search is the engine struggling, which makes that prompt a content opportunity.`}
        >
          <DistributionBars
            buckets={depth.buckets}
            emptyLabel="No fanouts recorded yet."
          />
          {depth.deepest.length > 0 && (
            <ul className="mt-4 flex list-none flex-col gap-1.5 border-t border-[var(--rule-light)] p-0 pt-3">
              {depth.deepest.slice(0, 5).map((d) => (
                <li key={d.promptId} className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-[var(--ink)]">
                    {d.queryText}
                  </span>
                  <span className="flex-none font-sans text-[11.5px] text-[var(--muted-2)] tabular-nums">
                    {d.searches} searches
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>

        <ChartCard
          title="Fanout volume by topic"
          subtitle="Which topics make the engines search hardest before answering"
        >
          <BarList
            items={topicGroups.map((g) => ({
              label: g.topic,
              value: g.total,
              sublabel: `${g.queries.length} distinct queries`,
            }))}
            unit="searches"
            emptyLabel="No fanouts recorded yet."
          />
        </ChartCard>

        <ChartCard
          title="Recurring phrases"
          subtitle="Two-word phrases Gemini reuses across its sub-searches"
        >
          <BarList
            items={topPhrases.map(([phrase, count]) => ({ label: phrase, value: count }))}
            unit="uses"
            emptyLabel="No phrase repeats across fanouts yet."
          />
        </ChartCard>
      </section>

      <section className="py-11">
        <div>
          <h2 className="m-0 mb-1.5 font-serif text-[24px] font-normal tracking-[-0.01em]">
            All queries
          </h2>
          <p className="m-0 mb-6 font-serif text-[14px] text-[var(--muted-2)] italic">
            Where each engine gets its information about this topic
          </p>
          {topicGroups.map((g) => (
            <div key={g.topic} className="mb-8">
              <div className="flex items-baseline gap-2.5 border-b border-[var(--ink)] pb-2">
                <span className="font-serif text-[19px]">{g.topic}</span>
                <span className="font-serif text-[13px] text-[var(--faint)] italic">{g.total}</span>
              </div>
              {g.queries.map((q) => (
                <div
                  key={q.query_text}
                  className="flex items-center justify-between gap-4 border-b border-[var(--rule-light)] py-2.5"
                >
                  <span className="flex flex-wrap items-baseline gap-2 text-[13.5px] text-[var(--ink)]">
                    {q.query_text}
                    {q.engines.map((label) => (
                      <span
                        key={label}
                        className="border border-[var(--rule)] px-1.5 py-px text-[11px] tracking-[0.08em] text-[var(--muted-2)] uppercase"
                        title={`Fired by ${label}`}
                      >
                        {label}
                      </span>
                    ))}
                    {q.avgPosition !== null && q.avgPosition <= 1.5 && (
                      <span
                        className="text-[11px] tracking-[0.08em] text-[var(--rust)] uppercase"
                        title="Fired first (or near-first) in its response's sub-search sequence — usually the primary read of intent, not a refinement"
                      >
                        primary
                      </span>
                    )}
                  </span>
                  <span className="flex items-baseline gap-3">
                    {q.avgPosition !== null && (
                      <span
                        className="font-serif text-[13px] text-[var(--faint)] italic"
                        title="Average position in the sub-search sequence"
                      >
                        avg #{q.avgPosition.toFixed(1)}
                      </span>
                    )}
                    <span className="font-serif text-[15px] text-[var(--muted-2)]">{q.count}</span>
                  </span>
                </div>
              ))}
            </div>
          ))}
          {!topicGroups.length && (
            <p className="font-serif text-[15px] text-[var(--muted-2)] italic">
              No fanout data yet — run &ldquo;Fetch citations now&rdquo; to capture the engines&apos;
              search queries.
            </p>
          )}
        </div>

        {/* "Common phrases" used to render `topPhrases` a second time here,
            identical to the "Recurring phrases" card above — same array, same
            numbers, twice on one page. Removed; the card above is the one. */}
      </section>
    </div>
  );
}
