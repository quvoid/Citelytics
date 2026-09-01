import { ArrowDown, ArrowUp } from "lucide-react";
import type { MetricCell, MetricKey } from "@/lib/metrics/types";
import { formatMetric } from "@/components/metric-cell";

/**
 * One headline figure and its movement — the card that opens every Semrush
 * report. Deliberately NOT the "hero metric" template of a big number over a
 * decorative accent: the delta is the point, so it gets colour, an arrow and
 * the comparison basis, while the label stays quiet.
 *
 * Absence stays absence. A metric with no data renders "—" with no delta
 * chip at all, rather than a confident 0 next to a green "+0%".
 */
export function KpiCard({
  label,
  metric,
  cell,
  hint,
  /** Optional secondary line, e.g. "5,513 of 10,344 responses". */
  sub,
}: {
  label: string;
  metric: MetricKey;
  cell: MetricCell;
  hint?: string;
  sub?: string;
}) {
  const { delta } = cell;
  const hasDelta = delta.basis === "compared" && delta.change !== null && delta.change !== 0;
  const color =
    delta.polarity === "good" ? "var(--green)" : delta.polarity === "bad" ? "var(--red)" : "var(--faint)";
  // Position falls when it improves, so the ARROW follows the raw direction
  // while the COLOUR follows whether that direction is good. Collapsing the
  // two is the classic dashboard error.
  const Arrow = delta.direction === "down" ? ArrowDown : ArrowUp;

  return (
    <div
      className="rounded-[var(--radius-lg)] bg-[var(--card)] px-4 py-3.5"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="font-sans text-[12px] font-medium text-[var(--muted-2)]" title={hint}>
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className="font-sans text-[27px] leading-none font-bold tracking-[-0.03em] tabular-nums"
          style={{ color: cell.value === null ? "var(--faint)" : "var(--ink)" }}
        >
          {formatMetric(metric, cell.value)}
        </span>
        {hasDelta && (
          <span
            className="inline-flex items-center gap-0.5 font-sans text-[11.5px] font-semibold tabular-nums"
            style={{ color }}
            title={
              delta.previous !== null
                ? `Previous period: ${formatMetric(metric, delta.previous)}`
                : undefined
            }
          >
            <Arrow size={11} strokeWidth={2.6} aria-hidden="true" />
            {Math.abs(delta.change ?? 0)}
            {metric === "position" ? "" : metric === "sentiment" ? "" : " pts"}
          </span>
        )}
      </div>
      {sub && (
        <div className="mt-1.5 font-sans text-[11.5px] text-[var(--faint)] tabular-nums">{sub}</div>
      )}
    </div>
  );
}
