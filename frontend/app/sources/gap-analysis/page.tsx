import { BarList } from "@/components/bar-list";
import { ChartCard } from "@/components/chart-card";
import { DownloadCsvButton } from "@/components/download-csv-button";
import { createBriefFromGap } from "@/lib/actions/briefs";
import {
  getAnswerBrandMentions,
  getCitations,
  getContentBriefs,
  getDomainTypes,
  getPrompts,
  getTrackedUrls,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function GapAnalysisPage() {
  const [citations, prompts, competitors, briefs] = await Promise.all([
    getCitations({ realOnly: true, notMentioningBrand: true }),
    getPrompts(),
    getTrackedUrls({ competitorsOnly: true }),
    getContentBriefs(),
  ]);
  const domainTypeByDomain = await getDomainTypes([...new Set(citations.map((c) => c.domain))]);
  const promptTextById = new Map(prompts.map((p) => [p.id, p.query_text]));

  const byUrl = new Map<
    string,
    { url: string; domain: string; contentType: string | null; citations: number; promptId: string }
  >();
  for (const c of citations) {
    const existing = byUrl.get(c.url);
    if (existing) {
      existing.citations += 1;
    } else {
      byUrl.set(c.url, {
        url: c.url,
        domain: c.domain,
        contentType: c.content_type,
        citations: 1,
        promptId: c.prompt_id,
      });
    }
  }
  const rows = Array.from(byUrl.values()).sort((a, b) => b.citations - a.citations);

  // --- KPIs ---
  const pagesMissing = rows.length;
  const domainsCount = new Set(rows.map((r) => r.domain)).size;
  const editorialCount = rows.filter((r) => domainTypeByDomain.get(r.domain) === "Editorial").length;
  const editorialShare = pagesMissing ? Math.round((editorialCount / pagesMissing) * 100) : 0;

  // --- Competitor comparison: which competitors are named in the AI answers
  // that produced these gap pages (i.e. answers that name a rival, but the
  // cited page itself doesn't name you) ---
  const gapRawResponseIds = [...new Set(citations.map((c) => c.raw_response_id).filter((id): id is string => id !== null))];
  const mentions = await getAnswerBrandMentions(gapRawResponseIds);

  const rivalRows = competitors
    .map((rival) => {
      const mentionedRRIds = new Set(
        mentions.filter((m) => m.tracked_url_id === rival.id && m.mentioned).map((m) => m.raw_response_id)
      );
      const rivalCitations = citations.filter((c) => c.raw_response_id && mentionedRRIds.has(c.raw_response_id));
      return {
        id: rival.id,
        name: rival.name,
        domain: rival.url,
        pages: new Set(rivalCitations.map((c) => c.url)).size,
        citations: rivalCitations.length,
      };
    })
    .filter((r) => r.pages > 0)
    .sort((a, b) => b.pages - a.pages);

  return (
    <div>
      <section className="border-b border-[var(--ink)] py-11">
        <h1 className="m-0 font-serif text-[40px] font-normal tracking-[-0.02em]">
          Gap analysis
        </h1>
        <p className="mt-2.5 max-w-[61ch] font-serif text-[16px] text-[var(--muted-2)] italic">
          Real pages AI engines keep citing that confirmed do <em>not</em> mention your brand —
          ranked by how often they&apos;re cited, since that&apos;s the real cost of not being on them.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-px border-b border-[var(--rule)] bg-[var(--rule)] py-px md:grid-cols-4">
        {[
          { label: "Pages missing you", value: pagesMissing },
          { label: "Editorial share", value: `${editorialShare}%` },
          { label: "Domains involved", value: domainsCount },
          { label: "Briefs raised", value: briefs.length },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--cream)] px-5 py-5">
            <div className="text-[11px] tracking-[0.11em] text-[var(--muted-2)] uppercase">
              {s.label}
            </div>
            <div className="mt-2.5 font-serif text-[32px] leading-[1.1]">{s.value}</div>
          </div>
        ))}
      </section>

      {rivalRows.length > 0 && (
        <section className="py-8">
          <ChartCard
            title="Who's named instead"
            subtitle="Pages you're absent from, by competitor named in the answer"
          >
            <BarList
              items={rivalRows.map((r) => ({
                label: r.name,
                value: r.pages,
                sublabel: `${r.domain} · ${r.citations} citations`,
              }))}
              unit="pages"
            />
          </ChartCard>
        </section>
      )}

      {rivalRows.length > 0 && (
        <section className="border-b border-[var(--rule)] py-9">
          <div className="mb-1.5 flex items-start justify-between gap-6">
            <h2 className="m-0 font-serif text-[24px] font-normal tracking-[-0.01em]">
              Who&apos;s named instead
            </h2>
            <DownloadCsvButton
              filename="gap-competitors.csv"
              rows={rivalRows.map((r) => ({
                competitor: r.name,
                domain: r.domain,
                pages_absent_from: r.pages,
                total_citations: r.citations,
              }))}
              columns={[
                { key: "competitor", label: "Competitor" },
                { key: "domain", label: "Domain" },
                { key: "pages_absent_from", label: "Pages you're absent from" },
                { key: "total_citations", label: "Total citations" },
              ]}
            />
          </div>
          <p className="m-0 mb-5 font-serif text-[14px] text-[var(--muted-2)] italic">
            Competitors named in the AI answers behind these gap pages
          </p>
          <div className="grid grid-cols-[1fr_200px_160px] gap-6 border-b border-[var(--rule)] py-3 text-[11px] tracking-[0.12em] text-[var(--muted-2)] uppercase">
            <span>Competitor</span>
            <span className="text-right">Pages you&apos;re absent from</span>
            <span className="text-right">Total citations</span>
          </div>
          {rivalRows.map((r, i) => (
            <div
              key={r.id}
              className="grid grid-cols-[1fr_200px_160px] items-center gap-6 border-b border-[var(--rule-light)] py-4.5 hover:bg-[var(--paper)]"
            >
              <div className="flex items-baseline gap-3">
                <span className="w-[20px] font-serif text-[13px] text-[var(--faint)] italic">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-serif text-[20px] tracking-[-0.01em]">{r.name}</span>
                <span className="text-[12px] text-[var(--muted-2)]">{r.domain}</span>
              </div>
              <div className="text-right font-serif text-[24px]">{r.pages}</div>
              <div className="text-right font-serif text-[19px] text-[var(--muted-2)]">
                {r.citations}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="pt-9">
        <div className="mb-1.5 flex items-start justify-between gap-6">
          <h2 className="m-0 font-serif text-[24px] font-normal tracking-[-0.01em]">
            Pages that cite the category but never you
          </h2>
          <DownloadCsvButton
            filename="gap-pages.csv"
            rows={rows.map((r) => ({
              url: r.url,
              domain: r.domain,
              content_type: r.contentType,
              domain_type: domainTypeByDomain.get(r.domain) ?? null,
              citations: r.citations,
            }))}
            columns={[
              { key: "url", label: "URL" },
              { key: "domain", label: "Domain" },
              { key: "content_type", label: "Content type" },
              { key: "domain_type", label: "Domain type" },
              { key: "citations", label: "Citations" },
            ]}
          />
        </div>
        <p className="m-0 mb-5 font-serif text-[14px] text-[var(--muted-2)] italic">
          ranked by how often engines pull from them
        </p>
        <div className="grid grid-cols-[1fr_140px_150px_100px_140px] gap-6 border-b border-[var(--rule)] py-3.5 text-[11px] tracking-[0.12em] text-[var(--muted-2)] uppercase">
          <span>URL</span>
          <span>Content type</span>
          <span>Domain type</span>
          <span className="text-right">Citations</span>
          <span></span>
        </div>
        {rows.map((r) => {
          const promptText = promptTextById.get(r.promptId) ?? r.domain;
          const origin = `from gap: ${r.domain}`;
          return (
            <div
              key={r.url}
              className="grid grid-cols-[1fr_140px_150px_100px_140px] items-center gap-6 border-b border-[var(--rule-light)] py-5 hover:bg-[var(--paper)]"
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
              <div className="text-right font-serif text-[22px] text-[var(--rust)]">
                {r.citations}
              </div>
              <form action={createBriefFromGap.bind(null, promptText, origin)} className="text-right">
                <button
                  type="submit"
                  className="border border-[var(--ink)] px-3 py-2 font-sans text-[11px] tracking-[0.08em] text-[var(--ink)] uppercase whitespace-nowrap hover:bg-[var(--ink)] hover:text-[var(--cream)]"
                >
                  Brief this gap
                </button>
              </form>
            </div>
          );
        })}
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
