import { createAnonServerClient } from "@/lib/supabase/server";
import { DEMO_PROJECT_ID } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddPromptForm } from "@/components/add-prompt-form";
import { PromptsTable } from "@/components/prompts-table";
import type { Citation, Prompt } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PromptsPage() {
  const sb = createAnonServerClient();
  const { data: prompts } = await sb
    .from("prompts")
    .select("id, project_id, query_text, active")
    .eq("project_id", DEMO_PROJECT_ID)
    .order("query_text")
    .returns<Prompt[]>();

  const promptIds = (prompts ?? []).map((p) => p.id);
  const { data: citations } = promptIds.length
    ? await sb
        .from("citations")
        .select("id, prompt_id, engine_id, url, domain, is_simulated, raw_response_id, fetched_at")
        .in("prompt_id", promptIds)
        .returns<Citation[]>()
    : { data: [] as Citation[] };

  const citationCountByPrompt: Record<string, number> = {};
  for (const c of citations ?? []) {
    citationCountByPrompt[c.prompt_id] = (citationCountByPrompt[c.prompt_id] ?? 0) + 1;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Prompts</h1>
        <p className="mt-0.5 text-muted-foreground">
          Tracked prompts for the demo project. Active prompts are queried on
          each &ldquo;Fetch citations&rdquo; run.
        </p>
      </div>

      <AddPromptForm />

      <Card>
        <CardHeader>
          <CardTitle>All prompts ({prompts?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <PromptsTable prompts={prompts ?? []} citationCounts={citationCountByPrompt} />
        </CardContent>
      </Card>
    </div>
  );
}
