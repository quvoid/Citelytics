import Link from "next/link";
import { EngineLabel } from "@/components/engine-icons";
import { MentionMark, ProvenanceLabel } from "@/components/marks";
import type { Citation, RawResponse } from "@/lib/types";

// Rotates through the same tint pairs used everywhere else in this app
// (tag-colors.ts, workspace-switcher's MARK_COLORS) — a card's badge color
// is just "which slot in the row", not tied to anything meaningful, same as
// those other rotations.
const BADGE_TINTS = [
  { bg: "var(--tint-lavender)", fg: "var(--tint-lavender-fg)" },
  { bg: "var(--tint-mint)", fg: "var(--tint-mint-fg)" },
  { bg: "var(--tint-peach)", fg: "var(--tint-peach-fg)" },
  { bg: "var(--tint-sky)", fg: "var(--tint-sky-fg)" },
  { bg: "var(--tint-rose)", fg: "var(--tint-rose-fg)" },
];

export type RecentAnswerCard = {
  id: string;
  promptId: string;
  promptText: string;
  engineName: string | undefined;
  fetchedAt: string;
  answerText: string | null;
  citedCount: number;
  mentionCount: number;
  real: boolean;
  mentioned: boolean;
};

/** The reference's "Notebook" card grid, adapted: each card is one recent
 *  fetch instead of one note — icon badge + timestamp on top, the actual
 *  question as the bold title, a preview of the answer as body copy, and a
 *  small stat line as the footer. Single scrollable row (`overflow-x-auto`
 *  + `snap-x`) rather than a wrapping grid, matching the reference's layout
 *  exactly rather than a generic card wall. */
export function RecentAnswersGrid({ cards, viewAllHref }: { cards: RecentAnswerCard[]; viewAllHref: string }) {
  return (
    <section className="mt-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="m-0 font-sans text-[16px] font-bold tracking-[-0.005em]">Recent answers</h2>
          <p className="m-0 mt-0.5 font-sans text-[12.5px] text-[var(--muted-2)]">newest fetch first</p>
        </div>
        <Link
          href={viewAllHref}
          className="font-sans text-[12px] font-semibold text-[var(--ember)] no-underline"
        >
          View all →
        </Link>
      </div>

      {cards.length ? (
        <div className="flex snap-x gap-4 overflow-x-auto pb-2">
          {cards.map((c, i) => {
            const tint = BADGE_TINTS[i % BADGE_TINTS.length];
            return (
              <Link
                key={c.id}
                href={`/prompts/${c.promptId}`}
                // --bg not --card — nests inside the app shell's own white
                // panel (see chart-card.tsx's comment for the reasoning).
                className="flex w-[270px] flex-none snap-start flex-col rounded-[var(--radius-xl)] border border-[var(--rule-light)] bg-[var(--bg)] p-4.5 no-underline transition-shadow duration-150 hover:shadow-[var(--shadow-card-hover)]"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="flex items-center gap-1.5 rounded-full px-2 py-1 font-sans text-[11px] font-semibold"
                    style={{ background: tint.bg, color: tint.fg }}
                  >
                    <EngineLabel name={c.engineName} size={12} />
                  </span>
                  <ProvenanceLabel real={c.real} />
                </div>

                <h3 className="m-0 mt-3 line-clamp-2 font-sans text-[14.5px] leading-[1.35] font-semibold tracking-[-0.005em] text-[var(--ink)]">
                  &ldquo;{c.promptText}&rdquo;
                </h3>

                {c.answerText && (
                  <p className="mt-2 line-clamp-3 flex-1 font-sans text-[12.5px] leading-[1.5] text-[var(--muted-2)]">
                    {c.answerText}
                  </p>
                )}

                <div className="mt-3 flex items-center justify-between border-t border-[var(--rule-light)] pt-2.5">
                  <span className="font-sans text-[11px] text-[var(--faint)] tabular-nums">
                    {c.citedCount} pages · {c.mentionCount} mentions
                  </span>
                  <MentionMark value={c.mentioned} />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="font-sans text-[13px] text-[var(--muted-2)]">No fetches yet.</p>
      )}
    </section>
  );
}

/** Builds the card list from what Overview already fetches — no new query.
 *  Kept out of the component itself so the shaping logic (which citations
 *  belong to which answer, real-vs-simulated) stays in one place instead of
 *  being duplicated at every call site. */
export function buildRecentAnswerCards(
  rawResponses: RawResponse[],
  citations: Citation[],
  promptById: Map<string, string>,
  engineById: Map<string, string>,
  limit = 8,
): RecentAnswerCard[] {
  const byResponse = new Map<string, Citation[]>();
  for (const c of citations) {
    if (!c.raw_response_id) continue;
    const list = byResponse.get(c.raw_response_id) ?? [];
    list.push(c);
    byResponse.set(c.raw_response_id, list);
  }

  return rawResponses.slice(0, limit).map((r) => {
    const cited = byResponse.get(r.id) ?? [];
    return {
      id: r.id,
      promptId: r.prompt_id,
      promptText: promptById.get(r.prompt_id) ?? "—",
      engineName: engineById.get(r.engine_id),
      fetchedAt: r.fetched_at,
      answerText: r.answer_text,
      citedCount: cited.length,
      mentionCount: cited.filter((c) => c.mentions_brand === true).length,
      real: cited.length ? cited.some((c) => !c.is_simulated) : true,
      mentioned: r.brand_mentioned_in_answer,
    };
  });
}
