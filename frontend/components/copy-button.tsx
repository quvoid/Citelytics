"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={handleCopy}
      className="border border-[var(--ink)] px-3.5 py-2 font-sans text-[10.5px] tracking-[0.08em] uppercase whitespace-nowrap hover:bg-[var(--ink)] hover:text-[var(--cream)]"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
