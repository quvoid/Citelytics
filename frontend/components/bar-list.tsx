"use client";

import { useState } from "react";

export type BarItem = {
  /** Row label — a domain, an attribute, a brand name. */
  label: string;
  value: number;
  /** Optional second line under the label (e.g. "12% of sources"). */
  sublabel?: string;
  /** Paints this row in the accent instead of the de-emphasis gray. Used for
   * "your brand among competitors" — the emphasis form, not categorical. */
  emphasis?: boolean;
};

/** De-emphasis fill for the rows that are context rather than the story.
 * Deliberately recessive: the emphasised row is the only saturated mark. */
const QUIET = "#b5b3bd";

/**
 * Ranked horizontal bar list.
 *
 * One measure per row, so there is no categorical palette here and no legend:
 * every bar is the same hue (the card title says what is plotted), except in
 * the *emphasis* form where a single row takes the accent and the rest go
 * grey. Colouring each bar by its own value would re-encode what bar length
 * already shows.
 *
 * Every value is direct-labelled at the tip, so the hover tooltip only ever
 * adds context (share of total) — no value is reachable by hover alone.
 */
export function BarList({
  items,
  unit = "",
  accent = "var(--ember)",
  max: maxOverride,
  emptyLabel = "Nothing to show yet.",
}: {
  items: BarItem[];
  unit?: string;
  accent?: string;
  max?: number;
  emptyLabel?: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  if (!items.length) {
    return (
      <p className="m-0 font-sans text-[13.5px] text-[var(--muted-2)]">{emptyLabel}</p>
    );
  }

  const max = maxOverride ?? Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((s, i) => s + i.value, 0);
  // Emphasis is opt-in: with no flagged row every bar is the accent, which is
  // the plain single-series case.
  const hasEmphasis = items.some((i) => i.emphasis);

  return (
    <ul className="m-0 list-none p-0">
      {items.map((item, i) => {
        const pct = (item.value / max) * 100;
        const share = total ? Math.round((item.value / total) * 100) : 0;
        const fill = !hasEmphasis || item.emphasis ? accent : QUIET;
        const isActive = active === i;

        return (
          <li
            key={item.label}
            className="relative -mx-2 rounded-[8px] px-2 py-2 transition-colors duration-150"
            style={{ background: isActive ? "var(--muted)" : "transparent" }}
            onPointerEnter={() => setActive(i)}
            onPointerLeave={() => setActive(null)}
          >
            <div className="flex items-baseline justify-between gap-4">
              <span className="min-w-0 flex-1 truncate font-sans text-[13.5px] text-[var(--ink)]">
                {item.label}
              </span>
              <span className="flex-none font-sans text-[13.5px] font-semibold text-[var(--ink)] tabular-nums">
                {item.value.toLocaleString()}
                {unit && <span className="ml-1 font-normal text-[var(--muted-2)]">{unit}</span>}
              </span>
            </div>

            {/* 8px track, 4px rounded data-end, square at the baseline */}
            <div
              className="mt-1.5 h-2 w-full overflow-hidden rounded-[4px]"
              style={{ background: "var(--rule-light)" }}
            >
              <div
                className="h-full transition-[width] duration-300"
                style={{
                  width: `${Math.max(pct, item.value > 0 ? 1.5 : 0)}%`,
                  background: fill,
                  borderRadius: "0 4px 4px 0",
                }}
              />
            </div>

            {(item.sublabel || isActive) && (
              <div className="mt-1 font-sans text-[11px] text-[var(--faint)] tabular-nums">
                {item.sublabel ?? `${share}% of total`}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
