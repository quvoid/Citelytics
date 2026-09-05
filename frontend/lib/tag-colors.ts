/**
 * Deterministic per-tag color, from the tag's name — not a stored field.
 * `tags` has no `color` column (migration 0017 never added one), and adding
 * one is a real schema change; hashing the name onto a fixed palette gets
 * the same "each tag reads as its own color" effect used in the reference
 * filter UI (colored outline pills, one hue per team/category) with zero
 * migration and zero new UI for picking a color. Same trick this app
 * already uses for brand marks (workspace-switcher.tsx's MARK_COLORS) —
 * consistent by construction: the same tag name always lands on the same
 * color, everywhere it's rendered, without persisting anything.
 *
 * Built from the app's own --tint-* pairs (globals.css), already solved
 * for WCAG AA contrast against their own background — reusing them here
 * means a tag pill never needs its own contrast check.
 */
export type TagColor = {
  bg: string;
  fg: string;
  border: string;
};

const PALETTE: TagColor[] = [
  { bg: "var(--tint-sky)", fg: "var(--tint-sky-fg)", border: "var(--tint-sky-fg)" },
  { bg: "var(--tint-mint)", fg: "var(--tint-mint-fg)", border: "var(--tint-mint-fg)" },
  { bg: "var(--tint-peach)", fg: "var(--tint-peach-fg)", border: "var(--tint-peach-fg)" },
  { bg: "var(--tint-lavender)", fg: "var(--tint-lavender-fg)", border: "var(--tint-lavender-fg)" },
  { bg: "var(--tint-rose)", fg: "var(--tint-rose-fg)", border: "var(--tint-rose-fg)" },
  { bg: "var(--tint-stone)", fg: "var(--tint-stone-fg)", border: "var(--tint-stone-fg)" },
];

/** Simple string hash (djb2) — deterministic, no dependency, good enough
 *  distribution for a 6-color palette across a project's handful of tags. */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return h >>> 0;
}

export function colorForTag(name: string): TagColor {
  return PALETTE[hash(name.trim().toLowerCase()) % PALETTE.length];
}
