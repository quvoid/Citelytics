"use client";

import { useState } from "react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PromptActiveSwitch } from "@/components/prompt-active-switch";
import { cn } from "@/lib/utils";
import type { Prompt } from "@/lib/types";

export function PromptsTable({
  prompts,
  citationCounts,
}: {
  prompts: Prompt[];
  citationCounts: Record<string, number>;
}) {
  const [tab, setTab] = useState<"active" | "inactive">("active");

  const active = prompts.filter((p) => p.active);
  const inactive = prompts.filter((p) => !p.active);
  const rows = tab === "active" ? active : inactive;

  return (
    <>
      <div className="flex items-center gap-4 border-b border-border px-1">
        <button
          onClick={() => setTab("active")}
          className={cn(
            "-mb-px border-b-2 border-transparent px-0 py-3 text-[13px] text-muted-foreground",
            tab === "active" && "border-primary font-medium text-foreground"
          )}
        >
          Active <span className="ml-1.5 font-mono text-[11px] text-[#a2a2ac]">{active.length}</span>
        </button>
        <button
          onClick={() => setTab("inactive")}
          className={cn(
            "-mb-px border-b-2 border-transparent px-0 py-3 text-[13px] text-muted-foreground",
            tab === "inactive" && "border-primary font-medium text-foreground"
          )}
        >
          Inactive <span className="ml-1.5 font-mono text-[11px] text-[#a2a2ac]">{inactive.length}</span>
        </button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Prompt</TableHead>
            <TableHead className="text-right">Citations</TableHead>
            <TableHead>Sentiment</TableHead>
            <TableHead>Position</TableHead>
            <TableHead>Intent</TableHead>
            <TableHead className="text-right">Active</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">
                <Link href={`/prompts/${p.id}`} className="hover:underline">
                  {p.query_text}
                </Link>
              </TableCell>
              <TableCell className="text-right font-mono">{citationCounts[p.id] ?? 0}</TableCell>
              <TableCell className="text-muted-foreground">Coming soon</TableCell>
              <TableCell className="text-muted-foreground">Coming soon</TableCell>
              <TableCell className="text-muted-foreground">Coming soon</TableCell>
              <TableCell className="flex justify-end">
                <PromptActiveSwitch promptId={p.id} active={p.active} />
              </TableCell>
            </TableRow>
          ))}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {tab === "active" ? "No active prompts." : "No inactive prompts."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </>
  );
}
