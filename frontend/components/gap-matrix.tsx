import type { GapMatrix } from "@/lib/metrics/types";

/**
 * The named/cited quadrant — Peec's most-reused lens. A fixed 2x2, not
 * axis-driven like SegmentHeatmap (this shape never changes), built from
 * sums the brand RPCs already return (migration 0016's cited_domain_count /
 * both_count) rather than a separate query.
 */
export function GapMatrixView({ matrix }: { matrix: GapMatrix | null }) {
  if (!matrix || matrix.totalResponses === 0) {
    return (
      <p className="font-sans text-[13px] text-[var(--muted-2)]">
        Not enough data yet to place your brand on this matrix.
      </p>
    );
  }

  const pct = (n: number) => (matrix.totalResponses ? Math.round((n / matrix.totalResponses) * 100) : 0);

  const cells: {
    key: string;
    count: number;
    title: string;
    subtitle: string;
    tint: string;
    tintFg: string;
  }[] = [
    {
      key: "namedAndCited",
      count: matrix.namedAndCited,
      title: "Named + Cited",
      subtitle: "AI trusts both your name and your content",
      tint: "var(--tint-mint)",
      tintFg: "var(--tint-mint-fg)",
    },
    {
      key: "namedNotCited",
      count: matrix.namedNotCited,
      title: "Named, not Cited",
      subtitle: "AI trusts your name — never looked at your site",
      tint: "var(--tint-sky)",
      tintFg: "var(--tint-sky-fg)",
    },
    {
      key: "citedNotNamed",
      count: matrix.citedNotNamed,
      title: "Cited, not Named",
      subtitle: "Real content-authority gap — cited but unrecognized",
      tint: "var(--tint-peach)",
      tintFg: "var(--tint-peach-fg)",
    },
    {
      key: "neither",
      count: matrix.neither,
      title: "Neither",
      subtitle: "Not named, not cited, in this period",
      tint: "var(--muted)",
      tintFg: "var(--muted-foreground)",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {cells.map((c) => (
        <div
          key={c.key}
          className="rounded-[10px] p-3.5"
          style={{ background: c.tint }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-sans text-[12.5px] font-semibold" style={{ color: c.tintFg }}>
              {c.title}
            </span>
            <span className="font-sans text-[20px] font-semibold tabular-nums" style={{ color: c.tintFg }}>
              {pct(c.count)}%
            </span>
          </div>
          <p className="m-0 mt-1 font-sans text-[11px]" style={{ color: c.tintFg, opacity: 0.85 }}>
            {c.subtitle} · {c.count} answer(s)
          </p>
        </div>
      ))}
    </div>
  );
}
