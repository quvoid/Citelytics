import Link from "next/link";
import { notFound } from "next/navigation";
import { createAnonServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Citation, Engine, Prompt } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PromptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = createAnonServerClient();

  const { data: prompt } = await sb
    .from("prompts")
    .select("id, project_id, query_text, active")
    .eq("id", id)
    .maybeSingle<Prompt>();

  if (!prompt) notFound();

  const { data: engines } = await sb.from("engines").select("id, name").returns<Engine[]>();
  const engineById = new Map((engines ?? []).map((e) => [e.id, e.name]));

  const { data: citations } = await sb
    .from("citations")
    .select(
      "id, prompt_id, engine_id, url, domain, is_simulated, raw_response_id, mentions_brand, fetched_at"
    )
    .eq("prompt_id", id)
    .order("fetched_at", { ascending: false })
    .returns<Citation[]>();

  const { data: rawResponses } = await sb
    .from("raw_responses")
    .select("id, engine_id, brand_mentioned_in_answer")
    .eq("prompt_id", id)
    .returns<{ id: string; engine_id: string; brand_mentioned_in_answer: boolean }[]>();

  const answerMentionByEngine = new Map(
    (rawResponses ?? []).map((r) => [r.engine_id, r.brand_mentioned_in_answer])
  );

  const byEngine = new Map<string, Citation[]>();
  for (const c of citations ?? []) {
    const list = byEngine.get(c.engine_id) ?? [];
    list.push(c);
    byEngine.set(c.engine_id, list);
  }

  const citationsMentioningBrand = (citations ?? []).filter((c) => c.mentions_brand === true).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/prompts" className="text-sm text-primary hover:underline">
          ← Back to Prompts
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{prompt.query_text}</h1>
        <p className="mt-0.5 text-muted-foreground">
          {citations?.length ?? 0} citations across {byEngine.size} engine(s) ·{" "}
          {citationsMentioningBrand} cited page(s) mention your brand ·{" "}
          {prompt.active ? "Active" : "Inactive"}
        </p>
      </div>

      {[...byEngine.entries()].map(([engineId, rows]) => (
        <Card key={engineId}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge variant={engineById.get(engineId) === "gemini" ? "default" : "secondary"}>
                {engineById.get(engineId) ?? "—"}
              </Badge>
              {rows.length} citations
              {answerMentionByEngine.get(engineId) ? (
                <Badge variant="outline" className="border-primary text-primary">
                  Brand mentioned in answer
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">Brand not mentioned in answer text</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Mentions brand?</TableHead>
                  <TableHead className="text-right">Fetched</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-md truncate">
                      <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {c.url}
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.domain}</TableCell>
                    <TableCell>
                      {c.is_simulated ? (
                        <Badge variant="secondary">Simulated</Badge>
                      ) : (
                        <Badge>Real</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.mentions_brand === true && (
                        <Badge className="bg-[#157f53]">Yes</Badge>
                      )}
                      {c.mentions_brand === false && (
                        <span className="text-muted-foreground">No</span>
                      )}
                      {c.mentions_brand === null && (
                        <span className="text-xs text-muted-foreground">Unknown (page blocked fetch)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {new Date(c.fetched_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {!citations?.length && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No citations yet for this prompt — run &ldquo;Fetch citations now&rdquo; from the
            Overview page.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
