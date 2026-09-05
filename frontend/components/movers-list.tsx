import { ArrowDown, ArrowUp } from "lucide-react";
import type { Mover } from "@/lib/movers";

/**
 * What changed, rather than what is.
 *
 * Every other card on the Overview reports a state; this one reports a
 * movement, which is the thing a dashboard is actually opened for. Each row
 * names both endpoints and, when the comparison had to reach past silent
 * weeks, says so — a jump measured across a fetch gap is a weaker claim than
 * one measured week to week, and hiding that difference would make the two
 * look equally solid.
 */
export function MoversList({ movers }: { movers: Mover[] }) {
  if (!movers.length) {
    return (
      <p className="m-0 font-sans text-[13px] text-[var(--muted-2)]">
        Nothing moved more than a couple of points between the last two periods with data.
      </p>
    );
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {movers.map((m) => {
        // Rising share of voice is good for you and bad when it is a rival's.
        const good = m.isOwn ? m.change > 0 : m.change < 0;
        const color = good ? "var(--green)" : "var(--red)";
        const Arrow = m.change > 0 ? ArrowUp : ArrowDown;
        return (
          <li key={m.brandId} className="flex items-center gap-3">
            <span
              className="min-w-0 flex-1 truncate font-sans text-[12.5px]"
              style={{ color: "var(--ink)", fontWeight: m.isOwn ? 600 : 400 }}
            >
              {m.name}
              {m.isOwn && (
                <span
                  className="ml-1.5 rounded-full px-1.5 py-0.5 font-sans text-[11px] font-semibold tracking-[0.06em] uppercase"
                  style={{ background: "var(--tint-peach)", color: "var(--tint-peach-fg)" }}
                >
                  you
                </span>
              )}
            </span>
            <span className="flex-none font-sans text-[11.5px] text-[var(--faint)] tabular-nums">
              {m.previous}% → {m.latest}%
            </span>
            <span
              className="flex w-[62px] flex-none items-center justify-end gap-0.5 font-sans text-[12.5px] font-semibold tabular-nums"
              style={{ color }}
              title={
                m.bucketsSkipped > 0
                  ? `Compared against ${m.previousBucket}, the last period with data — ${m.bucketsSkipped} period(s) in between had no fetches`
                  : `${m.previousBucket} → ${m.latestBucket}`
              }
            >
              <Arrow size={12} strokeWidth={2.6} aria-hidden="true" />
              {Math.abs(m.change)} pts
            </span>
          </li>
        );
      })}
      {movers.some((m) => m.bucketsSkipped > 0) && (
        <li className="mt-1 font-sans text-[11px] leading-[1.5] text-[var(--faint)]">
          Some comparisons reach past periods with no fetches — hover a change to see which two
          periods it spans.
        </li>
      )}
    </ul>
  );
}
