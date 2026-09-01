import { EngineLabel } from "@/components/engine-icons";
import type { RankingsByEngine } from "@/lib/metrics/types";

/**
 * Brands ordered by average position, per model — the "who does each engine
 * reach for first" view.
 *
 * Brands below the support threshold are listed separately as `unranked`
 * rather than being dropped or ranked last. Dropping them hides that the
 * engine knows them at all; ranking them pretends one observation is a
 * ranking.
 */
export function TopRankings({ rankings }: { rankings: RankingsByEngine[] }) {
  const widest = Math.max(1, ...rankings.map((r) => r.brands.length));
  const cols = `110px repeat(${widest}, minmax(96px, 1fr))`;

  if (!rankings.length) {
    return (
      <p className="px-5 py-8 text-center font-sans text-[13px] text-[var(--muted-2)]">
        No ranking data yet — run a fetch to capture answers.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 110 + widest * 96 }}>
        <div className="grid gap-1.5 pb-2" style={{ gridTemplateColumns: cols }}>
          <span className="font-sans text-[10.5px] font-medium tracking-[0.08em] text-[var(--muted-2)] uppercase">
            Model
          </span>
          {Array.from({ length: widest }, (_, i) => (
            <span key={i} className="text-center font-sans text-[10.5px] font-medium text-[var(--faint)]">
              #{i + 1}
            </span>
          ))}
        </div>

        {rankings.map((r) => (
          <div key={r.engineId} className="pb-2">
            <div className="grid items-center gap-1.5" style={{ gridTemplateColumns: cols }}>
              <span className="font-sans text-[12.5px] font-medium">
                <EngineLabel name={r.engineName} />
              </span>
              {Array.from({ length: widest }, (_, i) => {
                const b = r.brands[i];
                if (!b) return <span key={i} />;
                return (
                  <span
                    key={b.brandId}
                    className="truncate rounded-[6px] px-2 py-1.5 text-center font-sans text-[11.5px] font-medium"
                    style={{
                      background: b.isCompetitor ? "var(--muted)" : "var(--tint-peach)",
                      color: b.isCompetitor ? "var(--ink)" : "var(--tint-peach-fg)",
                    }}
                    title={`${b.name} — avg position #${b.position.value?.toFixed(1)} over ${b.position.support.observations} mentions`}
                  >
                    {b.name}
                  </span>
                );
              })}
            </div>

            {r.unranked.length > 0 && (
              <div className="mt-1 pl-[110px] font-sans text-[10.5px] text-[var(--faint)]">
                too few mentions to rank: {r.unranked.map((u) => u.name).join(", ")}
              </div>
            )}
          </div>
        ))}

        <div className="mt-2 flex items-center gap-3 border-t border-[var(--border)] pt-2 font-sans text-[10.5px] text-[var(--faint)]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--tint-peach-fg)" }} />
            your brand
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: "#c9c7cf" }} />
            competitors
          </span>
        </div>
      </div>
    </div>
  );
}
