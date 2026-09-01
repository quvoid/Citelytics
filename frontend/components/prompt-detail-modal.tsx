"use client";

import { ArrowRight, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getPromptDetail, type PromptDetailPayload } from "@/lib/actions/prompt-detail";
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
        <span className="font-sans text-[10px] font-semibold tracking-[0.11em] text-[var(--muted-2)] uppercase">
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

function EngineCard({ a }: { a: EngineAnswerDetail & { country: string | null; fetchedAt: string } }) {
  const label = ENGINE_LABEL[a.engineName] ?? a.engineName;
  const retrievedOnly = a.sources.filter((s) => !s.citedInText).length;

  return (
    <section className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-sans text-[14px] font-semibold tracking-[-0.01em]">{label}</span>
        <span className="font-sans text-[11px] text-[var(--faint)]">
          {a.country ? `${a.country} · ` : ""}
          {new Date(a.fetchedAt).toLocaleString()}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {[
          { k: "Sources", v: String(a.sources.length) },
          { k: "Mini-searches", v: String(a.searchRounds.reduce((n, r) => n + r.queries.length, 0)) },
          {
            k: "Grounded",
            // null (engine exposes no span data) must not render as "0%".
            v: a.groundedPct === null ? "—" : `${a.groundedPct}%`,
          },
          ...(retrievedOnly ? [{ k: "Read, not cited", v: String(retrievedOnly) }] : []),
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
                        className="ml-1.5 rounded-full px-1.5 py-px text-[9px] font-semibold tracking-[0.06em] uppercase"
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
                    <div className="mb-1 font-sans text-[10px] tracking-[0.08em] text-[var(--faint)] uppercase">
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
            count={a.groundedSpans.length}
            hint="Which claim each source actually backs — the answer to “what shapes what the AI says about us”, not just “what got cited”."
          >
            <ul className="m-0 flex max-h-[220px] list-none flex-col gap-2 overflow-y-auto p-0">
              {a.groundedSpans.map((s, i) => (
                // 1px rule, not a 2px coloured bar — the quote marks and the
                // source line already carry the grouping; a thick accent
                // stripe is decoration standing in for hierarchy.
                <li key={i} className="border-l border-[var(--border)] pl-2.5">
                  <div className="font-sans text-[12px] leading-[1.5] text-[var(--ink)]">
                    “{s.text}”
                  </div>
                  <div className="mt-0.5 font-sans text-[11px] text-[var(--faint)]">
                    {s.sourceNumbers.map((n) => `†${n}`).join(" ")}{" "}
                    {s.sourceNumbers
                      .map((n) => a.sources.find((x) => x.n === n)?.domain)
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      {(a.usage || a.notes.length > 0) && (
        <div className="mt-3.5">
          <Section title="Notes">
            {a.usage && (
              <p className="m-0 mb-1.5 font-sans text-[11.5px] text-[var(--muted-2)] tabular-nums">
                Tokens — in {a.usage.input ?? "—"} · out {a.usage.output ?? "—"}
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

export function PromptDetailModal({
  promptId,
  queryText,
  children,
  className,
}: {
  promptId: string;
  queryText: string;
  /** The clickable trigger — usually the prompt text itself. */
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PromptDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await getPromptDetail(promptId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load answer detail.");
    }
  }, [promptId]);

  useEffect(() => {
    if (!open) return;
    if (!data && !error) void load();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // The dialog scrolls internally; letting the page behind it scroll too is
    // the classic modal bug where the background drifts under the overlay.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, data, error, load]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Answer detail for “${queryText}”`}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 md:p-8"
          style={{ background: "rgba(23,23,27,0.45)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="w-full max-w-[880px] rounded-[16px] bg-[var(--background)] p-5"
            style={{ boxShadow: "var(--shadow-pop)" }}
          >
            {/* No eyebrow above this heading — the quoted prompt already
                reads as the prompt; a "PROMPT" label above it adds a word
                and takes a line. */}
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="m-0 min-w-0 font-sans text-[20px] leading-[1.3] font-bold tracking-[-0.025em]">
                “{queryText}”
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex flex-none items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] p-1.5 text-[var(--muted-2)] transition-colors duration-150 hover:text-[var(--ink)]"
              >
                <X size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            {error && (
              <p className="m-0 font-sans text-[13px] text-[var(--red)]">{error}</p>
            )}
            {!data && !error && (
              <p className="m-0 py-8 text-center font-sans text-[13px] text-[var(--muted-2)]">
                Loading answer detail…
              </p>
            )}
            {data && !data.answers.length && (
              <p className="m-0 py-8 text-center font-sans text-[13px] text-[var(--muted-2)]">
                No answers captured for this prompt yet.
              </p>
            )}
            {data && data.answers.length > 0 && (
              <div className="flex flex-col gap-4">
                {data.answers.map((a) => (
                  <EngineCard key={a.rawResponseId} a={a} />
                ))}
              </div>
            )}

            <div className="mt-4 flex justify-end border-t border-[var(--rule-light)] pt-3">
              <Link
                href={`/prompts/${promptId}`}
                className="group inline-flex items-center gap-1 font-sans text-[12px] font-medium text-[var(--ember)] no-underline"
              >
                Open full page
                <ArrowRight
                  size={13}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  className="transition-transform duration-150 group-hover:translate-x-0.5"
                />
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
