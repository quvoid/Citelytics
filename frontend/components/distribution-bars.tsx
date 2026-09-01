"use client";

import { useState } from "react";

export type DistributionBucket = { label: string; value: number };

/** Ordinal ramp — citation position is an ordered scale, not a set of names,
 * so the colour carries the order: rank 1 darkest, fading out down the list.
 * Steps validated for monotone lightness, adjacent ΔL >= 0.06, and a light end
 * that still clears 2:1 on the card surface. */
const RAMP = ["#9c3908", "#af4e1d", "#cb6e3c", "#f29a66"];

const PLOT_H = 132;

/**
 * Column chart for a small ordered set of buckets (citation position).
 *
 * Columns rather than a line: the buckets are discrete ranks, and a line
 * between them would imply a continuum that isn't there. Values sit on the
 * caps, so no gridlines are needed at this size.
 */
export function DistributionBars({
  buckets,
  emptyLabel = "No position data yet.",
}: {
  buckets: DistributionBucket[];
  emptyLabel?: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  const total = buckets.reduce((s, b) => s + b.value, 0);
  if (!total) {
    return <p className="m-0 font-sans text-[13.5px] text-[var(--muted-2)]">{emptyLabel}</p>;
  }

  const max = Math.max(1, ...buckets.map((b) => b.value));

  return (
    <div>
      <div className="flex items-end gap-2" style={{ height: PLOT_H }}>
        {buckets.map((b, i) => {
          const h = (b.value / max) * 100;
          const isActive = active === i;
          return (
            <div
              key={b.label}
              className="flex h-full flex-1 cursor-default flex-col justify-end"
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
            >
              <span className="mb-1 text-center font-sans text-[12px] font-semibold text-[var(--ink)] tabular-nums">
                {b.value}
              </span>
              <div
                className="w-full transition-[height,opacity] duration-300"
                style={{
                  height: `${Math.max(h, b.value > 0 ? 2 : 0)}%`,
                  /* cap the mark so a wide card doesn't turn it into a slab */
                  maxWidth: 24,
                  margin: "0 auto",
                  background: RAMP[Math.min(i, RAMP.length - 1)],
                  borderRadius: "4px 4px 0 0",
                  opacity: active === null || isActive ? 1 : 0.55,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-2 border-t border-[var(--rule)] pt-2">
        {buckets.map((b, i) => (
          <span
            key={`x-${b.label}`}
            className="flex-1 text-center font-sans text-[11px] tabular-nums"
            style={{ color: active === i ? "var(--ink)" : "var(--faint)" }}
          >
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}
