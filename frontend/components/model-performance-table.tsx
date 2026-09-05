import { BarCell } from "@/components/bar-cell";
import { EngineLabel } from "@/components/engine-icons";
import type { MetricCell } from "@/lib/metrics/types";

export type ModelRow = {
  engineId: string;
  engineName: string;
  visibility: MetricCell;
  sov: MetricCell;
  mentionCount: number;
  position: MetricCell;
  responses: number;
};

/**
 * Your own brand's performance broken out per answer engine.
 *
 * The comparison that matters here is BETWEEN engines, so each numeric column
 * is normalised against its own column max (see BarCell) — Gemini's share is
 * read against ChatGPT's share, not against 100%. Engines that answered too
 * few prompts to say anything still get a row, showing their response count
 * and an em dash, because "we barely asked this engine" is different
 * information from "this engine never mentions you".
 */
export function ModelPerformanceTable({ rows }: { rows: ModelRow[] }) {
  if (!rows.length) {
    return (
      <p className="m-0 font-sans text-[13px] text-[var(--muted-2)]">
        No engine has answered a tracked prompt in this period yet.
      </p>
    );
  }

  const maxSov = Math.max(1, ...rows.map((r) => r.sov.value ?? 0));
  const maxVis = Math.max(1, ...rows.map((r) => r.visibility.value ?? 0));
  const maxMentions = Math.max(1, ...rows.map((r) => r.mentionCount));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: 520 }}>
        <thead>
          <tr className="border-b border-[var(--border)]">
            {["Model", "Share of voice", "Visibility", "Mentions", "Avg. position"].map((h, i) => (
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
          {rows.map((r) => (
            <tr key={r.engineId} className="border-b border-[var(--border)] last:border-b-0">
              <td className="px-3 py-2.5">
                <EngineLabel name={r.engineName} size={15} />
              </td>
              <td className="border-l border-[var(--border)] px-3 py-2.5">
                <BarCell
                  value={r.sov.value}
                  max={maxSov}
                  label={r.sov.value === null ? undefined : `${r.sov.value}%`}
                  title={`${r.responses} answers captured from this engine`}
                />
              </td>
              <td className="border-l border-[var(--border)] px-3 py-2.5">
                <BarCell
                  value={r.visibility.value}
                  max={maxVis}
                  label={r.visibility.value === null ? undefined : `${r.visibility.value}%`}
                />
              </td>
              <td className="border-l border-[var(--border)] px-3 py-2.5">
                <BarCell value={r.mentionCount} max={maxMentions} />
              </td>
              <td className="border-l border-[var(--border)] px-3 py-2.5 text-right">
                <span
                  className="font-sans text-[12.5px] font-medium tabular-nums"
                  style={{ color: r.position.value === null ? "var(--faint)" : "var(--ink)" }}
                >
                  {r.position.value === null ? "—" : `#${r.position.value.toFixed(1)}`}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
