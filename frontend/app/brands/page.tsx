import { createAnonServerClient } from "@/lib/supabase/server";
import { DEMO_PROJECT_ID } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AddBrandForm } from "@/components/add-brand-form";
import { RemoveBrandButton } from "@/components/remove-brand-button";
import type { Citation, Prompt, TrackedUrl } from "@/lib/types";

export const dynamic = "force-dynamic";

function matchesDomain(citationDomain: string, brandDomain: string): boolean {
  return citationDomain === brandDomain || citationDomain.endsWith(`.${brandDomain}`);
}

export default async function BrandsPage() {
  const sb = createAnonServerClient();

  const { data: brands } = await sb
    .from("tracked_urls")
    .select("id, project_id, url, is_competitor")
    .eq("project_id", DEMO_PROJECT_ID)
    .order("is_competitor")
    .returns<TrackedUrl[]>();

  const { data: prompts } = await sb
    .from("prompts")
    .select("id")
    .eq("project_id", DEMO_PROJECT_ID)
    .returns<Pick<Prompt, "id">[]>();

  const promptIds = (prompts ?? []).map((p) => p.id);
  const { data: citations } = promptIds.length
    ? await sb
        .from("citations")
        .select("id, prompt_id, engine_id, url, domain, is_simulated, raw_response_id, fetched_at")
        .in("prompt_id", promptIds)
        .returns<Citation[]>()
    : { data: [] as Citation[] };

  const totalCitations = citations?.length ?? 0;

  const rows = (brands ?? []).map((b) => {
    const visibility = (citations ?? []).filter((c) => matchesDomain(c.domain, b.url)).length;
    const shareOfVoice = totalCitations > 0 ? (visibility / totalCitations) * 100 : 0;
    return { ...b, visibility, shareOfVoice };
  });

  const ourBrand = rows.filter((r) => !r.is_competitor);
  const competitors = rows
    .filter((r) => r.is_competitor)
    .sort((a, b) => b.visibility - a.visibility);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Brands</h1>
        <p className="mt-0.5 text-muted-foreground">
          Track your brand&apos;s domain against competitors — visibility is how many tracked
          citations mention each domain.
        </p>
      </div>

      <AddBrandForm />

      <Card>
        <CardHeader>
          <CardTitle>Brand comparison ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead className="text-right">Visibility</TableHead>
                <TableHead className="text-right">Share of voice</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...ourBrand, ...competitors].map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    {r.is_competitor ? (
                      <Badge variant="secondary">Competitor</Badge>
                    ) : (
                      <Badge>You</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{r.url}</TableCell>
                  <TableCell className="text-right font-mono">{r.visibility}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.shareOfVoice.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right">
                    <RemoveBrandButton id={r.id} />
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No brands tracked yet — add your brand and competitors above.
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
