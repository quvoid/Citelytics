/**
 * Prompt Volume display bucketing — pure, no I/O, unit-testable the same
 * way as lib/metrics/period.ts.
 *
 * Peec's "1-5" is a RELATIVE score — a prompt's demand relative to the
 * project's OTHER tracked prompts, not a fixed global scale. That's a
 * deliberate choice, not a shortcut: prompts.search_volume is a raw Google
 * Trends value (0-100), and that scale is only ever comparable within the
 * single Trends batch it was fetched in (Trends normalizes per request, up
 * to 5 terms at a time) — treating two different prompts' raw scores as
 * directly comparable would be quietly wrong. A percentile rank among a
 * project's own prompts sidesteps that: it only ever compares a prompt's
 * search_volume to OTHER volumes that were fetched the same way.
 */

export type VolumeBucket = 1 | 2 | 3 | 4 | 5;

/**
 * @param raw this prompt's search_volume (0-100), or null if never researched.
 * @param allValuesInProject every OTHER tracked prompt's non-null search_volume
 *   in the same project — the population `raw` is ranked against.
 * @returns null when `raw` is null (unknown, never fabricated) or when there
 *   are too few other volumes to make a percentile meaningful (a project's
 *   first researched prompt has nothing to rank against).
 */
export function volumeBucket(raw: number | null, allValuesInProject: number[]): VolumeBucket | null {
  if (raw === null) return null;
  const population = allValuesInProject.filter((v): v is number => v !== null && !Number.isNaN(v));
  if (population.length < 2) return null;

  const sorted = [...population].sort((a, b) => a - b);
  const below = sorted.filter((v) => v < raw).length;
  const percentile = below / sorted.length; // 0..1, ties count as "not below"

  if (percentile >= 0.8) return 5;
  if (percentile >= 0.6) return 4;
  if (percentile >= 0.4) return 3;
  if (percentile >= 0.2) return 2;
  return 1;
}

/** How stale a Trends check is, for an honest "as of {date}" label rather
 *  than implying live data. */
export function volumeAge(checkedAt: string | null): string | null {
  if (!checkedAt) return null;
  const days = Math.floor((Date.now() - new Date(checkedAt).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}
