import { BarCell } from "@/components/bar-cell";
import type { SourceMetricRow } from "@/lib/metrics/types";

/**
 * The domains AI answers actually draw on, ranked by how often they are
 * cited, with each domain's Source Visibility beside it.
 *
 * Source Visibility is the share of this period's answers that cited the
 * domain at least once — see lib/metrics/source.ts. It is deliberately NOT
 * "share of all citations": a domain cited five times in one answer has one
 * answer's worth of influence, not five.
 */
export function SourceVisibilityTable({
  rows,
  ownDomains,
  limit = 8,
}: {
  rows: SourceMetricRow[];
  /** Your own domains, marked so you can see where you sit in the list. */
  ownDomains: Set<string>;
  limit?: number;
}) {
  if (!rows.length) {
    return (
      <p className="m-0 font-sans text-[13px] text-[var(--muted-2)]">
        No sources cited in this period yet.
      </p>
    );
  }

  const shown = rows.slice(0, limit);
  const maxCitations = Math.max(1, ...shown.map((r) => r.citationCount));
  const maxVis = Math.max(1, ...shown.map((r) => r.retrieved.value ?? 0));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: 460 }}>
        <thead>
          <tr className="border-b border-[var(--border)]">
            {["Source domain", "Source visibility", "Citations"].map((h, i) => (
              <th
                key={h}
                className={`px-3 py-2 font-sans text-[10.5px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase ${
                  i === 0 ? "text-left" : "text-right"
                } ${i > 0 ? "border-l border-[var(--border)]" : ""}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const own = ownDomains.has(r.domain);
            return (
              <tr key={r.domain} className="border-b border-[var(--border)] last:border-b-0">
                <td className="px-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="min-w-0 truncate font-sans text-[12.5px]"
                      style={{ color: "var(--ink)", fontWeight: own ? 600 : 400 }}
                    >
                      {r.domain}
                    </span>
                    {own && (
                      <span
                        className="flex-none rounded-full px-1.5 py-0.5 font-sans text-[9px] font-semibold tracking-[0.06em] uppercase"
                        style={{ background: "var(--tint-peach)", color: "var(--tint-peach-fg)" }}
                      >
                        you
                      </span>
                    )}
                  </span>
                </td>
                <td className="border-l border-[var(--border)] px-3 py-2.5">
                  <BarCell
                    value={r.retrieved.value}
                    max={maxVis}
                    label={r.retrieved.value === null ? undefined : `${r.retrieved.value}%`}
                    tone={own ? "own" : "neutral"}
                    title={
                      r.retrieved.suppressed
                        ? "Too few answers cite this domain to report a reliable rate"
                        : undefined
                    }
                  />
                </td>
                <td className="border-l border-[var(--border)] px-3 py-2.5">
                  <BarCell
                    value={r.citationCount}
                    max={maxCitations}
                    tone={own ? "own" : "neutral"}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
