"use client";

import { ArrowRight, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getPromptDetail, type PromptDetailPayload } from "@/lib/actions/prompt-detail";
import { EngineCard, EngineCardSkeleton } from "@/components/engine-answer-card";

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
          style={{ background: "rgba(23,23,27,0.45)", animation: "overlay-in 160ms ease-out" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="w-full max-w-[880px] rounded-[16px] bg-[var(--background)] p-5"
            style={{
              boxShadow: "var(--shadow-pop)",
              animation: "modal-pop-in 220ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
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
              <div className="flex flex-col gap-4" aria-live="polite" aria-busy="true">
                <span className="sr-only">Loading answer detail…</span>
                <EngineCardSkeleton />
                <EngineCardSkeleton />
              </div>
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
