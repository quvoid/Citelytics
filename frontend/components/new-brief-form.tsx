"use client";

import { useTransition } from "react";
import { createBrief } from "@/lib/actions/briefs";
import { buttonAccent } from "@/lib/button-styles";

export function NewBriefForm() {
  const [isPending, startTransition] = useTransition();

  return (
    <form action={(formData) => startTransition(() => createBrief(formData))} className="mt-11">
      <label className="text-[11px] tracking-[0.12em] text-[var(--muted-2)] uppercase">
        Prompt or topic
      </label>
      <input
        name="prompt_text"
        required
        placeholder="e.g. best almond oil for hair growth in India"
        className="mt-3 w-full border-0 border-b border-[var(--ink)] bg-transparent py-1.5 font-serif text-[26px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)]"
      />
      <button
        type="submit"
        disabled={isPending}
        className={`mt-9 ${buttonAccent}`}
      >
        {isPending ? "Creating…" : "Create brief"}
      </button>
    </form>
  );
}
