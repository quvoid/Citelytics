import { formatMetric } from "@/components/metric-cell";
import type { SegmentMatrix } from "@/lib/metrics/types";

/** Blue ramp, low -> high. Position inverts (lower is better) so the strong
 *  end of the scale always means "good", never "big". */
function intensity(matrix: SegmentMatrix, value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  const t = (value - min) / (max - min);
  return matrix.metric === "position" ? 1 - t : t;
}

/**
 * Topic x Tag performance matrix.
 *
 * Cells are RATES only, and there is deliberately no total row or column: a
 * prompt carrying three tags contributes to three cells, which is correct for
 * a rate (each cell has its own denominator) and flatly wrong for a count
 * (columns would sum past the real total). The `ratesOnly` flag on the type
 * exists to keep that constraint visible rather than buried in a comment.
 */
export function SegmentHeatmap({
  matrix,
  switchAxisHref,
}: {
  matrix: SegmentMatrix;
  switchAxisHref?: string;
}) {
  const byKey = new Map(matrix.cells.map((c) => [`${c.rowKey}|${c.colKey}`, c.value]));
  const values = matrix.cells
    .map((c) => c.value.value)
    .filter((v): v is number => v !== null);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;

  if (!matrix.rowKeys.length || !matrix.colKeys.length) {
    return (
      <p className="px-5 py-8 text-center font-sans text-[13px] text-[var(--muted-2)]">
        Not enough segmented data yet — this fills in once prompts carry topics and tags.
      </p>
    );
  }

  const cols = `minmax(120px, 1.1fr) repeat(${matrix.colKeys.length}, minmax(90px, 1fr))`;

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 120 + matrix.colKeys.length * 90 }}>
        <div className="grid items-end gap-1.5 pb-2" style={{ gridTemplateColumns: cols }}>
          <div className="flex items-center gap-2">
            <span className="font-sans text-[11px] font-medium tracking-[0.08em] text-[var(--muted-2)] uppercase">
              {matrix.rowAxis}
            </span>
            {switchAxisHref && (
              <a
                href={switchAxisHref}
                className="rounded-full border border-[var(--border)] px-2 py-0.5 font-sans text-[11px] text-[var(--muted-2)] no-underline"
                title="Swap rows and columns"
              >
                switch
              </a>
            )}
          </div>
          {matrix.colKeys.map((c) => (
            <div key={c.key} className="text-center">
              <div className="truncate font-sans text-[11.5px] font-medium text-[var(--ink)]" title={c.label}>
                {c.label}
              </div>
              {/* Prompt counts are shown because overlapping tags are invisible
                  otherwise — two tags covering the same four prompts look like
                  two independent segments until you see the counts. */}
              <div className="font-sans text-[11px] text-[var(--faint)]">{c.promptCount} prompts</div>
            </div>
          ))}
        </div>

        {matrix.rowKeys.map((r) => (
          <div key={r.key} className="grid gap-1.5 pb-1.5" style={{ gridTemplateColumns: cols }}>
            <div
              className="flex items-center truncate font-sans text-[12px] text-[var(--ink)]"
              title={`${r.label} — ${r.promptCount} prompts`}
            >
              {r.label}
            </div>
            {matrix.colKeys.map((c) => {
              const v = byKey.get(`${r.key}|${c.key}`);
              // A missing pair is an empty cell, never a zero — those two
              // states mean different things and must not look alike.
              if (!v || v.value === null) {
                return (
                  <div
                    key={c.key}
                    className="rounded-[6px] py-2 text-center font-sans text-[12px] text-[var(--faint)]"
                    style={{ background: "var(--muted)" }}
                    title="No data for this combination"
                  >
                    –
                  </div>
                );
              }
              const t = intensity(matrix, v.value, min, max);
              return (
                <div
                  key={c.key}
                  className="rounded-[6px] py-2 text-center font-sans text-[12px] font-semibold tabular-nums"
                  style={{
                    background: `color-mix(in srgb, var(--tint-sky-fg) ${Math.round(12 + t * 78)}%, white)`,
                    color: t > 0.55 ? "#fff" : "var(--ink)",
                  }}
                  title={`${r.label} × ${c.label} — ${v.support.responses} answers`}
                >
                  {formatMetric(matrix.metric, v.value)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
