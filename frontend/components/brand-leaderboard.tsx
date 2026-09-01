import { BarCell } from "@/components/bar-cell";
import type { BrandMetricRow } from "@/lib/metrics/types";

/**
 * Every tracked brand ranked by share of voice — the competitive picture the
 * Overview's own-brand KPIs deliberately leave out.
 *
 * Rank is computed from the brands that HAVE a share, not from the array
 * index: a brand with no data must not silently occupy 4th place and imply it
 * was beaten. Those rows sort to the bottom and show their real state.
 */
export function BrandLeaderboard({ rows }: { rows: BrandMetricRow[] }) {
  if (!rows.length) {
    return (
      <p className="m-0 font-sans text-[13px] text-[var(--muted-2)]">
        No brands tracked yet.
      </p>
    );
  }

  const ranked = [...rows].sort((a, b) => (b.sov.value ?? -1) - (a.sov.value ?? -1));
  const maxSov = Math.max(1, ...ranked.map((r) => r.sov.value ?? 0));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: 440 }}>
        <thead>
          <tr className="border-b border-[var(--border)]">
            {["#", "Brand", "Share of voice", "Visibility", "Mentions"].map((h, i) => (
              <th
                key={h}
                className={`px-3 py-2 font-sans text-[10.5px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase ${
                  i <= 1 ? "text-left" : "text-right"
                } ${i > 1 ? "border-l border-[var(--border)]" : ""}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ranked.map((r, i) => {
            const scored = r.sov.value !== null;
            return (
              <tr
                key={r.brandId}
                className="border-b border-[var(--border)] last:border-b-0"
                style={{ opacity: scored ? 1 : 0.55 }}
              >
                <td className="px-3 py-2.5 font-sans text-[12px] text-[var(--faint)] tabular-nums">
                  {scored ? i + 1 : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <span
                      className="truncate font-sans text-[12.5px]"
                      style={{ color: "var(--ink)", fontWeight: !r.isCompetitor ? 600 : 400 }}
                    >
                      {r.name}
                    </span>
                    {!r.isCompetitor && (
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
                    value={r.sov.value}
                    max={maxSov}
                    label={r.sov.value === null ? undefined : `${r.sov.value}%`}
                    tone={!r.isCompetitor ? "own" : "neutral"}
                  />
                </td>
                <td className="border-l border-[var(--border)] px-3 py-2.5 text-right font-sans text-[12.5px] tabular-nums">
                  {r.visibility.value === null ? (
                    <span className="text-[var(--faint)]">—</span>
                  ) : (
                    `${r.visibility.value}%`
                  )}
                </td>
                <td className="border-l border-[var(--border)] px-3 py-2.5 text-right font-sans text-[12.5px] text-[var(--muted-2)] tabular-nums">
                  {r.mentionCount}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
