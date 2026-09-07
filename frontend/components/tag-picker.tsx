"use client";

import { useTransition } from "react";
import { removeTagFromPrompt } from "@/lib/actions/tags";
import { colorForTag } from "@/lib/tag-colors";
import type { Tag } from "@/lib/types";

/** Shows what auto-matched to this prompt (click ✕ to remove a bad match) —
 * there is no manual "add a tag" control here any more. A tag applies
 * itself the moment its name shows up as a whole word in the prompt's text
 * or one of its answers (lib/actions/tags.ts's createTag, lib/actions/
 * prompts.ts's addPrompt, and backend/store.py's auto_link_tags all run the
 * same match on their own trigger). Removing one here is a manual override;
 * it may get re-applied if a future tag/prompt creation re-scans this exact
 * pair, same as any computed value can. Tag CREATION still lives in
 * TagManager, not here. */
export function TagPicker({ promptId, assigned }: { promptId: string; assigned: Tag[] }) {
  const [isPending, startTransition] = useTransition();

  if (!assigned.length) {
    return <span className="font-sans text-[11px] text-[var(--faint)] italic">no tag matched yet</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {assigned.map((t) => {
        // Same hashed-from-name color every tag pill uses everywhere
        // (lib/tag-colors.ts) — a tag reads as the same color here, in the
        // Tag filter dropdown, and anywhere else it's rendered.
        const tc = colorForTag(t.name);
        return (
          <span
            key={t.id}
            className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-medium tracking-[0.02em]"
            style={{ borderColor: tc.border, color: tc.fg, background: tc.bg }}
          >
            {t.name}
            <button
              type="button"
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                startTransition(() => removeTagFromPrompt(promptId, t.id));
              }}
              className="opacity-70 hover:opacity-100"
              style={{ color: tc.fg }}
              aria-label={`Remove ${t.name} tag`}
              title="Remove this auto-matched tag"
            >
              ✕
            </button>
          </span>
        );
      })}
    </div>
  );
}
