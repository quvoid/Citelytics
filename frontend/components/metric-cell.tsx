import { formatDelta, METRIC_DELTA_UNIT } from "@/lib/metrics/delta";
import type { MetricCell, MetricKey, MetricValue } from "@/lib/metrics/types";

export function formatMetric(metric: MetricKey, value: number | null): string {
  if (value === null) return "—";
  if (metric === "position") return `#${value.toFixed(1)}`;
  if (metric === "sentiment") return String(Math.round(value));
  return `${value}%`;
}

/** Why a value is missing, in the tooltip — so an em dash is never mysterious. */
function absenceReason(v: MetricValue): string {
  if (v.suppressed) {
    return v.support.observations > 0
      ? `Only ${v.support.observations} observation(s) — too few to report a reliable average.`
      : `Only ${v.support.responses} answer(s) in this period — too few to report a reliable rate.`;
  }
  if (v.support.responses === 0) return "No answers captured for this brand in this period.";
  return "This brand was never named in the answers captured for this period.";
}

/**
 * One value plus its change. Exists so a delta can never render inconsistently
 * across pages — in particular so a falling POSITION always reads as an
 * improvement (green, downward), which is the single easiest thing for a
 * dashboard to get backwards.
 */
export function MetricCellView({
  metric,
  cell,
  size = "md",
  align = "start",
}: {
  metric: MetricKey;
  cell: MetricCell;
  size?: "sm" | "md" | "lg";
  /** This is a FLEX row, so a `text-align` on the parent cell does nothing to
   *  it — that mismatch is exactly why the brands table's headers sat right
   *  while their values sat left. Alignment has to be passed in. */
  align?: "start" | "center" | "end";
}) {
  const text = formatDelta(metric, cell.delta);
  const color =
    cell.delta.polarity === "good"
      ? "var(--green)"
      : cell.delta.polarity === "bad"
        ? "var(--red)"
        : "var(--faint)";

  const valueSize = size === "lg" ? "text-[26px]" : size === "sm" ? "text-[14px]" : "text-[17px]";

  const justify =
    align === "center" ? "justify-center" : align === "end" ? "justify-end" : "justify-start";

  return (
    <div className={`flex items-baseline gap-1.5 whitespace-nowrap ${justify}`}>
      <span
        className={`font-sans ${valueSize} leading-none font-semibold tracking-[-0.02em] tabular-nums whitespace-nowrap`}
        style={{ color: cell.value === null ? "var(--faint)" : "var(--ink)" }}
        title={cell.value === null ? absenceReason(cell) : undefined}
      >
        {formatMetric(metric, cell.value)}
        {metric === "sentiment" && cell.value !== null && (
          <span className="ml-0.5 whitespace-nowrap text-[0.65em] font-normal text-[var(--faint)]">/100</span>
        )}
      </span>
      {text && (
        <span
          className="font-sans text-[11px] font-medium tabular-nums"
          style={{ color }}
          title={
            cell.delta.basis === "compared"
              ? `Previous period: ${formatMetric(metric, cell.delta.previous)} (${METRIC_DELTA_UNIT[metric]})`
              : cell.delta.basis === "new"
                ? "Not present in the previous period"
                : "Present in the previous period, absent now"
          }
        >
          {text}
        </span>
      )}
    </div>
  );
}
