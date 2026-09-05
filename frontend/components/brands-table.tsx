"use client";

import { useState, useTransition } from "react";
import { DownloadCsvButton } from "@/components/download-csv-button";
import { removeBrand, updateBrandAliases } from "@/lib/actions/brands";

export type BrandRow = {
  id: string;
  url: string;
  name: string;
  aliases: string[];
  is_competitor: boolean;
  visibility: number;
  shareOfVoice: number;
  answers: number;
  avgPosition: number | null;
  pages: number;
  /** Answers where the engine's retrieval pulled this brand's domain in as a
   * source but never actually named the brand in the visible text. */
  consideredNotNamed: number;
  /** Stored answers that have actually been scored against this brand. Zero
   * for a brand added after those answers were captured — its metrics are
   * unknown, not zero, until the reclassify backfill reaches it. */
  scoredAnswers: number;
};

/** "aka: X, Y" — click to edit. The first edit path this table has ever had
 * for a brand (tracked_urls never had an update RLS policy until migration
 * 0014). Editing here doesn't rescore history — the next fetch picks up the
 * new alias; use the reclassify backfill separately for retroactive rescoring. */
function AliasEditor({ id, aliases }: { id: string; aliases: string[] }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return (
      <form
        action={(formData) =>
          startTransition(async () => {
            await updateBrandAliases(id, String(formData.get("aliases") ?? ""));
            setEditing(false);
          })
        }
        className="mt-1 flex items-center gap-1.5"
      >
        <input
          name="aliases"
          defaultValue={aliases.join(", ")}
          autoFocus
          placeholder="e.g. Moto, Lenovo Motorola"
          className="w-56 border-0 border-b border-[var(--rule)] bg-transparent py-0.5 font-serif text-[12.5px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)]"
        />
        <button type="submit" disabled={isPending} className="text-[11px] text-[var(--rust)]">
          ✓
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-[11px] text-[var(--faint)]">
          ✕
        </button>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="mt-1 block font-sans text-[11.5px] text-[var(--faint)] hover:text-[var(--muted-2)]"
      title="Click to edit — other names this brand gets matched under"
    >
      {aliases.length ? `aka: ${aliases.join(", ")}` : "+ add alias"}
    </button>
  );
}

function RemoveButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(() => removeBrand(id))}
      disabled={isPending}
      className="text-[var(--faint)] hover:text-[var(--rust)]"
      title="Remove"
    >
      ✕
    </button>
  );
}

export function BrandsTable({ rows }: { rows: BrandRow[] }) {
  const sorted = [...rows].sort((a, b) => b.shareOfVoice - a.shareOfVoice);
  const max = Math.max(1, ...sorted.map((r) => r.shareOfVoice));

  return (
    <section className="pt-2">
      <div className="flex justify-end pb-3">
        <DownloadCsvButton
          filename="brands.csv"
          rows={sorted.map((b) => ({
            name: b.name,
            domain: b.url,
            is_competitor: b.is_competitor ? "yes" : "no",
            share_of_voice_pct: b.shareOfVoice,
            visibility_pct: b.visibility,
            avg_position: b.avgPosition,
            answers: b.answers,
            cited_pages: b.pages,
            considered_not_named: b.consideredNotNamed,
          }))}
          columns={[
            { key: "name", label: "Brand" },
            { key: "domain", label: "Domain" },
            { key: "is_competitor", label: "Competitor" },
            { key: "share_of_voice_pct", label: "Share of voice %" },
            { key: "visibility_pct", label: "Visibility %" },
            { key: "avg_position", label: "Avg position" },
            { key: "answers", label: "Answers" },
            { key: "cited_pages", label: "Cited pages" },
            { key: "considered_not_named", label: "Considered, not named" },
          ]}
        />
      </div>
      {/* overflow-x-auto here, not on the page: this grid's fixed-width
          columns (90px/150px/24px) plus its flexible text columns can need
          more room than a narrow viewport has, and without a scroll
          container of its own that need bubbles up into a page-wide
          horizontal scrollbar instead of staying inside this table. */}
      <div className="overflow-x-auto">
      <div style={{ minWidth: 640 }}>
      <div className="grid grid-cols-[1fr_1.6fr_90px_150px_24px] gap-9 border-b border-[var(--rule)] py-3.5 text-[11px] tracking-[0.12em] text-[var(--muted-2)] uppercase">
        <span>Brand</span>
        <span>Share of voice</span>
        <span className="text-right">Position</span>
        <span className="text-right">Visibility</span>
        <span></span>
      </div>
      {sorted.map((b) => (
        <div
          key={b.id}
          className="grid grid-cols-[1fr_1.6fr_90px_150px_24px] items-center gap-9 border-b border-[var(--rule-light)] py-6.5"
        >
          <div>
            <div className="flex items-baseline gap-2.5">
              <span
                className="font-serif text-[24px] tracking-[-0.01em]"
                style={{ color: b.is_competitor ? "var(--ink)" : "var(--rust)" }}
              >
                {b.name}
              </span>
              {!b.is_competitor && (
                <span className="border border-[#E0BDB2] px-1.5 py-0.5 text-[11px] tracking-[0.11em] text-[var(--rust)] uppercase">
                  you
                </span>
              )}
            </div>
            <div className="mt-1 text-[12px] text-[var(--muted-2)]">{b.url}</div>
            <AliasEditor id={b.id} aliases={b.aliases} />
          </div>
          <div>
            <div className="relative h-[22px] bg-[var(--rule-light)]">
              <div
                className="h-[22px]"
                style={{
                  width: `${Math.round((b.shareOfVoice / max) * 100)}%`,
                  background: b.is_competitor ? "#CFC5B2" : "var(--rust)",
                }}
              />
            </div>
            <div className="mt-2 flex gap-5 font-serif text-[13.5px] text-[var(--muted-2)] italic">
              {b.scoredAnswers === 0 ? (
                <span title="This brand was added after these answers were captured, so none of them have been scored against it yet. Not the same as never being mentioned.">
                  not yet scored against stored answers
                </span>
              ) : (
                <>
                  <span>{b.answers} answers</span>
                  <span>{b.pages} cited pages</span>
                  {b.consideredNotNamed > 0 && (
                    <span title="Answers where this brand's own site was pulled in as a source, but the brand was never named in the visible text">
                      +{b.consideredNotNamed} considered, not named
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="text-right font-serif text-[20px]">
            {b.avgPosition !== null ? `#${b.avgPosition.toFixed(1)}` : "—"}
          </div>
          <div className="text-right">
            {/* An unscored brand shows an em dash, never 0%. A confident zero
                here reads as "we looked and you were absent", which is a
                different — and false — claim from "we haven't looked yet". */}
            <div className="font-serif text-[34px] leading-none">
              {b.scoredAnswers === 0 ? "—" : `${b.shareOfVoice}%`}
            </div>
            <div className="mt-1 font-serif text-[12.5px] text-[var(--faint)] italic">
              {b.scoredAnswers === 0
                ? "awaiting backfill"
                : `named in ${b.visibility}% of answers`}
            </div>
          </div>
          <RemoveButton id={b.id} />
        </div>
      ))}
      {!sorted.length && (
        <p className="border-b border-[var(--rule-light)] py-6 font-serif text-[15px] text-[var(--muted-2)] italic">
          No brands tracked yet — add your brand and competitors above.
        </p>
      )}
      </div>
      </div>
    </section>
  );
}
