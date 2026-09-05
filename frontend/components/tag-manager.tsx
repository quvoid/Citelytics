"use client";

import { useRef, useState, useTransition } from "react";
import { createTag, deleteTag, renameTag, updateTagGroup } from "@/lib/actions/tags";
import { colorForTag } from "@/lib/tag-colors";
import type { Tag } from "@/lib/types";

function TagChip({ tag }: { tag: Tag }) {
  const [editing, setEditing] = useState(false);
  const [groupEditing, setGroupEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return (
      <form
        action={(formData) =>
          startTransition(async () => {
            await renameTag(tag.id, String(formData.get("name") ?? ""));
            setEditing(false);
          })
        }
        className="flex items-center gap-1 border border-[var(--ink)] px-1.5 py-1"
      >
        <input
          name="name"
          defaultValue={tag.name}
          autoFocus
          className="w-24 border-0 bg-transparent font-sans text-[11px] text-[var(--ink)] outline-none"
        />
        <button type="submit" disabled={isPending} className="text-[11px] text-[var(--rust)]">
          ✓
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-[11px] text-[var(--faint)]">
          ✕
        </button>
      </form>
    );
  }

  if (groupEditing) {
    return (
      <form
        action={(formData) =>
          startTransition(async () => {
            await updateTagGroup(tag.id, String(formData.get("group") ?? ""));
            setGroupEditing(false);
          })
        }
        className="flex items-center gap-1 border border-[var(--ink)] px-1.5 py-1"
      >
        <input
          name="group"
          defaultValue={tag.group_name ?? ""}
          autoFocus
          placeholder="Group (optional)"
          className="w-28 border-0 bg-transparent font-sans text-[11px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)]"
        />
        <button type="submit" disabled={isPending} className="text-[11px] text-[var(--rust)]">
          ✓
        </button>
        <button type="button" onClick={() => setGroupEditing(false)} className="text-[11px] text-[var(--faint)]">
          ✕
        </button>
      </form>
    );
  }

  // Same hashed-from-name palette as TagPicker/FilterDropdown — a tag reads
  // as the same color wherever it's shown, starting here at creation.
  const tc = colorForTag(tag.name);
  return (
    <span
      className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-sans text-[11.5px] font-medium"
      style={{ borderColor: tc.border, color: tc.fg, background: tc.bg }}
    >
      <button type="button" onClick={() => setEditing(true)} className="hover:underline">
        {tag.name}
      </button>
      <button
        type="button"
        onClick={() => setGroupEditing(true)}
        className="opacity-70 hover:opacity-100"
        style={{ color: tc.fg }}
        title={tag.group_name ? `Group: ${tag.group_name} — click to change` : "Set a group for this tag"}
      >
        ⌂
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => deleteTag(tag.id))}
        className="opacity-70 hover:opacity-100"
        style={{ color: tc.fg }}
        title={`Delete "${tag.name}" — removes it from every prompt`}
      >
        ✕
      </button>
    </span>
  );
}

/** Tag creation + management, SEMrush-style: entirely user-defined, nothing
 * AI-generated here. Assignment to individual prompts happens in TagPicker
 * on each prompt row — this component only owns the tag vocabulary itself
 * (create / rename / delete / group).
 *
 * Grouped tags render under their group_name header; ungrouped tags stay in
 * a flat list underneath — matching how thin Peec's own tag-group feature
 * reads (a label on the tag, not a separate hierarchy you create first). */
export function TagManager({ tags }: { tags: Tag[] }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  const groups = new Map<string, Tag[]>();
  const ungrouped: Tag[] = [];
  for (const t of tags) {
    if (t.group_name) {
      const list = groups.get(t.group_name) ?? [];
      list.push(t);
      groups.set(t.group_name, list);
    } else {
      ungrouped.push(t);
    }
  }

  return (
    <section className="border-b border-[var(--rule)] py-4">
      <div className="flex flex-col gap-2.5">
        {[...groups.entries()].map(([group, groupTags]) => (
          <div key={group} className="flex flex-wrap items-center gap-2">
            <span className="mr-1 min-w-[80px] font-sans text-[11px] tracking-[0.12em] text-[var(--muted-2)] uppercase">
              {group}
            </span>
            {groupTags.map((t) => (
              <TagChip key={t.id} tag={t} />
            ))}
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 min-w-[80px] font-sans text-[11px] tracking-[0.12em] text-[var(--muted-2)] uppercase">
            {groups.size > 0 ? "Ungrouped" : "Tags"}
          </span>
          {ungrouped.map((t) => (
            <TagChip key={t.id} tag={t} />
          ))}
          <button
            onClick={() => setOpen((v) => !v)}
            className="border border-dashed border-[var(--rule)] px-2.5 py-1 font-sans text-[11px] text-[var(--muted-2)] hover:border-[var(--ink)] hover:text-[var(--ink)]"
          >
            {open ? "cancel" : "+ new tag"}
          </button>
        </div>
      </div>

      {open && (
        <form
          ref={formRef}
          action={(formData) =>
            startTransition(async () => {
              await createTag(formData);
              formRef.current?.reset();
              setOpen(false);
            })
          }
          className="mt-3 flex items-center gap-2"
        >
          <input
            name="name"
            required
            autoFocus
            placeholder="e.g. High Priority, Q1 Campaign, Homepage"
            className="w-64 border-0 border-b border-[var(--ink)] bg-transparent py-1.5 font-serif text-[15px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)]"
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full border border-[var(--rust)] bg-[var(--rust)] px-3.5 py-1.5 font-sans text-[11px] font-semibold tracking-[0.06em] text-[var(--paper)] uppercase disabled:opacity-60"
          >
            {isPending ? "Adding…" : "Add"}
          </button>
        </form>
      )}
    </section>
  );
}
