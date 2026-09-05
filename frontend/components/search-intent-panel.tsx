import { Search } from "lucide-react";
import type { SearchedVsNamed, ShareOfSearchRow } from "@/lib/fanout-analysis";

/**
 * The one thing the fanout data can say that no other page can: whether the
 * engine went looking for you BY NAME before it wrote its answer.
 *
 * Framed as a coincidence rather than a cause on purpose. A prompt that says
 * "best Motorola phone" makes both the branded sub-search and the brand
 * mention nearly certain, so the gap is partly the prompts' own doing. The
 * caption says so; a number this suggestive has to carry its caveat or it
 * will be read as proof.
 */
function Rate({
  label,
  pct,
  named,
  total,
  emphasis,
}: {
  label: string;
  pct: number | null;
  named: number;
  total: number;
  emphasis: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="font-sans text-[12.5px] text-[var(--muted-2)]">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span
          className="font-sans text-[30px] leading-none font-bold tracking-[-0.03em] tabular-nums"
          style={{ color: pct === null ? "var(--faint)" : emphasis ? "var(--ember)" : "var(--ink)" }}
        >
          {pct === null ? "—" : `${pct}%`}
        </span>
        <span className="font-sans text-[11.5px] text-[var(--faint)] tabular-nums">
          {named}/{total} answers
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct ?? 0}%`,
            background: emphasis ? "var(--ember)" : "var(--muted-foreground)",
          }}
        />
      </div>
    </div>
  );
}

export function SearchIntentPanel({
  ownName,
  comparison,
  share,
  totalSearches,
  brandedSearches,
}: {
  ownName: string;
  comparison: SearchedVsNamed | null;
  share: ShareOfSearchRow[];
  totalSearches: number;
  brandedSearches: number;
}) {
  if (!comparison || totalSearches === 0) {
    return (
      <p className="m-0 font-sans text-[13px] text-[var(--muted-2)]">
        No sub-searches captured in this period yet.
      </p>
    );
  }

  const brandedPct = Math.round((brandedSearches / totalSearches) * 100);
  const maxShare = Math.max(1, ...share.map((s) => s.searches));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-col gap-5 sm:flex-row sm:gap-8">
          <Rate
            label={`Engine searched “${ownName}” first`}
            pct={comparison.searchedPct}
            named={comparison.searchedNamed}
            total={comparison.searchedTotal}
            emphasis
          />
          <Rate
            label="Engine never searched your name"
            pct={comparison.notSearchedPct}
            named={comparison.notSearchedNamed}
            total={comparison.notSearchedTotal}
            emphasis={false}
          />
        </div>
        <p className="mt-3.5 mb-0 max-w-[64ch] font-sans text-[12px] leading-[1.6] text-[var(--muted-2)]">
          {comparison.liftPoints === null ? (
            <>
              Not enough answers on both sides yet to compare these rates honestly — the split is
              shown, the gap is withheld.
            </>
          ) : (
            <>
              When the engine already has you in mind, you end up named{" "}
              <strong className="font-semibold text-[var(--ink)]">
                {comparison.liftPoints} points
              </strong>{" "}
              more often. Read it as a coincidence, not a cause: a prompt that names your brand
              makes both the branded sub-search and the mention likely on its own.
            </>
          )}
        </p>
      </div>

      <div className="border-t border-[var(--rule-light)] pt-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <span className="font-sans text-[13px] font-semibold tracking-[-0.01em]">
            Share of search
          </span>
          <span className="font-sans text-[11.5px] text-[var(--faint)] tabular-nums">
            {brandedPct}% of {totalSearches} sub-searches name a tracked brand
          </span>
        </div>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {share
            .filter((s) => s.searches > 0)
            .map((s) => (
              <li key={s.name} className="flex items-center gap-3">
                <span
                  className="w-[86px] flex-none truncate font-sans text-[12.5px]"
                  style={{
                    color: s.isOwn ? "var(--ink)" : "var(--muted-2)",
                    fontWeight: s.isOwn ? 600 : 400,
                  }}
                >
                  {s.name}
                </span>
                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${(s.searches / maxShare) * 100}%`,
                      background: s.isOwn ? "var(--ember)" : "var(--border)",
                    }}
                  />
                </span>
                <span className="w-[74px] flex-none text-right font-sans text-[11.5px] text-[var(--muted-2)] tabular-nums">
                  {s.searches}
                  <span className="text-[var(--faint)]"> · {s.sharePct ?? 0}%</span>
                </span>
              </li>
            ))}
        </ul>
        <p className="mt-3 mb-0 flex items-start gap-1.5 font-sans text-[11.5px] leading-[1.55] text-[var(--faint)]">
          <Search size={13} strokeWidth={1.9} aria-hidden="true" className="mt-0.5 flex-none" />
          <span>
            Share of search is upstream of share of voice: it counts who the engine went looking
            for, not who it ended up recommending.
          </span>
        </p>
      </div>
    </div>
  );
}
