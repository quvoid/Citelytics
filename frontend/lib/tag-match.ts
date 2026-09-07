/** Auto-match tagging, shared logic: a tag applies itself to a prompt the
 *  moment its name shows up as a whole word (case-insensitive) in that
 *  prompt's own text or one of its answers. This is the ONLY way a prompt
 *  gets tagged now — there is no manual per-prompt assignment UI any more
 *  (see components/tag-picker.tsx, which only shows what auto-matched and
 *  lets a user remove a bad match). Mirrors backend/store.py's
 *  `auto_link_tags` (same word-boundary regex), which runs the same check
 *  server-side in Python after every fetch — this copy is what runs from
 *  the two frontend server actions that can also introduce a new match
 *  (creating a tag, or creating a prompt) without waiting for a fetch. */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True if `name` appears as a whole word (not as part of a longer word) in
 *  any of `texts`, case-insensitive. */
export function matchesAnyText(name: string, texts: (string | null | undefined)[]): boolean {
  const clean = name.trim();
  if (!clean) return false;
  const pattern = new RegExp(`(?<!\\w)${escapeRegExp(clean)}(?!\\w)`, "i");
  return texts.some((t) => t && pattern.test(t));
}
