import { groundingVerdict, sentenceExcerpt } from "@/lib/engine-details";
import type { EngineAnswerDetail, GroundedSpan } from "@/lib/engine-details";

const ENGINE_LABEL: Record<string, string> = {
  openrouter: "ChatGPT",
  "chatgpt-kie": "ChatGPT",
  gemini: "Gemini",
  "gemini-kie": "Gemini",
};

function Section({
  title,
  count,
  hint,
  children,
}: {
  title: string;
  count?: number;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-[var(--rule-light)] pt-3.5">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-sans text-[11px] font-semibold tracking-[0.11em] text-[var(--muted-2)] uppercase">
          {title}
        </span>
        {count !== undefined && (
          <span className="font-sans text-[11px] text-[var(--faint)] tabular-nums">{count}</span>
        )}
      </div>
      {hint && <p className="mt-0 mb-2 font-sans text-[11.5px] text-[var(--faint)]">{hint}</p>}
      {children}
    </div>
  );
}

/** The answer with every grounded span underlined and numbered. Un-underlined
 *  text is the model writing from training memory rather than from a source —
 *  the whole point of showing this, so it must stay visually distinguishable
 *  rather than being quietly rendered the same as everything else. */
function GroundedAnswer({ text, spans }: { text: string; spans: GroundedSpan[] }) {
  if (!spans.length) {
    return <span className="whitespace-pre-wrap">{text}</span>;
  }

  // Flatten overlapping spans into non-overlapping cuts so nested citations
  // don't produce nested <mark>s with doubled backgrounds.
  const points = new Set<number>([0, text.length]);
  for (const s of spans) {
    points.add(Math.max(0, Math.min(text.length, s.startIndex)));
    points.add(Math.max(0, Math.min(text.length, s.endIndex)));
  }
  const cuts = [...points].sort((a, b) => a - b);

  return (
    <span className="whitespace-pre-wrap">
      {cuts.slice(0, -1).map((start, i) => {
        const end = cuts[i + 1];
        if (end <= start) return null;
        const covering = spans.filter((s) => s.startIndex <= start && s.endIndex >= end);
        const nums = [...new Set(covering.flatMap((s) => s.sourceNumbers))].sort((a, b) => a - b);
        const chunk = text.slice(start, end);
        if (!covering.length) return <span key={start}>{chunk}</span>;
        return (
          <span
            key={start}
            className="rounded-[2px]"
            style={{
              background: "var(--tint-mint)",
              boxShadow: "inset 0 -1px 0 var(--tint-mint-fg)",
            }}
            title={`Backed by source ${nums.map((n) => `†${n}`).join(", ")}`}
          >
            {chunk}
            {/* text-[9px] below is exempt from the 11px functional-text
                floor — a footnote-style <sup> marker (†1) is expected to
                render small; that's the whole point of <sup>. */}
            {nums.length > 0 && (
              <sup className="ml-0.5 font-sans text-[9px] font-semibold text-[var(--tint-mint-fg)]">
                {nums.map((n) => `†${n}`).join("")}
              </sup>
            )}
          </span>
        );
      })}
    </span>
  );
}

const VERDICT_LABEL: Record<string, string> = {
  "well-grounded": "Well grounded",
  "moderately-grounded": "Moderately grounded",
  "lightly-grounded": "Lightly grounded",
  ungrounded: "Largely ungrounded",
  unknown: "Grounding unknown",
};

/** One verdict line for the whole answer: a percentage, the sentence-level
 *  count it is computed from, and a label — the same shape as the extension
 *  screenshot's "67% Grounded / 10/15 Claims Substantiated / Verdict: ...",
 *  built from data this app already parses rather than a new capture. The
 *  colour follows the bucket so a weak answer cannot read as neutral. */
function GroundingVerdictBadge({ detail }: { detail: EngineAnswerDetail }) {
  const v = groundingVerdict(detail);
  if (v.verdict === "unknown") {
    return (
      <span
        className="rounded-full px-2.5 py-1 font-sans text-[11px]"
        style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
        title="This response carries no per-claim grounding data to score."
      >
        Grounding <strong className="font-semibold text-[var(--ink)]">—</strong>
      </span>
    );
  }
  const color =
    v.verdict === "well-grounded"
      ? "var(--green)"
      : v.verdict === "moderately-grounded"
        ? "var(--tint-sky-fg)"
        : v.verdict === "lightly-grounded"
          ? "var(--tint-peach-fg)"
          : "var(--red)";
  return (
    <span
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-[11px]"
      style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
      title={`${v.substantiatedSentences}/${v.totalSentences} sentences overlap a cited source's span`}
    >
      <span className="inline-block h-[6px] w-[6px] flex-none rounded-full" style={{ background: color }} />
      <strong className="font-semibold tabular-nums" style={{ color }}>
        {v.groundedPct}% grounded
      </strong>
      <span className="text-[var(--faint)]">
        · {v.substantiatedSentences}/{v.totalSentences} sentences · {VERDICT_LABEL[v.verdict]}
      </span>
    </span>
  );
}

/** Grounding supports, cleaned up for display rather than shown raw.
 *
 *  Three real problems with the raw `groundedSpans` data, all fixed here
 *  rather than in the data model (nothing else depends on these exact
 *  characters, unlike the highlighted Answer above, which needs the
 *  original offsets intact):
 *   1. Span offsets land wherever the engine's annotation happened to end,
 *      which is very often mid-word — `sentenceExcerpt` widens each one out
 *      to real sentence boundaries instead of showing a fragment.
 *   2. The raw text still carries markdown (`**bold**`, `[text](url)`) —
 *      stripped for a clean quote.
 *   3. The same sentence often gets cited by more than one annotation
 *      (OpenAI marks each clause separately even within one sentence),
 *      which showed as 3-5 near-identical, incrementally-growing quotes for
 *      one source. Widening to sentence boundaries makes those collapse to
 *      literally the same string — merged here by that string, keeping the
 *      union of every source number that backs it. */
function GroundingSupportsList({ a }: { a: EngineAnswerDetail }) {
  const answerText = a.answerText;
  if (!answerText) return null;

  const byText = new Map<
    string,
    { text: string; truncatedStart: boolean; truncatedEnd: boolean; sourceNumbers: Set<number> }
  >();
  for (const s of a.groundedSpans) {
    const ex = sentenceExcerpt(answerText, s.startIndex, s.endIndex);
    if (!ex.text) continue;
    const existing = byText.get(ex.text);
    if (existing) {
      for (const n of s.sourceNumbers) existing.sourceNumbers.add(n);
    } else {
      byText.set(ex.text, { ...ex, sourceNumbers: new Set(s.sourceNumbers) });
    }
  }
  const items = [...byText.values()];
  if (!items.length) return null;

  return (
    <ul className="m-0 flex max-h-[260px] list-none flex-col gap-2.5 overflow-y-auto p-0">
      {items.map((it, i) => {
        const nums = [...it.sourceNumbers].sort((x, y) => x - y);
        const domains = nums
          .map((n) => a.sources.find((x) => x.n === n)?.domain)
          .filter((d): d is string => Boolean(d));
        return (
          <li
            key={i}
            className="rounded-[8px] px-3 py-2.5"
            style={{ background: "var(--muted)" }}
          >
            <p className="m-0 font-sans text-[12.5px] leading-[1.55] text-[var(--ink)]">
              {it.truncatedStart && <span className="text-[var(--faint)]">… </span>}
              {it.text}
              {it.truncatedEnd && <span className="text-[var(--faint)]"> …</span>}
            </p>
            <p className="m-0 mt-1 font-sans text-[11px] text-[var(--faint)]">
              {nums.map((n) => `†${n}`).join(" ")}
              {domains.length > 0 && <span className="ml-1">{domains.join(", ")}</span>}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** A pulsing block standing in for real content while it loads — sized and
 *  positioned to match what actually renders, so the layout doesn't jump the
 *  instant data arrives. `animate-pulse` is Tailwind's own opacity breathe;
 *  reused rather than inventing a second loading rhythm for one screen. */
function Bone({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={`block animate-pulse rounded-[6px] bg-[var(--muted)] ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

/** Stands in for one EngineCard while its fetch is in flight — same header,
 *  stat-chip row, and answer-block shape, so the card the user actually
 *  requested doesn't just replace an unrelated spinner. Two of these render
 *  at once (most prompts carry two engines), which is itself informative:
 *  the loading state already tells you how many answers are coming. */
export function EngineCardSkeleton() {
  return (
    <section className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <Bone className="h-[16px] w-[90px]" />
        <Bone className="h-[12px] w-[120px]" />
      </div>
      <div className="mb-3 flex gap-1.5">
        <Bone className="h-[22px] w-[70px] rounded-full" />
        <Bone className="h-[22px] w-[100px] rounded-full" />
        <Bone className="h-[22px] w-[110px] rounded-full" />
      </div>
      <Bone className="h-[90px] w-full rounded-[8px]" />
    </section>
  );
}

/** Full render of one engine's answer: verdict, stat chips, the grounded
 *  answer text, sources (with a "read only" badge for anything retrieved but
 *  never cited), mini-searches, grounding supports, and usage notes. Shared
 *  by the prompt-list modal and the full `/prompts/[id]` page so both
 *  surfaces show identical data instead of two implementations drifting
 *  apart. */
export function EngineCard({ a }: { a: EngineAnswerDetail & { country: string | null; fetchedAt: string } }) {
  const label = ENGINE_LABEL[a.engineName] ?? a.engineName;
  const retrievedOnly = a.sources.filter((s) => !s.citedInText).length;

  return (
    <section className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-baseline gap-1.5 font-sans text-[14px] font-semibold tracking-[-0.01em]">
          {label}
          {a.model && (
            <span className="font-sans text-[11px] font-normal text-[var(--faint)]">{a.model}</span>
          )}
        </span>
        <span className="font-sans text-[11px] text-[var(--faint)]">
          {a.country ? `${a.country} · ` : ""}
          {new Date(a.fetchedAt).toLocaleString()}
          {a.latencyMs !== null && ` · ${(a.latencyMs / 1000).toFixed(1)}s`}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <GroundingVerdictBadge detail={a} />
        {[
          { k: "Sources", v: String(a.sources.length) },
          { k: "Mini-searches", v: String(a.searchRounds.reduce((n, r) => n + r.queries.length, 0)) },
          ...(retrievedOnly ? [{ k: "Read, not cited", v: String(retrievedOnly) }] : []),
          // kie.ai's own real per-call cost — see engine-details.ts's `credits`.
          ...(a.credits !== null ? [{ k: "Cost", v: `${a.credits.toFixed(2)} cr` }] : []),
        ].map((s) => (
          <span
            key={s.k}
            className="rounded-full px-2.5 py-1 font-sans text-[11px]"
            style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
          >
            {s.k} <strong className="font-semibold text-[var(--ink)] tabular-nums">{s.v}</strong>
          </span>
        ))}
      </div>

      {a.commentary && (
        <div className="mb-3.5 rounded-[8px] px-3 py-2.5" style={{ background: "var(--tint-sky)" }}>
          <div className="mb-1 font-sans text-[11px] font-semibold tracking-[0.08em] text-[var(--tint-sky-fg)] uppercase">
            Model&rsquo;s approach
          </div>
          <p className="m-0 font-sans text-[12.5px] leading-[1.55] text-[var(--tint-sky-fg)]">
            {a.commentary}
          </p>
        </div>
      )}

      <Section
        title="Answer"
        hint={
          a.groundedSpans.length
            ? "Highlighted text is backed by a cited source; plain text is the model answering from memory."
            : undefined
        }
      >
        <div className="max-h-[280px] overflow-y-auto rounded-[8px] bg-[var(--muted)] p-3 font-sans text-[13px] leading-[1.7] text-[var(--ink)]">
          {a.answerText ? (
            <GroundedAnswer text={a.answerText} spans={a.groundedSpans} />
          ) : (
            <span className="text-[var(--faint)] italic">No answer text stored.</span>
          )}
        </div>
      </Section>

      <div className="mt-3.5 grid grid-cols-1 gap-3.5 md:grid-cols-2">
        <Section title="Sources" count={a.sources.length}>
          {a.sources.length ? (
            <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
              {a.sources.map((s) => (
                <li key={s.n} className="flex gap-2 font-sans text-[12px]">
                  <span className="w-[22px] flex-none text-[var(--faint)] tabular-nums">†{s.n}</span>
                  <span className="min-w-0 flex-1">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[var(--ink)] no-underline hover:text-[var(--ember)]"
                    >
                      {s.title ?? s.domain}
                    </a>
                    {s.title && (
                      <span className="ml-1.5 text-[11px] text-[var(--faint)]">{s.domain}</span>
                    )}
                    {!s.citedInText && (
                      <span
                        className="ml-1.5 rounded-full px-1.5 py-px text-[11px] font-semibold tracking-[0.06em] uppercase"
                        style={{ background: "var(--tint-stone)", color: "var(--tint-stone-fg)" }}
                        title="Retrieved into the model's context but never referenced in the visible answer — quiet influence, not real attribution."
                      >
                        read only
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="m-0 font-sans text-[12px] text-[var(--faint)] italic">
              No sources stored for this answer.
            </p>
          )}
        </Section>

        <Section
          title="Mini-searches"
          count={a.searchRounds.reduce((n, r) => n + r.queries.length, 0)}
          hint={
            a.searchRounds.length > 1
              ? "Each round is a fresh search after reading the previous results."
              : undefined
          }
        >
          {a.searchRounds.length ? (
            <div className="flex flex-col gap-2">
              {a.searchRounds.map((r) => (
                <div key={r.round}>
                  {a.searchRounds.length > 1 && (
                    <div className="mb-1 font-sans text-[11px] tracking-[0.08em] text-[var(--faint)] uppercase">
                      Round {r.round}
                    </div>
                  )}
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {r.queries.map((q) => (
                      <li
                        key={q}
                        className="rounded-[6px] bg-[var(--muted)] px-2 py-1 font-mono text-[11px] text-[var(--muted-foreground)]"
                      >
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="m-0 font-sans text-[12px] text-[var(--faint)] italic">
              This engine didn&apos;t expose its search queries.
            </p>
          )}
        </Section>
      </div>

      {a.groundedSpans.length > 0 && (
        <div className="mt-3.5">
          <Section
            title="Grounding supports"
            hint="Which claim each source actually backs — the answer to “what shapes what the AI says about us”, not just “what got cited”. Adjacent claims from the same sentence are merged into one."
          >
            <GroundingSupportsList a={a} />
          </Section>
        </div>
      )}

      {(a.usage || a.notes.length > 0) && (
        <div className="mt-3.5">
          <Section title="Notes">
            {a.usage && (
              <p className="m-0 mb-1.5 font-sans text-[11.5px] text-[var(--muted-2)] tabular-nums">
                Tokens — in {a.usage.input ?? "—"}
                {a.usage.cachedInput ? ` (${a.usage.cachedInput.toLocaleString()} cached)` : ""} · out{" "}
                {a.usage.output ?? "—"}
                {a.usage.thinking ? ` · thinking ${a.usage.thinking}` : ""} · total{" "}
                {a.usage.total ?? "—"}
              </p>
            )}
            {a.notes.map((n) => (
              <p key={n} className="m-0 mb-1 font-sans text-[11.5px] text-[var(--faint)]">
                {n}
              </p>
            ))}
          </Section>
        </div>
      )}
    </section>
  );
}
