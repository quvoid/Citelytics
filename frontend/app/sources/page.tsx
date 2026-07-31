import { createAnonServerClient } from "@/lib/supabase/server";
import { DEMO_PROJECT_ID } from "@/lib/constants";
import { SourcesTable, type DomainGroup } from "@/components/sources-table";
import type { Citation, DomainType, Prompt, TrackedUrl } from "@/lib/types";

export const dynamic = "force-dynamic";

const MOVER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3-day windows for trending/losing comparison

function titleFromUrl(url: string): string {
  try {
    const { pathname } = new URL(url);
    const last = pathname.split("/").filter(Boolean).pop() ?? "";
    const cleaned = last.replace(/[-_]/g, " ").replace(/\.\w+$/, "");
    return cleaned ? cleaned.replace(/\b\w/g, (c) => c.toUpperCase()) : url;
  } catch {
    return url;
  }
}

export default async function SourcesPage() {
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
        .select(
          "id, prompt_id, engine_id, url, domain, is_simulated, raw_response_id, mentions_brand, content_type, fetched_at"
        )
        .in("prompt_id", promptIds)
        .returns<Citation[]>()
    : { data: [] as Citation[] };

  const { data: ownBrand } = await sb
    .from("tracked_urls")
    .select("id, project_id, url, name, is_competitor")
    .eq("project_id", DEMO_PROJECT_ID)
    .eq("is_competitor", false)
    .returns<TrackedUrl[]>();
  const ownDomains = new Set((ownBrand ?? []).map((b) => b.url));

  const allDomains = [...new Set((citations ?? []).map((c) => c.domain))];
  const { data: domainTypeRows } = allDomains.length
    ? await sb.from("domain_types").select("domain, domain_type").in("domain", allDomains).returns<DomainType[]>()
    : { data: [] as DomainType[] };
  const domainTypeByDomain = new Map((domainTypeRows ?? []).map((d) => [d.domain, d.domain_type]));

  const totalCitations = citations?.length ?? 0;
  const now = Date.now();

  const byDomain = new Map<string, { citations: Citation[] }>();
  for (const c of citations ?? []) {
    const g = byDomain.get(c.domain) ?? { citations: [] };
    g.citations.push(c);
    byDomain.set(c.domain, g);
  }

  const groups: DomainGroup[] = Array.from(byDomain.entries())
    .map(([domain, g]) => {
      const known = g.citations.filter((c) => c.mentions_brand !== null);
      const mentionRate = known.length
        ? Math.round((known.filter((c) => c.mentions_brand).length / known.length) * 100)
        : 0;

      const timestamps = g.citations.map((c) => new Date(c.fetched_at).getTime());
      const firstSeen = Math.min(...timestamps);
      const recentCount = timestamps.filter((t) => now - t <= MOVER_WINDOW_MS).length;
      const priorCount = timestamps.filter(
        (t) => now - t > MOVER_WINDOW_MS && now - t <= MOVER_WINDOW_MS * 2
      ).length;

      return {
        domain,
        domainType: domainTypeByDomain.get(domain) ?? null,
        citations: g.citations.length,
        mentionRate,
        shareOfSources: totalCitations ? Math.round((g.citations.length / totalCitations) * 100) : 0,
        owned: ownDomains.has(domain),
        isNew: now - firstSeen <= MOVER_WINDOW_MS,
        recentCount,
        priorCount,
        urls: g.citations
          .reduce<
            { url: string; title: string; citations: number; mentions: boolean | null; contentType: string | null }[]
          >((acc, c) => {
            const existing = acc.find((u) => u.url === c.url);
            if (existing) {
              existing.citations += 1;
              if (c.mentions_brand) existing.mentions = true;
            } else {
              acc.push({
                url: c.url,
                title: titleFromUrl(c.url),
                citations: 1,
                mentions: c.mentions_brand,
                contentType: c.content_type,
              });
            }
            return acc;
          }, [])
          .sort((a, b) => b.citations - a.citations),
      };
    })
    .sort((a, b) => b.citations - a.citations);

  return (
    <div>
      <section className="border-b border-[var(--ink)] py-11">
        <h1 className="m-0 font-serif text-[40px] font-normal tracking-[-0.02em]">Sources</h1>
        <p className="mt-2.5 max-w-[70ch] font-serif text-[16px] text-[var(--muted-2)] italic">
          {totalCitations} cited pages across {groups.length} domains — expand a domain to see
          which specific pages are cited and whether they name your brand.
        </p>
      </section>
      <SourcesTable groups={groups} />
    </div>
  );
}
