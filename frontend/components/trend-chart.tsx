"use client";

import { useId, useMemo, useState } from "react";

export type TrendPoint = { day: string; value: number };

/** Rounds the axis top up to a clean number so ticks read 0 / 30 / 60 / 90
 * rather than 0 / 26.25 / 52.5. */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (v <= step * mag) return step * mag;
  }
  return 10 * mag;
}

const PLOT_H = 190;
const TICKS = 4;

/**
 * Area + line chart for a single series over fetch days.
 *
 * The SVG carries only the fill and the stroke, drawn in a 0..100 x 0..100
 * space with preserveAspectRatio="none" so it stretches to any container
 * width; `vector-effect: non-scaling-stroke` keeps the line a true 2px
 * through that stretch. Dots, labels and the crosshair are absolutely
 * positioned HTML at percentage offsets instead of SVG elements — under a
 * non-uniform stretch an SVG <circle> would render as an ellipse.
 *
 * One series, so no legend: the card title names what is plotted.
 */
export function TrendChart({ points, unit = "citations" }: { points: TrendPoint[]; unit?: string }) {
  const gradientId = useId();
  const [active, setActive] = useState<number | null>(null);

  const { max, xFor, yFor, areaPath, linePath, maxIndex } = useMemo(() => {
    const values = points.map((p) => p.value);
    const rawMax = Math.max(1, ...values);
    const max = niceCeil(rawMax);
    const xFor = (i: number) => (points.length === 1 ? 50 : (i / (points.length - 1)) * 100);
    const yFor = (v: number) => 100 - (v / max) * 100;

    const line = points.map((p, i) => `${i ? "L" : "M"}${xFor(i).toFixed(3)},${yFor(p.value).toFixed(3)}`).join(" ");
    const area = points.length
      ? `${line} L${xFor(points.length - 1).toFixed(3)},100 L${xFor(0).toFixed(3)},100 Z`
      : "";
    return {
      max,
      xFor,
      yFor,
      areaPath: area,
      linePath: line,
      maxIndex: values.indexOf(rawMax),
    };
  }, [points]);

  if (!points.length) return null;

  const lastIndex = points.length - 1;
  const activePoint = active === null ? null : points[active];

  return (
    <div>
      <div className="relative" style={{ height: PLOT_H }}>
        {/* gridlines + tick labels: hairline, solid, one step off surface */}
        {Array.from({ length: TICKS + 1 }, (_, t) => {
          const frac = t / TICKS;
          return (
            <div key={t} className="absolute inset-x-0 flex items-center" style={{ top: `${frac * 100}%` }}>
              <span className="w-9 shrink-0 pr-2 text-right font-sans text-[10.5px] text-[var(--faint)] tabular-nums">
                {Math.round(max * (1 - frac))}
              </span>
              <span className="h-px flex-1" style={{ background: "var(--rule-light)" }} />
            </div>
          );
        })}

        {/* plot area, inset past the tick gutter */}
        <div className="absolute inset-y-0 right-0 left-9">
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--ember)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--ember)" stopOpacity="0.01" />
              </linearGradient>
            </defs>
            {points.length > 1 && <path d={areaPath} fill={`url(#${gradientId})`} />}
            {points.length > 1 && (
              <path
                d={linePath}
                fill="none"
                stroke="var(--ember)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* crosshair sits under the dots so it never covers one */}
          {active !== null && (
            <span
              className="pointer-events-none absolute top-0 bottom-0 w-px"
              style={{ left: `${xFor(active)}%`, background: "var(--rule)" }}
            />
          )}

          {points.map((p, i) => {
            const isEdge = i === maxIndex || i === lastIndex;
            return (
              <span
                key={p.day}
                className="pointer-events-none absolute block rounded-full"
                style={{
                  left: `${xFor(i)}%`,
                  top: `${yFor(p.value)}%`,
                  width: active === i || isEdge ? 9 : 7,
                  height: active === i || isEdge ? 9 : 7,
                  transform: "translate(-50%, -50%)",
                  background: "var(--ember)",
                  /* 2px surface ring keeps the dot legible on the line */
                  boxShadow: "0 0 0 2px var(--card)",
                }}
              />
            );
          })}

          {/* direct labels, selective: the peak and the latest only */}
          {points.map((p, i) => {
            if (i !== maxIndex && i !== lastIndex) return null;
            const y = yFor(p.value);
            // A point near the plot's ceiling has no room above it — flipping
            // the label under the dot keeps it inside the card instead of
            // colliding with the heading above.
            const below = y < 16;
            const dx = i === lastIndex && points.length > 1 && i !== 0 ? "-85%" : "-50%";
            return (
              <span
                key={`l-${p.day}`}
                className="pointer-events-none absolute font-sans text-[11.5px] font-semibold text-[var(--ink)] tabular-nums"
                style={{
                  left: `${xFor(i)}%`,
                  top: `${y}%`,
                  transform: `translate(${dx}, ${below ? "70%" : "-185%"})`,
                  whiteSpace: "nowrap",
                }}
              >
                {p.value}
              </span>
            );
          })}

          {/* hit targets: full-height columns, so the pointer only has to be
              near the right X — never land on a 7px dot */}
          <div className="absolute inset-0 flex">
            {points.map((p, i) => (
              <button
                key={`hit-${p.day}`}
                type="button"
                aria-label={`${p.day}: ${p.value} ${unit}`}
                className="h-full flex-1 cursor-default border-0 bg-transparent p-0"
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            ))}
          </div>

          {/* tooltip: value leads, label follows */}
          {activePoint && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-[10px] border border-[var(--rule)] bg-[var(--card)] px-2.5 py-1.5"
              style={{
                left: `${xFor(active!)}%`,
                top: `${yFor(activePoint.value)}%`,
                marginTop: -14,
                transform: "translate(-50%, -100%)",
                boxShadow: "var(--shadow-pop)",
              }}
            >
              <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                <span className="h-[2px] w-3 rounded-full" style={{ background: "var(--ember)" }} />
                <span className="font-sans text-[13px] font-semibold text-[var(--ink)] tabular-nums">
                  {activePoint.value}
                </span>
                <span className="font-sans text-[11px] text-[var(--muted-2)]">{unit}</span>
              </div>
              <div className="mt-0.5 font-sans text-[10.5px] text-[var(--faint)] tabular-nums">
                {activePoint.day}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex border-t border-[var(--rule)] pt-2.5 pl-9">
        {points.map((p, i) => (
          <span
            key={`x-${p.day}`}
            className="flex-1 text-center font-sans text-[11px] tabular-nums"
            style={{ color: active === i ? "var(--ink)" : "var(--faint)" }}
          >
            {p.day.slice(5)}
          </span>
        ))}
      </div>
    </div>
  );
}
