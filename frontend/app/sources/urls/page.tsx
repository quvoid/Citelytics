import { createAnonServerClient } from "@/lib/supabase/server";
import { DEMO_PROJECT_ID } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UrlsTable, type UrlRow } from "@/components/urls-table";
import type { Citation, Prompt } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function UrlsPage() {
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
        .select("url, domain, is_simulated, fetched_at")
        .in("prompt_id", promptIds)
        .returns<Pick<Citation, "url" | "domain" | "is_simulated" | "fetched_at">[]>()
    : { data: [] as Pick<Citation, "url" | "domain" | "is_simulated" | "fetched_at">[] };

  const byUrl = new Map<string, UrlRow>();
  for (const c of citations ?? []) {
    const existing = byUrl.get(c.url) ?? {
      url: c.url,
      domain: c.domain,
      citations: 0,
      isSimulated: c.is_simulated,
      lastSeen: c.fetched_at,
    };
    existing.citations += 1;
    if (c.fetched_at > existing.lastSeen) existing.lastSeen = c.fetched_at;
    byUrl.set(c.url, existing);
  }

  const rows = Array.from(byUrl.values()).sort((a, b) => b.citations - a.citations);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sources · URLs</h1>
        <p className="mt-0.5 text-muted-foreground">
          Individual URLs cited across all tracked prompts.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{rows.length} URLs</CardTitle>
        </CardHeader>
        <CardContent>
          <UrlsTable data={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
