import Link from "next/link";
import { createAnonServerClient } from "@/lib/supabase/server";
import { DEMO_PROJECT_ID } from "@/lib/constants";
import { FetchCitationsButton } from "@/components/fetch-citations-button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { VisibilityChart } from "@/components/visibility-chart";
import type { Citation, Engine, Prompt } from "@/lib/types";

export const dynamic = "force-dynamic";

type RawResponseRow = {
  id: string;
  prompt_id: string;
  engine_id: string;
  brand_mentioned_in_answer: boolean;
  fetched_at: string;
};

async function getOverviewData() {
  const sb = createAnonServerClient();

  const { data: prompts } = await sb
    .from("prompts")
    .select("id, project_id, query_text, active")
    .eq("project_id", DEMO_PROJECT_ID)
    .returns<Prompt[]>();

  const { data: engines } = await sb.from("engines").select("id, name").returns<Engine[]>();

  const promptIds = (prompts ?? []).map((p) => p.id);
  const { data: citations } = promptIds.length
    ? await sb
        .from("citations")
        .select(
          "id, prompt_id, engine_id, url, domain, is_simulated, raw_response_id, mentions_brand, fetched_at"
        )
        .in("prompt_id", promptIds)
        .order("fetched_at", { ascending: true })
        .returns<Citation[]>()
    : { data: [] as Citation[] };

  const { data: rawResponses } = promptIds.length
    ? await sb
        .from("raw_responses")
        .select("id, prompt_id, engine_id, brand_mentioned_in_answer, fetched_at")
        .in("prompt_id", promptIds)
        .order("fetched_at", { ascending: false })
        .returns<RawResponseRow[]>()
    : { data: [] as RawResponseRow[] };

  return {
    prompts: prompts ?? [],
    engines: engines ?? [],
    citations: citations ?? [],
    rawResponses: rawResponses ?? [],
  };
}

export default async function OverviewPage() {
  const { prompts, engines, citations, rawResponses } = await getOverviewData();
  const engineById = new Map(engines.map((e) => [e.id, e.name]));
  const promptById = new Map(prompts.map((p) => [p.id, p.query_text]));
  const citationCountByRawResponse = new Map<string, number>();
  for (const c of citations) {
    if (!c.raw_response_id) continue;
    citationCountByRawResponse.set(
      c.raw_response_id,
      (citationCountByRawResponse.get(c.raw_response_id) ?? 0) + 1
    );
  }
  const chats = rawResponses.slice(0, 25);

  const byDay = new Map<string, number>();
  for (const c of citations) {
    const day = c.fetched_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const chartData = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, citations: count }));

  const domainCounts = new Map<string, number>();
  for (const c of citations) {
    domainCounts.set(c.domain, (domainCounts.get(c.domain) ?? 0) + 1);
  }
  const topDomains = Array.from(domainCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  const totalCitations = citations.length;
  const realCitations = citations.filter((c) => !c.is_simulated).length;
  const simulatedCitations = totalCitations - realCitations;
  const citationsMentioningBrand = citations.filter((c) => c.mentions_brand === true).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-0.5 text-muted-foreground">
            {prompts.filter((p) => p.active).length} active prompts · 2 engines ·{" "}
            {totalCitations} citations tracked
          </p>
        </div>
        <FetchCitationsButton />
      </div>

      <div className="grid gap-2.5 sm:grid-cols-4">
        <Card className="gap-1 rounded-[10px] py-3">
          <CardHeader className="px-3.5">
            <CardTitle className="text-[11.5px] font-medium text-muted-foreground">
              Total citations
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3.5 font-mono text-2xl font-semibold tracking-tight">
            {totalCitations}
          </CardContent>
        </Card>
        <Card className="gap-1 rounded-[10px] py-3">
          <CardHeader className="px-3.5">
            <CardTitle className="text-[11.5px] font-medium text-muted-foreground">
              Real (non-simulated)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3.5 font-mono text-2xl font-semibold tracking-tight">
            {realCitations}
            <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
              {simulatedCitations > 0 ? `${simulatedCitations} simulated` : ""}
            </span>
          </CardContent>
        </Card>
        <Card className="gap-1 rounded-[10px] py-3">
          <CardHeader className="px-3.5">
            <CardTitle className="text-[11.5px] font-medium text-muted-foreground">
              Unique domains
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3.5 font-mono text-2xl font-semibold tracking-tight">
            {domainCounts.size}
          </CardContent>
        </Card>
        <Card className="gap-1 rounded-[10px] py-3">
          <CardHeader className="px-3.5">
            <CardTitle className="text-[11.5px] font-medium text-muted-foreground">
              Cited pages mentioning brand
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3.5 font-mono text-2xl font-semibold tracking-tight">
            {citationsMentioningBrand}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Citation volume over time</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length ? (
            <VisibilityChart data={chartData} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No citations yet — click &ldquo;Fetch citations now&rdquo; to run the first pull.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Source distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead className="text-right">Citations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topDomains.map(([domain, count]) => (
                <TableRow key={domain}>
                  <TableCell className="font-medium">{domain}</TableCell>
                  <TableCell className="text-right">{count}</TableCell>
                </TableRow>
              ))}
              {!topDomains.length && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">
                    No data yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Chats</CardTitle>
          <p className="text-xs text-muted-foreground">
            Every tracked API call — one row per prompt × engine fetch
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Engine</TableHead>
                <TableHead>Prompt</TableHead>
                <TableHead className="text-right">Sources</TableHead>
                <TableHead>Brand mentioned</TableHead>
                <TableHead className="text-right">Fetched</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chats.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Badge variant={engineById.get(r.engine_id) === "gemini" ? "default" : "secondary"}>
                      {engineById.get(r.engine_id) ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate font-medium">
                    <Link href={`/prompts/${r.prompt_id}`} className="hover:underline">
                      {promptById.get(r.prompt_id) ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {citationCountByRawResponse.get(r.id) ?? 0}
                  </TableCell>
                  <TableCell>
                    {r.brand_mentioned_in_answer ? (
                      <Badge className="bg-[#157f53]">In answer</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {new Date(r.fetched_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
              {!chats.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No fetches yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
