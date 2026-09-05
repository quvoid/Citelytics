"use client";

import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { colorForTag } from "@/lib/tag-colors";

export type DropdownOption = { id: string; label: string; sublabel?: string; href: string };

/**
 * A single Peec-style filter control: "Label ▾" that opens a small checklist
 * popover, closes on outside click, and links straight to the resulting URL
 * (so the filter stays server-driven — no client-side fetch, just a Link per
 * option). Deliberately NOT a chip wall: with 8+ topics and 8+ tags, chips
 * that must all render on one row is exactly what forced flex items past
 * their min-width and pushed the whole page into a horizontal scrollbar. A
 * closed dropdown costs one fixed-width button regardless of how many
 * options exist behind it.
 */
export function FilterDropdown({
  label,
  activeLabel,
  options,
  selected,
  allHref,
  multiSelect = false,
}: {
  label: string;
  /** Shown on the trigger when a filter is active, in place of `label`. */
  activeLabel?: string;
  /** Each option carries its own destination href — computed server-side by
   *  the caller, never a function, because this is a Client Component and a
   *  Server Component parent cannot pass a function across that boundary
   *  (React serializes props between the two; functions aren't serializable).
   *  In multiSelect mode, each href must already represent "this option
   *  toggled in/out of the CURRENT selection" — the caller's job, since only
   *  it knows what's currently selected. */
  options: DropdownOption[];
  selected: Set<string>;
  allHref: string;
  /** Checkbox-style: clicking an option toggles it without closing the
   *  dropdown, so several can be picked in one open session. Used only for
   *  Tag filtering (AND/OR combination) — every other dimension stays
   *  single-select. */
  multiSelect?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = selected.size > 0;

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [open]);

  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 font-sans text-[12.5px] font-medium whitespace-nowrap"
        style={{
          borderColor: active ? "var(--ink)" : "var(--border)",
          background: active ? "var(--muted)" : "var(--card)",
          color: active ? "var(--ink)" : "var(--muted-2)",
        }}
      >
        {active ? (activeLabel ?? `${label}: ${selected.size}`) : label}
        <ChevronDown
          size={13}
          strokeWidth={2}
          aria-hidden="true"
          className="flex-none transition-transform duration-150"
          style={{ opacity: 0.55, transform: open ? "rotate(180deg)" : undefined }}
        />
      </button>

      {open && (
        <div
          className="absolute top-[calc(100%+6px)] left-0 z-30 max-h-[320px] w-[240px] overflow-y-auto rounded-[10px] border border-[var(--border)] bg-[var(--card)] py-1.5"
          style={{ boxShadow: "var(--shadow-pop)" }}
        >
          <Link
            href={allHref}
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 font-sans text-[12.5px] no-underline"
            style={{ color: active ? "var(--muted-2)" : "var(--ink)", fontWeight: active ? 400 : 600 }}
          >
            All
          </Link>
          <div className="my-1 h-px bg-[var(--border)]" />
          {options.map((o) => {
            const isOn = selected.has(o.id);
            // Tag options render as a colored outline pill (checkbox tinted
            // to match) rather than plain text — one hue per tag, hashed
            // from its name (lib/tag-colors.ts), so the same tag always
            // reads the same color everywhere it appears without a color
            // ever being stored. Non-tag dropdowns (Model, Topic, Market)
            // keep the plain row: a color per option there would suggest a
            // meaning the data doesn't have.
            const tc = multiSelect ? colorForTag(o.label) : null;
            return (
              <Link
                key={o.id}
                href={o.href}
                onClick={() => {
                  if (!multiSelect) setOpen(false);
                }}
                className="flex items-center gap-2 px-3 py-1.5 font-sans text-[12.5px] no-underline hover:bg-[var(--muted)]"
                style={!multiSelect ? { color: "var(--ink)", fontWeight: isOn ? 600 : 400 } : undefined}
              >
                {multiSelect && tc && (
                  <span
                    className="flex h-[14px] w-[14px] flex-none items-center justify-center rounded-[3px] border"
                    style={{
                      borderColor: isOn ? tc.border : "var(--border)",
                      background: isOn ? tc.border : "transparent",
                      color: tc.bg,
                    }}
                  >
                    {isOn && <Check size={10} strokeWidth={3} aria-hidden="true" />}
                  </span>
                )}
                {tc ? (
                  <span
                    className="min-w-0 flex-1 truncate rounded-full border px-2 py-0.5 text-[11.5px] font-medium"
                    style={{
                      borderColor: tc.border,
                      color: tc.fg,
                      background: isOn ? tc.bg : "transparent",
                    }}
                  >
                    {o.label}
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                )}
                {o.sublabel && (
                  <span className="flex-none font-sans text-[11px] text-[var(--faint)]">{o.sublabel}</span>
                )}
              </Link>
            );
          })}
          {!options.length && (
            <div className="px-3 py-2 font-sans text-[12px] text-[var(--faint)]">Nothing to filter yet</div>
          )}
        </div>
      )}
    </div>
  );
}
