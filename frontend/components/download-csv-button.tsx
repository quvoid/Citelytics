"use client";

import { buttonSecondarySm } from "@/lib/button-styles";
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
      className={buttonSecondarySm}
    >
      {label}
    </button>
  );
}
