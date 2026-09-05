"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DownloadCsvButton } from "@/components/download-csv-button";
import { MetricCellView } from "@/components/metric-cell";
import type { BrandMetricRow, MetricKey } from "@/lib/metrics/types";

type SortKey = MetricKey | "name";

/** Brand mark by convention, matching workspace-switcher: public/logos/<domain>.png.
 *  Falls back to a tinted monogram so a missing file never leaves a hole.
 *  `hasLogo` (from lib/logo-domains.ts, checked server-side by the page
 *  that renders this table) skips the <img> — and the network request
 *  behind it — entirely for a domain known to have no logo file, rather
 *  than finding out via a failed request every time. */
function BrandMark({ name, url, hasLogo }: { name: string; url: string; hasLogo: boolean }) {
  const [failed, setFailed] = useState(false);
  const letter = name.trim().charAt(0).toUpperCase() || "?";

  if (failed || !hasLogo) {
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] font-sans text-[11px] font-semibold"
        style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
        aria-hidden="true"
      >
        {letter}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/logos/${url}.png`}
      alt=""
      width={20}
      height={20}
      className="h-5 w-5 shrink-0 rounded-[6px] object-contain"
      onError={() => setFailed(true)}
      // The img is server-rendered, so the browser starts (and finishes)
      // loading it before React hydrates — a 404 fires its error event with
      // no handler attached yet, and onError alone then never runs, leaving
      // a broken-image glyph forever. This ref runs at hydration and checks
      // the outcome directly: a complete image with zero natural width IS a
      // failed one.
      ref={(el) => {
        if (el?.complete && el.naturalWidth === 0) setFailed(true);
      }}
    />
  );
}

/** Every column but Brand is centred, and each carries a divider on its left
 *  edge — so a header always sits directly over its own values instead of
 *  drifting to the opposite side of the cell. */
const DIVIDER = "border-l border-[var(--border)]";

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "center",
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "center";
}) {
  return (
    <th
      className={`px-3 py-2 font-sans text-[11px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase ${
        align === "center" ? `text-center ${DIVIDER}` : "text-left"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 border-0 bg-transparent p-0 font-sans text-[11px] font-medium tracking-[0.06em] uppercase"
        style={{ color: active ? "var(--ink)" : "var(--muted-2)", cursor: "pointer" }}
      >
        {label}
        {active && dir === "asc" ? (
          <ArrowUp size={11} strokeWidth={2.4} aria-hidden="true" className="flex-none" />
        ) : (
          <ArrowDown
            size={11}
            strokeWidth={2.4}
            aria-hidden="true"
            className="flex-none"
            style={{ opacity: active ? 1 : 0.4 }}
          />
        )}
      </button>
    </th>
  );
}

/**
 * The ranked competitor table.
 *
 * A real <table>, not a fixed-width CSS grid — that gives every header cell
 * and its column's values the same box for free, instead of relying on two
 * independent px sums staying in sync. The previous version also sat inside
 * an `overflow-hidden` card, which doesn't scroll a too-wide row — it
 * silently CUTS OFF whatever doesn't fit, so at a modest viewport width the
 * Position and Mentions columns were being clipped off entirely rather than
 * merely misaligned. `overflow-x-auto` on the table itself scrolls instead
 * of losing data.
 *
 * Position sits directly beside Visibility on purpose: position is a
 * CONDITIONAL average — "when you are named, where do you rank?" — so a brand
 * named once at #1 outranks one named fifty times at #1.2. Read alone that is
 * actively misleading; read next to visibility it is exactly the right
 * question. Unscored brands are dimmed rather than shown as zeros.
 */
export function TopBrandsTable({
  rows,
  totalResponses,
  logoDomains,
}: {
  rows: BrandMetricRow[];
  totalResponses: number;
  /** Domains actually confirmed to have a /logos/ file — from
   *  lib/logo-domains.ts, checked server-side by the caller. Required (not
   *  defaulted to "assume every domain has one") so a caller that forgets
   *  to pass it fails loudly in dev rather than silently hiding every real
   *  logo behind a monogram. */
  logoDomains: string[];
}) {
  const knownLogos = useMemo(() => new Set(logoDomains), [logoDomains]);
  const [sort, setSort] = useState<SortKey>("visibility");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name) * (dir === "asc" ? 1 : -1);
      const av = a[sort].value;
      const bv = b[sort].value;
      // Nulls always sink, regardless of direction — an unmeasured brand is
      // not "the worst", it is simply not in the ranking.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * (dir === "asc" ? 1 : -1);
    });
    return out;
  }, [rows, sort, dir]);

  const toggle = (k: SortKey) => {
    if (sort === k) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(k);
      // Position's "best" is its lowest value, so default it ascending.
      setDir(k === "position" ? "asc" : "desc");
    }
  };

  return (
    <section
      className="rounded-[var(--radius-xl)] bg-[var(--card)]"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center justify-between gap-4 px-4 pt-4 pb-3">
        <div>
          <h2 className="m-0 font-sans text-[15px] font-semibold tracking-[-0.01em]">
            Top brands
          </h2>
          <p className="mt-0.5 font-sans text-[12px] text-[var(--muted-2)]">
            Across {totalResponses} AI answers in this period
          </p>
        </div>
        <DownloadCsvButton
          filename="brands.csv"
          rows={sorted.map((r, i) => ({
            rank: i + 1,
            brand: r.name,
            domain: r.url,
            is_you: r.isCompetitor ? "" : "yes",
            visibility_pct: r.visibility.value,
            sov_pct: r.sov.value,
            sentiment: r.sentiment.value,
            avg_position: r.position.value,
            mentions: r.mentionCount,
            answers_scored: r.visibility.support.responses,
          }))}
          columns={[
            { key: "rank", label: "#" },
            { key: "brand", label: "Brand" },
            { key: "domain", label: "Domain" },
            { key: "is_you", label: "Your brand" },
            { key: "visibility_pct", label: "Visibility %" },
            { key: "sov_pct", label: "SOV %" },
            { key: "sentiment", label: "Sentiment" },
            { key: "avg_position", label: "Avg position" },
            { key: "mentions", label: "Mentions" },
            { key: "answers_scored", label: "Answers scored" },
          ]}
        />
      </div>

      {/* This div, not the card, owns the horizontal scroll — so a narrow
          viewport gets a scrollable table instead of a clipped one, and the
          card's rounded corners never have to fight overflow:hidden against
          real content. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 620 }}>
          <thead>
            <tr className="border-y border-[var(--border)] bg-[var(--muted)]">
              <th className="w-10 px-3 py-2 text-center font-sans text-[11px] font-medium text-[var(--muted-2)]">
                #
              </th>
              <SortHeader label="Brand" active={sort === "name"} dir={dir} onClick={() => toggle("name")} align="left" />
              <SortHeader label="Visibility" active={sort === "visibility"} dir={dir} onClick={() => toggle("visibility")} />
              <SortHeader label="SOV" active={sort === "sov"} dir={dir} onClick={() => toggle("sov")} />
              <SortHeader label="Sentiment" active={sort === "sentiment"} dir={dir} onClick={() => toggle("sentiment")} />
              <SortHeader label="Position" active={sort === "position"} dir={dir} onClick={() => toggle("position")} />
              <th
                className={`px-3 py-2 text-center font-sans text-[11px] font-medium tracking-[0.06em] text-[var(--muted-2)] uppercase ${DIVIDER}`}
              >
                Mentions
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const unscored = r.visibility.support.responses === 0;
              return (
                <tr
                  key={r.brandId}
                  className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--muted)]"
                  style={{ opacity: unscored ? 0.55 : 1 }}
                >
                  <td className="px-3 py-2.5 text-center font-sans text-[12.5px] text-[var(--faint)] tabular-nums">
                    {i + 1}
                  </td>
                  <td className={`px-3 py-2.5 ${DIVIDER}`}>
                    <div className="flex min-w-0 items-center gap-2">
                      <BrandMark name={r.name} url={r.url} hasLogo={knownLogos.has(r.url)} />
                      <span className="truncate font-sans text-[13px] font-medium text-[var(--ink)]">
                        {r.name}
                      </span>
                      {!r.isCompetitor && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 font-sans text-[11px] font-semibold tracking-[0.06em] uppercase"
                          style={{ background: "var(--tint-peach)", color: "var(--tint-peach-fg)" }}
                        >
                          you
                        </span>
                      )}
                    </div>
                  </td>

                  {unscored ? (
                    <td colSpan={5} className={`px-3 py-2.5 ${DIVIDER}`}>
                      <span
                        className="font-sans text-[11.5px] text-[var(--faint)] italic"
                        title="Added after these answers were captured. Its metrics are unknown, not zero — the backfill will fill them in."
                      >
                        not yet scored against stored answers
                      </span>
                    </td>
                  ) : (
                    <>
                      <td className={`px-3 py-2.5 ${DIVIDER}`}>
                        <MetricCellView metric="visibility" cell={r.visibility} size="sm" align="center" />
                      </td>
                      <td className={`px-3 py-2.5 ${DIVIDER}`}>
                        <MetricCellView metric="sov" cell={r.sov} size="sm" align="center" />
                      </td>
                      <td className={`px-3 py-2.5 ${DIVIDER}`}>
                        <MetricCellView metric="sentiment" cell={r.sentiment} size="sm" align="center" />
                      </td>
                      <td className={`px-3 py-2.5 ${DIVIDER}`}>
                        <MetricCellView metric="position" cell={r.position} size="sm" align="center" />
                      </td>
                      <td
                        className={`px-3 py-2.5 text-center font-sans text-[12.5px] text-[var(--muted-2)] tabular-nums ${DIVIDER}`}
                      >
                        {r.mentionCount}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!sorted.length && (
        <p className="px-4 py-8 text-center font-sans text-[13px] text-[var(--muted-2)]">
          No brands tracked yet — <Link href="/brands">add your brand and competitors</Link>.
        </p>
      )}
    </section>
  );
}
