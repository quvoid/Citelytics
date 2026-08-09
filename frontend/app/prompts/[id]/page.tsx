import Link from "next/link";
import { notFound } from "next/navigation";
import { EngineLabel } from "@/components/engine-icons";
import { MentionMark, ProvenanceDot } from "@/components/marks";
import { getCitations, getEngines, getPrompt, getRawResponses } from "@/lib/queries";
import type { Citation } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PromptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const prompt = await getPrompt(id);
  if (!prompt) notFound();

  const [engines, citations, rawResponses] = await Promise.all([
    getEngines(),
    getCitations({ promptId: id }),
    getRawResponses(id),
  ]);

  const engineById = new Map(engines.map((e) => [e.id, e.name]));
  const answerMentionByEngine = new Map(
    rawResponses.map((r) => [r.engine_id, r.brand_mentioned_in_answer])
  );
  const sentimentByEngine = new Map(rawResponses.map((r) => [r.engine_id, r.brand_sentiment_score]));
  const positionByEngine = new Map(rawResponses.map((r) => [r.engine_id, r.brand_position]));
  const lastFetchByEngine = new Map(rawResponses.map((r) => [r.engine_id, r.fetched_at]));

  const byEngine = new Map<string, Citation[]>();
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
        return (
          <section key={engineId} className="border-b border-[var(--rule)] py-9">
            <div className="grid grid-cols-1 gap-11 md:grid-cols-[210px_1fr]">
              <div>
                <h2 className="m-0 flex items-center gap-2 font-serif text-[24px] font-medium tracking-[-0.01em]">
                  <EngineLabel name={engineById.get(engineId)} size={20} />
                </h2>
                <p className="mt-2 font-serif text-[14px] leading-[1.5] text-[var(--muted-2)] italic">
                  {rows.length} cited pages · {nameCount} name you
                </p>
                {lastFetchByEngine.get(engineId) && (
                  <div className="mt-3 flex items-center gap-1.5 font-serif text-[12.5px] text-[var(--muted-2)] italic">
                    <ProvenanceDot real={rows.some((c) => !c.is_simulated)} />
                    {rows.some((c) => !c.is_simulated) ? "real fetch" : "simulated"}
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
