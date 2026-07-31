import { createAnonServerClient } from "@/lib/supabase/server";
import { DEMO_PROJECT_ID } from "@/lib/constants";
import type { Citation, DomainType, Prompt } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function GapAnalysisPage() {
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
        .eq("is_simulated", false)
        .eq("mentions_brand", false)
        .returns<Citation[]>()
    : { data: [] as Citation[] };

  const allDomains = [...new Set((citations ?? []).map((c) => c.domain))];
  const { data: domainTypeRows } = allDomains.length
    ? await sb.from("domain_types").select("domain, domain_type").in("domain", allDomains).returns<DomainType[]>()
    : { data: [] as DomainType[] };
  const domainTypeByDomain = new Map((domainTypeRows ?? []).map((d) => [d.domain, d.domain_type]));

  const byUrl = new Map<
    string,
    { url: string; domain: string; contentType: string | null; citations: number }
  >();
  for (const c of citations ?? []) {
    const existing = byUrl.get(c.url);
    if (existing) {
      existing.citations += 1;
    } else {
      byUrl.set(c.url, { url: c.url, domain: c.domain, contentType: c.content_type, citations: 1 });
    }
  }

  const rows = Array.from(byUrl.values()).sort((a, b) => b.citations - a.citations);

  return (
    <div>
      <section className="border-b border-[var(--ink)] py-11">
        <h1 className="m-0 font-serif text-[40px] font-normal tracking-[-0.02em]">
          Gap analysis
        </h1>
        <p className="mt-2.5 max-w-[70ch] font-serif text-[16px] text-[var(--muted-2)] italic">
          Real pages AI engines keep citing that confirmed do <em>not</em> mention your brand —
          ranked by how often they&apos;re cited, since that&apos;s the real cost of not being on them.
        </p>
      </section>

      <section>
        <div className="grid grid-cols-[1fr_140px_150px_120px] gap-6 border-b border-[var(--rule)] py-3.5 text-[10px] tracking-[0.12em] text-[var(--muted-2)] uppercase">
          <span>URL</span>
          <span>Content type</span>
          <span>Domain type</span>
          <span className="text-right">Citations</span>
        </div>
        {rows.map((r) => (
          <div
            key={r.url}
            className="grid grid-cols-[1fr_140px_150px_120px] items-center gap-6 border-b border-[var(--rule-light)] py-5 hover:bg-[var(--paper)]"
          >
            <div>
              <div className="font-serif text-[17px] tracking-[-0.005em]">{r.domain}</div>
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="text-[11.5px] break-all text-[var(--rust)]"
              >
                {r.url}
              </a>
            </div>
            <div className="text-[11px] tracking-[0.06em] text-[var(--muted-2)] uppercase">
              {r.contentType ?? "—"}
            </div>
            <div className="text-[11px] tracking-[0.06em] text-[var(--muted-2)] uppercase">
              {domainTypeByDomain.get(r.domain) ?? "—"}
            </div>
            <div className="text-right font-serif text-[22px] text-[var(--rust)]">{r.citations}</div>
          </div>
        ))}
        {!rows.length && (
          <p className="border-b border-[var(--rule-light)] py-8 text-center font-serif text-[16px] text-[var(--muted-2)] italic">
            No gaps found yet — either nothing has been fetched, or every cited page already
            mentions your brand.
          </p>
        )}
      </section>
    </div>
  );
}
