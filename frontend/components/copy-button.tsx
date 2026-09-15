"use client";

import { useState } from "react";
import { buttonSecondarySm } from "@/lib/button-styles";

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
      className={buttonSecondarySm}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
