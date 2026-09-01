"use client";

import { useState } from "react";
import { highlightBrands, type RankedBrand } from "@/lib/highlight-brands";

/**
 * The actual AI answer — the thing every metric in this app is derived from,
 * and until now the one thing nowhere in the UI actually showed. Tracked
 * brands are highlighted inline, own brand vs competitor colour-coded, each
 * with a tooltip carrying its rank and sentiment so the highlight isn't just
 * decorative.
 *
 * Clamped to ~6 lines by default — answers run long, and a page listing every
 * cited source below shouldn't have to fight a wall of text to get there.
 */
export function AnswerText({
  text,
  brands,
}: {
  text: string | null;
  brands: RankedBrand[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (!text || !text.trim()) {
    return (
      <p className="m-0 font-sans text-[13px] text-[var(--faint)] italic">
        No answer text stored for this fetch.
      </p>
    );
  }

  const segments = highlightBrands(text, brands);

  return (
    <div>
      <div
        className="whitespace-pre-wrap font-sans text-[13.5px] leading-[1.65] text-[var(--ink)]"
        style={
          expanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitLineClamp: 6,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
        }
      >
        {segments.map((s, i) =>
          s.kind === "text" ? (
            <span key={i}>{s.text}</span>
          ) : (
            <mark
              key={i}
              className="rounded-[3px] px-0.5 font-medium"
              style={{
                background: s.brand.isOwn ? "var(--tint-peach)" : "var(--tint-sky)",
                color: s.brand.isOwn ? "var(--tint-peach-fg)" : "var(--tint-sky-fg)",
              }}
              title={`#${s.brand.position} mentioned${
                s.brand.sentiment !== null ? ` · sentiment ${s.brand.sentiment}` : ""
              }`}
            >
              {s.text}
            </mark>
          ),
        )}
      </div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 border-0 bg-transparent p-0 font-sans text-[11.5px] font-medium text-[var(--ember)]"
      >
        {expanded ? "Show less" : "Show full answer"}
      </button>
    </div>
  );
}
