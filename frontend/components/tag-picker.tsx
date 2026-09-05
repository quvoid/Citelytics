"use client";

import { useState, useTransition } from "react";
import { addTagToPrompt, removeTagFromPrompt } from "@/lib/actions/tags";
import { colorForTag } from "@/lib/tag-colors";
import type { Tag } from "@/lib/types";

/** Per-prompt tag assignment: pills for what's already applied (click ✕ to
 * remove), plus a small dropdown of the project's other tags to add one.
 * Tag CREATION lives in TagManager, not here — this only assigns tags that
 * already exist, matching SEMrush's split between "manage tags" and "apply
 * tags to this keyword". */
export function TagPicker({
  promptId,
  assigned,
  allTags,
}: {
  promptId: string;
  assigned: Tag[];
  allTags: Tag[];
}) {
  const [isPending, startTransition] = useTransition();
  const assignedIds = new Set(assigned.map((t) => t.id));
  const available = allTags.filter((t) => !assignedIds.has(t.id));

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
            >
              ✕
            </button>
          </span>
        );
      })}
      {available.length > 0 && (
        <TagAddSelect promptId={promptId} available={available} pending={isPending} startTransition={startTransition} />
      )}
    </div>
  );
}

function TagAddSelect({
  promptId,
  available,
  pending,
  startTransition,
}: {
  promptId: string;
  available: Tag[];
  pending: boolean;
  startTransition: (fn: () => void | Promise<void>) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <select
      aria-label="Add a tag"
      value={value}
      disabled={pending}
      onChange={(e) => {
        e.preventDefault();
        const tagId = e.target.value;
        if (!tagId) return;
        startTransition(() => addTagToPrompt(promptId, tagId));
        setValue("");
      }}
      className="border border-dashed border-[var(--rule)] bg-transparent px-1 py-0.5 text-[11px] text-[var(--faint)] outline-none"
    >
      <option value="">+ tag</option>
      {available.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
