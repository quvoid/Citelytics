"use client";

import { toCsv, downloadText } from "@/lib/csv";

export function DownloadCsvButton({
  filename,
  rows,
  columns,
  label = "Download CSV",
}: {
  filename: string;
  rows: Record<string, string | number | null>[];
  columns: { key: string; label: string }[];
  label?: string;
}) {
  return (
    <button
      onClick={() => downloadText(filename, toCsv(rows, columns))}
      className="border border-[var(--ink)] px-3.5 py-2 font-sans text-[10.5px] tracking-[0.08em] uppercase whitespace-nowrap hover:bg-[var(--ink)] hover:text-[var(--cream)]"
    >
      {label}
    </button>
  );
}
