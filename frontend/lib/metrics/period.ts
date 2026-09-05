/**
 * Date-range arithmetic. Pure, UTC-only, string-in/string-out.
 *
 * Everything here works on "YYYY-MM-DD" strings rather than Date objects on
 * purpose. The codebase previously mixed UTC string slicing
 * (`fetched_at.slice(0,10)`) with local-time windows (`Date.now() - WINDOW_MS`)
 * on the same page, which is two different calendars disagreeing about which
 * day a fetch happened on. A string that is UTC by definition cannot drift.
 */

import type { Bucket, DateRange } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function parse(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function fmt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return fmt(parse(day) + n * DAY_MS);
}

/** Inclusive day count: Aug 1 -> Aug 1 is 1 day. */
export function daysInRange(range: DateRange): number {
  return Math.round((parse(range.to) - parse(range.from)) / DAY_MS) + 1;
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function rangeFromPreset(preset: string, lastDay: string): DateRange {
  const days: Record<string, number> = { "7d": 7, "14d": 14, "30d": 30, "90d": 90, "180d": 180 };
  const n = days[preset] ?? 30;
  return { from: addDays(lastDay, -(n - 1)), to: lastDay };
}

/**
 * The preceding period: contiguous, equal-length, non-overlapping.
 * Aug 1–30 (30 days) -> Jul 2–31.
 *
 * Length-preserving for any arbitrary range and never overlaps the current
 * one — an off-by-one that shared a day would damp every delta toward zero.
 */
export function previousPeriod(range: DateRange): DateRange {
  const n = daysInRange(range);
  return { from: addDays(range.from, -n), to: addDays(range.from, -1) };
}

/**
 * Clamps a range to days that actually have data.
 *
 * A range ending "today" silently compares a half-finished day against
 * complete ones — and a partial day is usually partial per-engine (one engine
 * finishes before another), so the blend reweights and the metric moves for
 * reasons that have nothing to do with the brand.
 */
export function resolveRange(
  range: DateRange,
  dataRange: { first: string; last: string } | null,
  opts?: { allowPartial?: boolean },
): { resolved: DateRange; includesPartial: boolean; missingDays: number } {
  if (!dataRange) return { resolved: range, includesPartial: false, missingDays: 0 };

  const to = opts?.allowPartial ? range.to : range.to > dataRange.last ? dataRange.last : range.to;
  const from = range.from < dataRange.first ? dataRange.first : range.from;
  const missingDays = Math.max(0, daysInRange(range) - daysInRange({ from, to }));

  return {
    resolved: from > to ? { from: to, to } : { from, to },
    includesPartial: Boolean(opts?.allowPartial) && range.to > dataRange.last,
    missingDays,
  };
}

/** UTC-Monday-aligned week start, matching Postgres date_trunc('week', ...). */
function startOfWeek(day: string): string {
  const d = new Date(parse(day));
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -dow);
}

function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

function bucketStartFor(day: string, bucket: Bucket): string {
  if (bucket === "week") return startOfWeek(day);
  if (bucket === "month") return startOfMonth(day);
  return day;
}

/**
 * Every bucket the range spans, in order. Buckets are emitted even when they
 * contain no data — the caller fills them with a null value so the chart
 * renders a gap rather than closing the line across missing days.
 *
 * `partial` marks a leading or trailing bucket the range cuts into, so a
 * half-observed week is not read as a real decline.
 */
export function bucketRange(
  range: DateRange,
  bucket: Bucket,
): { start: string; end: string; partial: boolean }[] {
  const out: { start: string; end: string; partial: boolean }[] = [];
  if (range.from > range.to) return out;

  let cursor = bucketStartFor(range.from, bucket);
  while (cursor <= range.to) {
    const naturalEnd =
      bucket === "day"
        ? cursor
        : bucket === "week"
          ? addDays(cursor, 6)
          : addDays(startOfMonth(addDays(`${cursor.slice(0, 7)}-28`, 7)), -1);

    const end = naturalEnd > range.to ? range.to : naturalEnd;
    out.push({
      // Unclipped, so it matches the RPC's date_trunc() bucket_start and the
      // two can be joined by key.
      start: cursor,
      end,
      partial: bucket !== "day" && (cursor < range.from || naturalEnd > range.to),
    });
    cursor = addDays(naturalEnd, 1);
  }
  return out;
}

/** "Aug 1 – Aug 23" / "Aug 1 – Sep 3, 2026" for the filter bar's resolved-range line. */
export function formatRange(range: DateRange): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  const from = new Date(parse(range.from)).toLocaleDateString("en-US", opts);
  const to = new Date(parse(range.to)).toLocaleDateString("en-US", opts);
  return from === to ? from : `${from} – ${to}`;
}
