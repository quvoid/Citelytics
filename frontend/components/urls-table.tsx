"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { AggregationTable } from "@/components/aggregation-table";
import { Badge } from "@/components/ui/badge";

export type UrlRow = {
  url: string;
  domain: string;
  citations: number;
  isSimulated: boolean;
  lastSeen: string;
};

const columns: ColumnDef<UrlRow>[] = [
  {
    accessorKey: "url",
    header: "URL",
    cell: ({ row }) => (
      <a
        href={row.original.url}
        target="_blank"
        rel="noreferrer"
        className="max-w-sm truncate block hover:underline"
      >
        {row.original.url}
      </a>
    ),
  },
  { accessorKey: "domain", header: "Domain" },
  { accessorKey: "citations", header: "Citations" },
  {
    accessorKey: "isSimulated",
    header: "Type",
    cell: ({ row }) =>
      row.original.isSimulated ? (
        <Badge variant="secondary">Simulated</Badge>
      ) : (
        <Badge>Real</Badge>
      ),
  },
  {
    accessorKey: "lastSeen",
    header: "Last seen",
    cell: ({ row }) => new Date(row.original.lastSeen).toLocaleDateString(),
  },
];

export function UrlsTable({ data }: { data: UrlRow[] }) {
  return <AggregationTable data={data} columns={columns} />;
}
