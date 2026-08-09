/** The trend channel of a stat tile — a full-bleed area anchored to the
 * card's bottom edge, rather than a small mark competing with the value for
 * the same line. Axis-less and label-less by design: the tile's value and
 * delta carry the numbers, this only has to show shape.
 *
 * Drawn in a 0..100 square with preserveAspectRatio="none" so it stretches to
 * the card width, with a non-scaling stroke so the line stays a true 1.75px
 * through that stretch. No end-dot: a circle under a non-uniform stretch
 * renders as an ellipse.
 *
 * Renders nothing below two points — one reading drawn as a line asserts a
 * trend the data doesn't support. */
export function Sparkline({
  values,
  accent = "var(--ember)",
  height = 34,
}: {
  values: (number | null)[];
  accent?: string;
  height?: number;
}) {
  const points = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (points.length < 2) return <div style={{ height }} aria-hidden="true" />;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;
  const pad = 12;

  // A constant series has no shape to show. Centre it so it reads as "steady"
  // instead of pinning to the floor, where it looked like a stray rule.
  const yFor = (v: number) =>
    span === 0 ? 50 : pad + (1 - (v - min) / span) * (100 - pad * 2);

  const stepX = 100 / (points.length - 1);
  const line = points.map((v, i) => `${i ? "L" : "M"}${(i * stepX).toFixed(3)},${yFor(v).toFixed(3)}`).join(" ");
  const area = `${line} L100,100 L0,100 Z`;

  return (
    <svg
      className="block w-full"
      style={{ height }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      /* decorative: value and delta already state the numbers */
      aria-hidden="true"
      focusable="false"
    >
      <path d={area} fill={accent} fillOpacity="0.1" />
      <path
        d={line}
        fill="none"
        stroke={accent}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
