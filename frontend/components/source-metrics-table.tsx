import { formatMetric } from "@/components/metric-cell";
import type { SourceMetricRow } from "@/lib/metrics/types";

/**
 * Retrieved % / Retrieval Rate / Citation Rate per domain — Peec's
 * source-level metrics (see lib/metrics/source.ts for the exact
 * definitions and honesty rules).
 *
 * A separate real <table>, not three more columns bolted onto
 * SourcesTable's existing fixed-width CSS grid: that grid is already five
 * columns wide with no overflow container, and it's exactly the shape that
 * forced a page-wide horizontal scrollbar the last time this codebase
 * added columns to a fixed grid without one. `overflow-x-auto` here scopes
 * any overflow to this card, never the page — same pattern as
 * top-brands-table.tsx / prompts-table.tsx.
 */
export function SourceMetricsTable({ rows, totalResponses }: { rows: SourceMetricRow[]; totalResponses: number }) {
  return (
    <section
      className="rounded-[var(--radius-xl)] bg-[var(--card)]"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="px-4 pt-4 pb-3">
        <h2 className="m-0 font-sans text-[15px] font-semibold tracking-[-0.01em]">Source metrics</h2>
        <p className="mt-0.5 font-sans text-[12px] text-[var(--muted-2)]">
          Retrieved, Retrieval Rate, and Citation Rate across {totalResponses} AI answers
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 620 }}>
          <thead>
            <tr className="border-y border-[var(--border)] bg-[var(--muted)]">
              <th className="px-3 py-2 text-left font-sans text-[11px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase">
                Domain
              </th>
              <th
                className="px-3 py-2 text-right font-sans text-[11px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase"
                title="Share of answers where this domain showed up as a source at all"
              >
                Retrieved
              </th>
              <th
                className="px-3 py-2 text-right font-sans text-[11px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase"
                title="Average number of times this domain was cited per answer — can exceed 1"
              >
                Retrieval rate
              </th>
              <th
                className="px-3 py-2 text-right font-sans text-[11px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase"
                title="Of the times this domain was retrieved, how often the visible answer actually drew from it — vs. quiet background retrieval"
              >
                Citation rate
              </th>
              <th className="px-3 py-2 text-right font-sans text-[11px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase">
                Citations
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.domain}
                className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--muted)]"
              >
                <td className="px-3 py-2.5 font-sans text-[13px] font-medium text-[var(--ink)]">
                  {r.domain}
                </td>
                <td
                  className="px-3 py-2.5 text-right font-sans text-[13px] tabular-nums"
                  style={{ color: r.retrieved.value === null ? "var(--faint)" : "var(--ink)" }}
                  title={r.retrieved.value === null ? "Not enough data yet" : undefined}
                >
                  {formatMetric("visibility", r.retrieved.value)}
                </td>
                <td
                  className="px-3 py-2.5 text-right font-sans text-[13px] tabular-nums"
                  style={{ color: r.retrievalRate.value === null ? "var(--faint)" : "var(--ink)" }}
                >
                  {r.retrievalRate.value === null ? "—" : `${r.retrievalRate.value}×`}
                </td>
                <td
                  className="px-3 py-2.5 text-right font-sans text-[13px] tabular-nums"
                  style={{ color: r.citationRate.value === null ? "var(--faint)" : "var(--ink)" }}
                  title={
                    r.citationRate.value === null
                      ? "Unknown for every citation from this domain so far — this signal is only captured for Gemini answers, and only going forward / via the one-off backfill"
                      : `${r.citationRate.support.observations} citation(s) with a known status`
                  }
                >
                  {formatMetric("visibility", r.citationRate.value)}
                </td>
                <td className="px-3 py-2.5 text-right font-sans text-[13px] text-[var(--muted-2)] tabular-nums">
                  {r.citationCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!rows.length && (
        <p className="px-4 py-8 text-center font-sans text-[13px] text-[var(--muted-2)]">
          No sources cited yet in this period.
        </p>
      )}
    </section>
  );
}
