import { BarCell } from "@/components/bar-cell";
import type { ReferralSurfaceRow } from "@/lib/referral-surface";

/**
 * How much clickable link surface each brand's own site gets inside AI
 * answers — the honest counterpart to a competitor "traffic" estimate.
 *
 * The distinction is stated in the UI, not just in code: this counts links
 * the engines actually placed, which we observe exactly. It is NOT visits,
 * which nobody can measure for a domain they do not own.
 */
export function ReferralSurfaceTable({
  rows,
  totalBrandCitations,
  taggedTotal,
}: {
  rows: ReferralSurfaceRow[];
  totalBrandCitations: number;
  taggedTotal: number;
}) {
  const shown = rows.filter((r) => r.citations > 0);

  if (!shown.length) {
    return (
      <p className="m-0 font-sans text-[13px] text-[var(--muted-2)]">
        No answer has cited a tracked brand&apos;s own site in this period.
      </p>
    );
  }

  const maxCitations = Math.max(1, ...shown.map((r) => r.citations));
  const maxPages = Math.max(1, ...shown.map((r) => r.distinctPages));

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 520 }}>
          <thead>
            <tr className="border-b border-[var(--border)]">
              {["Brand", "Links to their site", "Pages cited", "Answers", "Share"].map((h, i) => (
                <th
                  key={h}
                  className={`px-3 py-2 font-sans text-[11px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase ${
                    i === 0 ? "text-left" : "text-right"
                  } ${i > 0 ? "border-l border-[var(--border)]" : ""}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.brandId} className="border-b border-[var(--border)] last:border-b-0">
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <span
                      className="truncate font-sans text-[12.5px]"
                      style={{ color: "var(--ink)", fontWeight: r.isOwn ? 600 : 400 }}
                    >
                      {r.name}
                    </span>
                    {r.isOwn && (
                      <span
                        className="flex-none rounded-full px-1.5 py-0.5 font-sans text-[11px] font-semibold tracking-[0.06em] uppercase"
                        style={{ background: "var(--tint-peach)", color: "var(--tint-peach-fg)" }}
                      >
                        you
                      </span>
                    )}
                  </span>
                </td>
                <td className="border-l border-[var(--border)] px-3 py-2.5">
                  <BarCell
                    value={r.citations}
                    max={maxCitations}
                    tone={r.isOwn ? "own" : "neutral"}
                    title={
                      r.taggedCitations
                        ? `${r.taggedCitations} carry an explicit AI referral tag`
                        : undefined
                    }
                  />
                </td>
                <td className="border-l border-[var(--border)] px-3 py-2.5">
                  <BarCell
                    value={r.distinctPages}
                    max={maxPages}
                    tone={r.isOwn ? "own" : "neutral"}
                  />
                </td>
                <td className="border-l border-[var(--border)] px-3 py-2.5 text-right font-sans text-[12.5px] text-[var(--muted-2)] tabular-nums">
                  {r.answers}
                </td>
                <td className="border-l border-[var(--border)] px-3 py-2.5 text-right font-sans text-[12.5px] font-medium tabular-nums">
                  {r.sharePct === null ? "—" : `${r.sharePct}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* text-[11.5px] was under the 12px "tiny body text" floor for real
          prose (distinct from the 11px label/meta floor); max-w tightened
          too — measured 86 real chars/line at the old 66ch (Impeccable audit). */}
      <p className="mt-3 mb-0 max-w-[54ch] font-sans text-[12.5px] leading-[1.55] text-[var(--faint)]">
        Links placed, not visits received — visits to a domain you don&apos;t own cannot be
        measured, only estimated. {taggedTotal} of {totalBrandCitations} of these carry an explicit
        AI referral tag (ChatGPT tags its links; Gemini does not), so the tag is a floor on
        attribution, not the whole picture.
      </p>
    </div>
  );
}
