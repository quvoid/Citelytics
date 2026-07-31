import { createAnonServerClient } from "@/lib/supabase/server";
import { DEMO_PROJECT_ID } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DomainsTable, type DomainRow } from "@/components/domains-table";
import type { Citation, Prompt } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DomainsPage() {
  const sb = createAnonServerClient();

  const { data: prompts } = await sb
    .from("prompts")
    .select("id")
    .eq("project_id", DEMO_PROJECT_ID)
    .returns<Pick<Prompt, "id">[]>();

  const promptIds = (prompts ?? []).map((p) => p.id);

  const { data: citations } = promptIds.length
    ? await sb
        .from("citations")
        .select("domain, is_simulated")
        .in("prompt_id", promptIds)
        .returns<Pick<Citation, "domain" | "is_simulated">[]>()
    : { data: [] as Pick<Citation, "domain" | "is_simulated">[] };

  const byDomain = new Map<string, DomainRow>();
  for (const c of citations ?? []) {
    const existing = byDomain.get(c.domain) ?? {
      domain: c.domain,
      citations: 0,
      simulated: 0,
    };
    existing.citations += 1;
    if (c.is_simulated) existing.simulated += 1;
    byDomain.set(c.domain, existing);
  }

  const rows = Array.from(byDomain.values()).sort((a, b) => b.citations - a.citations);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sources · Domains</h1>
        <p className="mt-0.5 text-muted-foreground">
          Domains cited across all tracked prompts, aggregated from the citations table.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{rows.length} domains</CardTitle>
        </CardHeader>
        <CardContent>
          <DomainsTable data={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
