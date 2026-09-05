"use client";

import { useState, useTransition } from "react";
import { addBrand } from "@/lib/actions/brands";

export type CompetitorSuggestion = { name: string; sightings: number; lastSeen: string };

/**
 * One suggestion chip that expands into a minimal "confirm the domain" form
 * — self-contained rather than trying to drive AddBrandForm's internal
 * state from outside, which would need lifting that whole form's state up
 * for one feature. The name is pre-filled and locked (that's the part we
 * actually know); the domain still needs a human, since there's no
 * name-to-domain resolution service here and guessing one would be worse
 * than asking.
 */
function SuggestionChip({ suggestion }: { suggestion: CompetitorSuggestion }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (open) {
    return (
      <form
        action={(formData) =>
          startTransition(async () => {
            formData.set("name", suggestion.name);
            formData.set("is_competitor", "true");
            await addBrand(formData);
            setOpen(false);
          })
        }
        className="flex items-center gap-1.5 rounded-full border border-[var(--ink)] py-1 pr-1.5 pl-3"
      >
        <span className="font-sans text-[12px] font-medium">{suggestion.name}</span>
        <input
          name="url"
          required
          autoFocus
          placeholder="domain.com"
          className="w-[120px] border-0 border-b border-[var(--ink)] bg-transparent px-1 py-0.5 font-sans text-[12px] outline-none placeholder:text-[var(--faint)]"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-[var(--ink)] px-2.5 py-1 font-sans text-[11px] font-medium text-[var(--paper)] disabled:opacity-60"
        >
          {isPending ? "…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-1 font-sans text-[13px] text-[var(--faint)]"
        >
          ✕
        </button>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 font-sans text-[12px] font-medium text-[var(--muted-2)] hover:border-[var(--ink)] hover:text-[var(--ink)]"
      title={`Last seen ${new Date(suggestion.lastSeen).toLocaleDateString()}`}
    >
      {suggestion.name}
      <span
        className="rounded-full px-1.5 py-0.5 font-sans text-[11px]"
        style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
      >
        {suggestion.sightings}
      </span>
      <span className="text-[var(--faint)]">+</span>
    </button>
  );
}

/**
 * "Seen in N answers" — competitors the classifier noticed but that aren't
 * tracked yet. Only ever populated for answers where a tracked brand was
 * ALSO detected (see migration 0015's docstring): this can catch a
 * competitor discussed alongside one you track, never one discussed alone.
 * Stated plainly rather than presented as exhaustive.
 */
export function CompetitorSuggestions({ suggestions }: { suggestions: CompetitorSuggestion[] }) {
  if (!suggestions.length) return null;

  return (
    <section className="border-b border-[var(--rule)] py-5">
      <div className="mb-2.5 flex items-baseline gap-2">
        <span className="font-sans text-[11px] font-medium tracking-[0.1em] text-[var(--faint)] uppercase">
          Untracked brands noticed in your answers
        </span>
        <span className="font-sans text-[11px] text-[var(--faint)]">
          — only ones mentioned alongside a brand you already track
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <SuggestionChip key={s.name} suggestion={s} />
        ))}
      </div>
    </section>
  );
}
