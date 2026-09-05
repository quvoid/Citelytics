"use client";

import { useId, useMemo, useState } from "react";
import { formatMetric } from "@/components/metric-cell";
import type { BrandSeries, MetricKey } from "@/lib/metrics/types";

/** Rounds the axis top up to a clean number — same helper as trend-chart.tsx. */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (v <= step * mag) return step * mag;
  }
  return 10 * mag;
}

const PLOT_H = 220;
const TICKS = 4;

/** Same CVD-safe palette as app/perception/page.tsx's radar, reused here so
 * a brand's identity colour stays consistent across the app rather than
 * each chart inventing its own. Own brand always gets the accent colour and
 * renders first/on top, regardless of sort order in the data. */
const SERIES_COLORS = ["var(--ember)", "var(--tint-lavender-fg)", "var(--tint-mint-fg)", "#1c7ed6", "#d1355a", "#8C8478"];

/**
 * Multi-brand trend line — Peec's Performance page headline visual ("your
 * brand and top competitors" over time), built from getBrandTimeSeries()
 * (existing since round 1; this component is the only reason it went
 * unused). Same hand-rolled-SVG grammar as trend-chart.tsx (gridlines,
 * absolutely-positioned hit-target columns, tooltip) generalised to N
 * series, plus a legend — the single-series version deliberately skips a
 * legend because with one series the card title already says what's
 * plotted; that reasoning doesn't hold once there's more than one line.
 *
 * A null point is a GAP, not a zero (see lib/metrics/api.ts's series
 * builder) — each series' line is drawn as separate path segments that
 * break at every null, never interpolated across one.
 */
export function MultiTrendChart({
  series,
  metric,
}: {
  series: BrandSeries[];
  metric: MetricKey;
}) {
  const gradientId = useId();
  const [active, setActive] = useState<number | null>(null);

  const buckets = series[0]?.points ?? [];
  const n = buckets.length;

  const { max, xFor, yFor, segmentsBySeries } = useMemo(() => {
    const allValues = series.flatMap((s) => s.points.map((p) => p.value)).filter((v): v is number => v !== null);
    const rawMax = Math.max(1, ...allValues);
    const max = niceCeil(rawMax);
    const xFor = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
    const yFor = (v: number) => 100 - (v / max) * 100;

    // Break into contiguous non-null runs so a gap truly breaks the line
    // instead of a straight segment silently bridging over missing days.
    //
    // Each run carries its OWN x extent. The area fill used to close every
    // segment back to the chart's first and last column, so a short run of
    // days near one edge painted a wedge across the whole plot — data that
    // did not exist, drawn as if it did.
    const segmentsBySeries = series.map((s) => {
      const segments: { d: string; x0: number; x1: number }[] = [];
      // A run of ONE point has no line to draw; kept separately and rendered
      // as a dot, because dropping it (the old behaviour) made a brand with a
      // single day of data render as nothing at all.
      const dots: { x: number; y: number }[] = [];
      let run: { i: number; v: number }[] = [];

      const flush = () => {
        if (run.length === 1) {
          dots.push({ x: xFor(run[0].i), y: yFor(run[0].v) });
        } else if (run.length > 1) {
          segments.push({
            d: run
              .map((p, k) => `${k ? "L" : "M"}${xFor(p.i).toFixed(3)},${yFor(p.v).toFixed(3)}`)
              .join(" "),
            x0: xFor(run[0].i),
            x1: xFor(run[run.length - 1].i),
          });
        }
        run = [];
      };

      s.points.forEach((p, i) => {
        if (p.value === null) {
          flush();
          return;
        }
        run.push({ i, v: p.value });
      });
      flush();
      return { segments, dots };
    });

    return { max, xFor, yFor, segmentsBySeries };
  }, [series, n]);

  if (!series.length || n === 0) {
    return <p className="font-sans text-[13px] text-[var(--muted-2)]">No data in this period yet.</p>;
  }

  // Own brand first/accented regardless of input order.
  const ordered = [...series].sort((a, b) => Number(a.isCompetitor) - Number(b.isCompetitor));
  const colorFor = (s: BrandSeries) => SERIES_COLORS[ordered.indexOf(s) % SERIES_COLORS.length];

  return (
    <div>
      <div className="relative" style={{ height: PLOT_H }}>
        {Array.from({ length: TICKS + 1 }, (_, t) => {
          const frac = t / TICKS;
          return (
            <div key={t} className="absolute inset-x-0 flex items-center" style={{ top: `${frac * 100}%` }}>
              <span className="w-9 shrink-0 pr-2 text-right font-sans text-[11px] text-[var(--faint)] tabular-nums">
                {Math.round(max * (1 - frac))}
              </span>
              <span className="h-px flex-1" style={{ background: "var(--rule-light)" }} />
            </div>
          );
        })}

        <div className="absolute inset-y-0 right-0 left-9">
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colorFor(ordered[0])} stopOpacity="0.14" />
                <stop offset="100%" stopColor={colorFor(ordered[0])} stopOpacity="0.01" />
              </linearGradient>
            </defs>
            {ordered.map((s, si) => {
              const { segments } = segmentsBySeries[series.indexOf(s)];
              const isOwn = si === 0;
              return (
                <g key={s.brandId}>
                  {isOwn &&
                    segments.map((seg, i) => (
                      <path
                        key={`area-${i}`}
                        // Closed at this run's own edges, not the chart's.
                        d={`${seg.d} L${seg.x1.toFixed(3)},100 L${seg.x0.toFixed(3)},100 Z`}
                        fill={`url(#${gradientId})`}
                      />
                    ))}
                  {segments.map((seg, i) => (
                    <path
                      key={i}
                      d={seg.d}
                      fill="none"
                      stroke={colorFor(s)}
                      strokeWidth={isOwn ? 2.25 : 1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeOpacity={isOwn ? 1 : 0.8}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </g>
              );
            })}
          </svg>

          {/* A day that stands alone between two gaps has no line to belong
              to. Drawn as a dot in HTML rather than an SVG circle, because
              the plot uses preserveAspectRatio="none" and would squash it. */}
          {ordered.map((s) => {
            const { dots } = segmentsBySeries[series.indexOf(s)];
            return dots.map((d, i) => (
              <span
                key={`lone-${s.brandId}-${i}`}
                className="pointer-events-none absolute block rounded-full"
                style={{
                  left: `${d.x}%`,
                  top: `${d.y}%`,
                  width: 5,
                  height: 5,
                  transform: "translate(-50%, -50%)",
                  background: colorFor(s),
                }}
              />
            ));
          })}

          {active !== null && (
            <span
              className="pointer-events-none absolute top-0 bottom-0 w-px"
              style={{ left: `${xFor(active)}%`, background: "var(--rule)" }}
            />
          )}

          {ordered.map((s) => {
            const p = s.points[active ?? -1];
            if (!p || p.value === null) return null;
            return (
              <span
                key={`dot-${s.brandId}`}
                className="pointer-events-none absolute block rounded-full"
                style={{
                  left: `${xFor(active!)}%`,
                  top: `${yFor(p.value)}%`,
                  width: 7,
                  height: 7,
                  transform: "translate(-50%, -50%)",
                  background: colorFor(s),
                  boxShadow: "0 0 0 2px var(--card)",
                }}
              />
            );
          })}

          <div className="absolute inset-0 flex">
            {buckets.map((b, i) => (
              <button
                key={`hit-${b.bucketStart}`}
                type="button"
                aria-label={b.bucketStart}
                className="h-full flex-1 cursor-default border-0 bg-transparent p-0"
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            ))}
          </div>

          {active !== null && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-[10px] border border-[var(--rule)] bg-[var(--card)] px-3 py-2"
              style={{
                left: `${xFor(active)}%`,
                top: 0,
                transform: active > n / 2 ? "translate(-105%, 0)" : "translate(5%, 0)",
                boxShadow: "var(--shadow-pop)",
                minWidth: 140,
              }}
            >
              <div className="font-sans text-[11px] text-[var(--faint)] tabular-nums">
                {buckets[active].bucketStart}
              </div>
              {ordered.map((s) => {
                const p = s.points[active];
                return (
                  <div key={s.brandId} className="mt-1 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 font-sans text-[11.5px] text-[var(--ink)]">
                      <span className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: colorFor(s) }} />
                      {s.name}
                    </span>
                    <span className="font-sans text-[11.5px] font-semibold text-[var(--ink)] tabular-nums">
                      {p ? formatMetric(metric, p.value) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Every bucket keeps its column so the labels stay aligned with the
          plot, but only every Nth prints text. A month of daily buckets gives
          each column ~14px against a 5-character date, which wrapped the row
          into an unreadable two-line stack. The hovered bucket always shows
          its own label, so precision is a pointer away. */}
      {/* Labels sit on the PLOT's scale (xFor), not on equal flex bands.
          Those are different geometries: a line chart runs edge-to-edge so
          point i is at i/(n-1), while flex bands centre it at (i+0.5)/n.
          With 5 buckets that put the final point at 100% and its label at
          90%, so the last week's data appeared to float past its own date.
          End labels anchor inward so they cannot overflow the plot box. */}
      <div className="mt-2.5 border-t border-[var(--rule)] pt-2.5 pl-9">
        <div className="relative h-[14px]">
          {buckets.map((b, i) => {
            const stride = Math.max(1, Math.ceil(n / 8));
            const show = active === i || i % stride === 0 || i === n - 1;
            if (!show) return null;
            const anchor =
              i === 0 ? "translateX(0)" : i === n - 1 ? "translateX(-100%)" : "translateX(-50%)";
            return (
              <span
                key={`x-${b.bucketStart}`}
                className="absolute top-0 font-sans text-[11px] whitespace-nowrap tabular-nums"
                style={{
                  left: `${xFor(i)}%`,
                  transform: anchor,
                  color: active === i ? "var(--ink)" : "var(--faint)",
                }}
              >
                {b.bucketStart.slice(5)}
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        {ordered.map((s) => (
          <span key={s.brandId} className="flex items-center gap-1.5 font-sans text-[11px] text-[var(--muted-2)]">
            <span className="inline-block h-[8px] w-[8px] rounded-full" style={{ background: colorFor(s) }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
