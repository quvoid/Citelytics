"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { AggregationTable } from "@/components/aggregation-table";
import { Badge } from "@/components/ui/badge";

export type DomainRow = { domain: string; citations: number; simulated: number };

const columns: ColumnDef<DomainRow>[] = [
  { accessorKey: "domain", header: "Domain" },
  { accessorKey: "citations", header: "Citations" },
  {
    accessorKey: "simulated",
    header: "Simulated",
    cell: ({ row }) =>
      row.original.simulated > 0 ? (
        <Badge variant="secondary">{row.original.simulated} simulated</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

export function DomainsTable({ data }: { data: DomainRow[] }) {
  return <AggregationTable data={data} columns={columns} />;
}
