import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AnswerText } from "@/components/answer-text";
import { EngineCard, EngineCardSkeleton } from "@/components/engine-answer-card";
import { EngineLabel } from "@/components/engine-icons";
import { MentionMark, ProvenanceDot } from "@/components/marks";
import { getPromptDetail, type PromptDetailPayload } from "@/lib/actions/prompt-detail";
import type { RankedBrand } from "@/lib/highlight-brands";
import {
  getAnswerBrandMentions,
  getAnswerProductTags,
  getCitations,
  getEngines,
  getPrompt,
  getRawResponses,
  getTrackedUrls,
} from "@/lib/queries";
import type { Citation } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Streams the "Sources & grounding" block in for one engine once
 *  `getPromptDetail` resolves — it parses a full `raw_response` jsonb blob
 *  per engine, the heaviest fetch on this page, so it's kept off the main
 *  `Promise.all` and streamed in behind its own Suspense boundary instead.
 *  Every engine's boundary shares the SAME in-flight promise (passed down,
 *  not re-invoked), so this still fires exactly one query no matter how many
 *  engines answered — Suspense just lets each card reveal independently
 *  rather than the whole page waiting on the slowest one. */
async function EngineSourcesSection({
  detailPromise,
  engineName,
}: {
  detailPromise: Promise<PromptDetailPayload | null>;
  engineName: string | undefined;
}) {
  const promptDetail = await detailPromise;
  const answerDetail = engineName
    ? promptDetail?.answers.find((a) => a.engineName === engineName)
    : undefined;
  if (!answerDetail) return null;
  return (
    <div className="mt-8 border-t border-[var(--rule-light)] pt-8">
      <div className="mb-3 text-[10px] tracking-[0.11em] text-[var(--muted-2)] uppercase">
        Sources &amp; grounding
      </div>
      <EngineCard a={answerDetail} />
    </div>
  );
}

export default async function PromptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const prompt = await getPrompt(id);
  if (!prompt) notFound();

  // Not awaited here on purpose — it starts immediately but the rest of the
  // page (citations, brand mentions, product tags) doesn't wait on it. See
  // EngineSourcesSection above.
  const promptDetailPromise = getPromptDetail(id);

  const [engines, citations, rawResponses, trackedUrls] = await Promise.all([
    getEngines(),
    getCitations({ promptId: id }),
    getRawResponses(id),
    getTrackedUrls(),
  ]);

  const engineById = new Map(engines.map((e) => [e.id, e.name]));
  const answerMentionByEngine = new Map(
    rawResponses.map((r) => [r.engine_id, r.brand_mentioned_in_answer])
  );
  const sentimentByEngine = new Map(rawResponses.map((r) => [r.engine_id, r.brand_sentiment_score]));
  const positionByEngine = new Map(rawResponses.map((r) => [r.engine_id, r.brand_position]));
  const lastFetchByEngine = new Map(rawResponses.map((r) => [r.engine_id, r.fetched_at]));
  // Same "last one wins" pairing the maps above already rely on when a
  // prompt has been re-fetched more than once per engine — kept consistent
  // rather than introducing a different tie-break just for this.
  const rawResponseIdByEngine = new Map(rawResponses.map((r) => [r.engine_id, r.id]));

  // Full brand ranking for THIS answer, not just your own brand's position
  // number — answer_brand_mentions carries one row per tracked brand per
  // response, ordered by first-mention offset in the actual answer text.
  // Sentiment is per-brand here (migration 0010) — competitors get a real
  // score too, not just the tracked owner's brand.
  const brandMentions = await getAnswerBrandMentions(rawResponses.map((r) => r.id));
  const trackedById = new Map(trackedUrls.map((t) => [t.id, t]));
  const rankedBrandsByResponse = new Map<string, RankedBrand[]>();
  for (const m of brandMentions) {
    if (!m.mentioned || m.position == null) continue;
    const t = trackedById.get(m.tracked_url_id);
    if (!t) continue;
    const list = rankedBrandsByResponse.get(m.raw_response_id) ?? [];
    list.push({
      name: t.name,
      isOwn: !t.is_competitor,
      position: m.position,
      sentiment: m.sentiment_score,
    });
    rankedBrandsByResponse.set(m.raw_response_id, list);
  }
  for (const list of rankedBrandsByResponse.values()) list.sort((a, b) => a.position - b.position);

  const answerTextByEngine = new Map(rawResponses.map((r) => [r.engine_id, r.answer_text]));

  // Specific model names ("Edge 70 Fusion") named per answer — grouped the
  // same way as the brand ranking above, one raw_response_id at a time.
  const productTags = await getAnswerProductTags(rawResponses.map((r) => r.id));
  const tagsByResponse = new Map<string, string[]>();
  for (const t of productTags) {
    const list = tagsByResponse.get(t.raw_response_id) ?? [];
    list.push(t.tag);
    tagsByResponse.set(t.raw_response_id, list);
  }

  // Which engines to render a section for comes from raw_responses (one row
  // per engine that actually answered), NOT from citations — a real answer
  // can legitimately carry zero citations (e.g. a ChatGPT run captured
  // mentions/fanout only, no citation resolution). Grouping by citations
  // instead used to make that engine's whole section vanish even though its
  // ranking/fanout data was sitting right there in the DB.
  const byEngine = new Map<string, Citation[]>();
  for (const r of rawResponses) {
    if (!byEngine.has(r.engine_id)) byEngine.set(r.engine_id, []);
  }
  for (const c of citations) {
    const list = byEngine.get(c.engine_id) ?? [];
    list.push(c);
    byEngine.set(c.engine_id, list);
  }

  const totalCitations = citations.length;
  const citationsMentioningBrand = citations.filter((c) => c.mentions_brand === true).length;

  return (
    <div>
      <section className="border-b border-[var(--ink)] py-10">
        <Link
          href="/prompts"
          className="font-sans text-[11px] tracking-[0.11em] text-[var(--rust)] uppercase no-underline"
        >
          ← all prompts
        </Link>
        <div className="mt-5 grid grid-cols-1 items-end gap-14 md:grid-cols-[1.4fr_1fr]">
          <div>
            <h1 className="m-0 font-serif text-[38px] leading-[1.15] font-normal tracking-[-0.02em]">
              &ldquo;{prompt.query_text}&rdquo;
            </h1>
            <div className="mt-3.5 flex items-center gap-4 text-[12px] text-[var(--muted-2)]">
              <span>{prompt.active ? "active" : "paused"}</span>
              <span>{byEngine.size} engine(s)</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-px border border-[var(--rule)] bg-[var(--rule)]">
            {[
              { label: "Citations", value: totalCitations },
              { label: "Name you", value: citationsMentioningBrand },
              { label: "Engines", value: byEngine.size },
            ].map((s) => (
              <div key={s.label} className="bg-[var(--paper)] px-4.5 py-4">
                <div className="text-[10px] tracking-[0.11em] text-[var(--muted-2)] uppercase">
                  {s.label}
                </div>
                <div className="mt-1.5 font-serif text-[28px]">{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {[...byEngine.entries()].map(([engineId, rows]) => {
        const mentionedInAnswer = answerMentionByEngine.get(engineId) ?? false;
        const nameCount = rows.filter((c) => c.mentions_brand === true).length;
        const rrId = rawResponseIdByEngine.get(engineId);
        const ranked = rrId ? (rankedBrandsByResponse.get(rrId) ?? []) : [];
        const tags = rrId ? tagsByResponse.get(rrId) : undefined;
        const answerText = rrId ? (answerTextByEngine.get(engineId) ?? null) : null;
        const engineName = engineById.get(engineId);
        return (
          <section key={engineId} className="border-b border-[var(--rule)] py-9">
            {/* The actual AI output — everything below (citations, brand
                ranking, product tags) is metadata ABOUT this text, so it
                comes first, full width, ahead of the two-column detail grid. */}
            <div className="mb-8">
              <div className="mb-3 flex items-center gap-2 font-serif text-[24px] font-medium tracking-[-0.01em]">
                <EngineLabel name={engineById.get(engineId)} size={20} />
              </div>
              <div className="rounded-[10px] border border-[var(--rule)] bg-[var(--paper)] p-4.5">
                <AnswerText text={answerText} brands={ranked} />
              </div>
              {ranked.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {ranked.map((b) => (
                    <span
                      key={b.name}
                      className="flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[11px] font-medium"
                      style={{
                        background: b.isOwn ? "var(--tint-peach)" : "var(--tint-sky)",
                        color: b.isOwn ? "var(--tint-peach-fg)" : "var(--tint-sky-fg)",
                      }}
                      title={`Mentioned #${b.position}`}
                    >
                      {b.name}
                      {b.sentiment !== null && (
                        <span className="opacity-70">· {b.sentiment}</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 gap-11 md:grid-cols-[210px_1fr]">
              <div>
                <p className="m-0 font-serif text-[14px] leading-[1.5] text-[var(--muted-2)] italic">
                  {rows.length} cited pages · {nameCount} name you
                </p>
                {lastFetchByEngine.get(engineId) && (
                  <div className="mt-3 flex items-center gap-1.5 font-serif text-[12.5px] text-[var(--muted-2)] italic">
                    {/* A real answer can legitimately carry zero citations
                        (e.g. a mentions/fanout-only run) — "no citations
                        stored" must not read as "simulated". Only actually
                        flag simulated when every citation that DOES exist
                        says so; no citations at all defaults to real, since
                        every raw_responses row in this app is a genuine
                        fetch (simulation only ever applies at the citation
                        level, never to the answer itself). */}
                    <ProvenanceDot real={!rows.length || rows.some((c) => !c.is_simulated)} />
                    {!rows.length || rows.some((c) => !c.is_simulated) ? "real fetch" : "simulated"}
                  </div>
                )}
                <div className="mt-3">
                  <MentionMark value={mentionedInAnswer} />
                </div>
                {(sentimentByEngine.get(engineId) !== null || positionByEngine.get(engineId) !== null) && (
                  <div className="mt-3 flex gap-4 font-serif text-[13px] text-[var(--muted-2)]">
                    {sentimentByEngine.get(engineId) !== null && (
                      <span>sentiment {sentimentByEngine.get(engineId)}</span>
                    )}
                    {positionByEngine.get(engineId) !== null && (
                      <span>position #{positionByEngine.get(engineId)}</span>
                    )}
                  </div>
                )}
                {ranked.length > 0 && (
                  <div className="mt-4 border-t border-[var(--rule-light)] pt-3.5">
                    <div className="mb-2 text-[10px] tracking-[0.11em] text-[var(--muted-2)] uppercase">
                      Brands named, in order
                    </div>
                    <ol className="m-0 flex flex-col gap-1.5 p-0">
                      {ranked.map((b) => (
                        <li
                          key={b.name}
                          className="flex list-none items-baseline gap-2 font-serif text-[14px]"
                        >
                          <span className="w-[18px] text-[var(--faint)]">#{b.position}</span>
                          <span style={{ color: b.isOwn ? "var(--rust)" : "var(--ink)" }}>
                            {b.name}
                          </span>
                          {b.sentiment !== null && (
                            <span className="font-sans text-[11px] text-[var(--faint)]">
                              sent. {b.sentiment}
                            </span>
                          )}
                          {b.isOwn && (
                            <span className="border border-[#E0BDB2] px-1 py-px text-[8.5px] tracking-[0.1em] text-[var(--rust)] uppercase">
                              you
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {(() => {
                  if (!tags?.length) return null;
                  return (
                    <div className="mt-4 border-t border-[var(--rule-light)] pt-3.5">
                      <div className="mb-2 text-[10px] tracking-[0.11em] text-[var(--muted-2)] uppercase">
                        Models named
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="border border-[var(--rule)] px-2 py-0.5 font-serif text-[12.5px] text-[var(--ink)]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div>
                {rows.map((c, i) => (
                  <article
                    key={c.id}
                    className="grid grid-cols-[30px_1fr_150px] items-start gap-4.5 border-t border-[var(--rule-light)] py-4.5"
                  >
                    <div className="font-serif text-[22px] leading-none text-[var(--faint)]">
                      †{i + 1}
                    </div>
                    <div>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-serif text-[17px] leading-[1.35] text-[var(--ink)] hover:text-[var(--rust)]"
                      >
                        {c.domain}
                      </a>
                      <div>
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block text-[12px] break-all text-[var(--rust)]"
                        >
                          {c.url}
                        </a>
                      </div>
                      <div className="mt-2 flex items-center gap-3.5 text-[11px] tracking-[0.06em] text-[var(--muted-2)] uppercase">
                        <span>{c.is_simulated ? "simulated demo citation" : "real citation"}</span>
                        <span className="flex items-center gap-1.5 font-serif text-[12.5px] tracking-[0.02em] italic normal-case">
                          <ProvenanceDot real={!c.is_simulated} />
                          {c.is_simulated ? "simulated" : "live fetch"}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <MentionMark value={c.mentions_brand} />
                      <div className="mt-1.5 text-[11px] text-[var(--faint)]">
                        {new Date(c.fetched_at).toLocaleDateString()}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <Suspense
              fallback={
                <div className="mt-8 border-t border-[var(--rule-light)] pt-8">
                  <div className="mb-3 flex items-center gap-2 text-[10px] tracking-[0.11em] text-[var(--muted-2)] uppercase">
                    Sources &amp; grounding
                    <span className="h-[6px] w-[6px] animate-pulse rounded-full bg-[var(--ember)]" />
                  </div>
                  <EngineCardSkeleton />
                </div>
              }
            >
              <EngineSourcesSection detailPromise={promptDetailPromise} engineName={engineName} />
            </Suspense>
          </section>
        );
      })}

      {!citations.length && (
        <p className="border-b border-[var(--rule)] py-10 text-center font-serif text-[16px] text-[var(--muted-2)] italic">
          No citations yet for this prompt — run &ldquo;Fetch citations now&rdquo; from the header.
        </p>
      )}
    </div>
  );
}
