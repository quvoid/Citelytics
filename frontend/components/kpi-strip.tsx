import { EngineLabel } from "@/components/engine-icons";
import { MetricCellView } from "@/components/metric-cell";
import type { BrandEngineBreakdown, BrandMetricRow, MetricKey } from "@/lib/metrics/types";

const KPIS: { key: MetricKey; label: string; hint: string }[] = [
  { key: "visibility", label: "Visibility", hint: "Share of answers that name you" },
  { key: "sentiment", label: "Sentiment", hint: "Average tone toward you, 0–100" },
  { key: "position", label: "Position", hint: "Average rank when you are named" },
  { key: "sov", label: "Share of voice", hint: "Your share of all tracked brand mentions" },
];

function Tile({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[var(--radius-lg)] bg-[var(--card)] px-4 py-3.5"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {children}
    </div>
  );
}

export function KpiStrip({
  brand,
  breakdown,
}: {
  brand: BrandMetricRow;
  breakdown: BrandEngineBreakdown | null;
}) {
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {KPIS.map((k) => (
        <Tile key={k.key}>
          <div
            className="font-sans text-[11px] font-medium text-[var(--muted-2)]"
            title={k.hint}
          >
            {k.label}
          </div>
          <div className="mt-2">
            <MetricCellView metric={k.key} cell={brand[k.key]} size="lg" />
          </div>
        </Tile>
      ))}

      {/* Strongest/weakest deliberately render "—" rather than crowning a
          winner when fewer than two engines cleared the support threshold.
          Naming a best model off one observation is worse than saying nothing. */}
      <Tile>
        <div className="font-sans text-[11px] font-medium text-[var(--muted-2)]">
          Strongest model
        </div>
        <div className="mt-2 font-sans text-[15px] font-semibold">
          {breakdown?.strongest ? (
            <EngineLabel name={breakdown.strongest.engineName} />
          ) : (
            <span className="text-[var(--faint)]" title="Needs at least two models with enough data to compare">
              —
            </span>
          )}
        </div>
      </Tile>

      <Tile>
        <div className="font-sans text-[11px] font-medium text-[var(--muted-2)]">Weakest model</div>
        <div className="mt-2 font-sans text-[15px] font-semibold">
          {breakdown?.weakest ? (
            <EngineLabel name={breakdown.weakest.engineName} />
          ) : (
            <span className="text-[var(--faint)]" title="Needs at least two models with enough data to compare">
              —
            </span>
          )}
        </div>
      </Tile>
    </section>
  );
}
