"use client";

import { useTransition } from "react";
import { removeBrand } from "@/lib/actions/brands";

export type BrandRow = {
  id: string;
  url: string;
  name: string;
  is_competitor: boolean;
  visibility: number;
  shareOfVoice: number;
  answers: number;
  avgPosition: number | null;
  pages: number;
};

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
      <div className="grid grid-cols-[1fr_1.6fr_90px_150px_24px] gap-9 border-b border-[var(--rule)] py-3.5 text-[10px] tracking-[0.12em] text-[var(--muted-2)] uppercase">
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
                <span className="border border-[#E0BDB2] px-1.5 py-0.5 text-[9px] tracking-[0.11em] text-[var(--rust)] uppercase">
                  you
                </span>
              )}
            </div>
            <div className="mt-1 text-[12px] text-[var(--muted-2)]">{b.url}</div>
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
              <span>{b.answers} answers</span>
              <span>{b.pages} cited pages</span>
            </div>
          </div>
          <div className="text-right font-serif text-[20px]">
            {b.avgPosition !== null ? `#${b.avgPosition.toFixed(1)}` : "—"}
          </div>
          <div className="text-right">
            <div className="font-serif text-[34px] leading-none">{b.shareOfVoice}%</div>
            <div className="mt-1 font-serif text-[12.5px] text-[var(--faint)] italic">
              named in {b.visibility}% of answers
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
    </section>
  );
}
