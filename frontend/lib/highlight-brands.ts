/** Pure text-segmentation for the answer viewer — no React here, so it's
 * trivial to unit test and impossible to accidentally couple to rendering.
 *
 * Brand names are matched case-insensitively, longest name first (so
 * "OnePlus Nord" can't get split by a shorter "OnePlus" match landing first
 * and eating half the string). This is a plain substring match, not a
 * word-boundary regex — brand names routinely contain apostrophes ("L'Oréal")
 * and spaces that make `\b` unreliable, and a stray false match inside a
 * longer unrelated word is a cosmetic risk, not a data risk (nothing downstream
 * reads these segments as ground truth — the real mention/position data comes
 * from answer_brand_mentions, this is just where in the prose to draw a box).
 */

export type RankedBrand = {
  name: string;
  isOwn: boolean;
  /** 1-indexed order this brand was first mentioned, from answer_brand_mentions.position. */
  position: number;
  /** 0-100, null when this brand/response predates per-brand sentiment (migration 0010's backfill hasn't reached it yet). */
  sentiment: number | null;
};

export type HighlightSegment =
  | { kind: "text"; text: string }
  | { kind: "brand"; text: string; brand: RankedBrand };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightBrands(text: string | null, brands: RankedBrand[]): HighlightSegment[] {
  const safe = text ?? "";
  if (!safe || !brands.length) return safe ? [{ kind: "text", text: safe }] : [];

  const byLower = new Map(brands.map((b) => [b.name.toLowerCase(), b]));
  const pattern = [...byLower.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  if (!pattern) return [{ kind: "text", text: safe }];

  const re = new RegExp(`(${pattern})`, "gi");
  const segments: HighlightSegment[] = [];
  let last = 0;

  for (const m of safe.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) segments.push({ kind: "text", text: safe.slice(last, idx) });
    const brand = byLower.get(m[0].toLowerCase());
    segments.push(
      brand ? { kind: "brand", text: m[0], brand } : { kind: "text", text: m[0] },
    );
    last = idx + m[0].length;
  }
  if (last < safe.length) segments.push({ kind: "text", text: safe.slice(last) });
  return segments;
}
