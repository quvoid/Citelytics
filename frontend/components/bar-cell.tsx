/**
 * A number with its own magnitude bar, inside a table cell.
 *
 * This is the pattern that makes Semrush's tables readable at a glance: the
 * eye compares bar lengths down a column without parsing digits, and the exact
 * figure is still there when you need it. Scale is per-COLUMN (the caller
 * passes the column max), never per-row — a bar normalised against its own
 * row would make every row look identical and say nothing.
 */
export function BarCell({
  value,
  max,
  label,
  align = "right",
  tone = "neutral",
  title,
}: {
  /** null renders an em dash and no bar — absence is not a zero-length bar. */
  value: number | null;
  /** The column's maximum, for normalising bar width. */
  max: number;
  /** Formatted display text; defaults to the raw value. */
  label?: string;
  align?: "left" | "right";
  /** "own" tints the bar with the accent, for your own brand's row. */
  tone?: "neutral" | "own";
  title?: string;
}) {
  if (value === null) {
    return (
      <span className="font-sans text-[12.5px] text-[var(--faint)] tabular-nums" title={title}>
        —
      </span>
    );
  }
  const pct = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;

  return (
    <span
      className={`flex items-center gap-2 ${align === "right" ? "justify-end" : ""}`}
      title={title}
    >
      {align === "right" && (
        <span className="font-sans text-[12.5px] font-medium text-[var(--ink)] tabular-nums">
          {label ?? value}
        </span>
      )}
      <span
        className="h-[14px] w-[58px] flex-none overflow-hidden rounded-[3px]"
        style={{ background: "var(--muted)" }}
        aria-hidden="true"
      >
        <span
          className="block h-full rounded-[3px]"
          style={{
            width: `${pct}%`,
            background: tone === "own" ? "var(--ember)" : "var(--tint-sky-fg)",
            opacity: tone === "own" ? 1 : 0.35,
          }}
        />
      </span>
      {align === "left" && (
        <span className="font-sans text-[12.5px] font-medium text-[var(--ink)] tabular-nums">
          {label ?? value}
        </span>
      )}
    </span>
  );
}
