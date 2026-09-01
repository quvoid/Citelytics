import type { ShareOfSearchRow } from "@/lib/fanout-analysis";

/**
 * Share of the engines' OWN background sub-searches that name each brand.
 *
 * Kept visually distinct from share of voice on purpose: these two answer
 * different questions and sit next to each other on the Overview. Share of
 * voice counts who the engine recommended; this counts who it went looking
 * for before it wrote anything. A brand can lead one and trail the other,
 * and that difference is the interesting part.
 */
export function ShareOfSearchBars({
  rows,
  totalSearches,
  brandedSearches,
}: {
  rows: ShareOfSearchRow[];
  totalSearches: number;
  brandedSearches: number;
}) {
  const shown = rows.filter((r) => r.searches > 0);

  if (!totalSearches || !shown.length) {
    return (
      <p className="m-0 font-sans text-[13px] text-[var(--muted-2)]">
        No engine exposed its sub-searches in this period. Gemini reports them through its
        grounding tool; ChatGPT only through its real web-search API.
      </p>
    );
  }

  const max = Math.max(1, ...shown.map((r) => r.searches));
  const brandedPct = Math.round((brandedSearches / totalSearches) * 100);

  return (
    <div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {shown.map((r) => (
          <li key={r.name} className="flex items-center gap-3">
            <span
              className="w-[90px] flex-none truncate font-sans text-[12.5px]"
              style={{
                color: r.isOwn ? "var(--ink)" : "var(--muted-2)",
                fontWeight: r.isOwn ? 600 : 400,
              }}
            >
              {r.name}
            </span>
            <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${(r.searches / max) * 100}%`,
                  background: r.isOwn ? "var(--ember)" : "var(--tint-sky-fg)",
                  opacity: r.isOwn ? 1 : 0.4,
                }}
              />
            </span>
            <span className="w-[84px] flex-none text-right font-sans text-[12px] text-[var(--muted-2)] tabular-nums">
              {r.searches}
              <span className="text-[var(--faint)]"> · {r.sharePct ?? 0}%</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 mb-0 font-sans text-[11.5px] text-[var(--faint)] tabular-nums">
        {brandedPct}% of {totalSearches} sub-searches name a tracked brand.
      </p>
    </div>
  );
}
