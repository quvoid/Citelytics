import { AddBrandForm } from "@/components/add-brand-form";
import { BrandsTable } from "@/components/brands-table";
import {
  getAnswerBrandMentions,
  getCitations,
  getRawResponses,
  getTrackedUrls,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

function matchesDomain(citationDomain: string, brandDomain: string): boolean {
  return citationDomain === brandDomain || citationDomain.endsWith(`.${brandDomain}`);
}

export default async function BrandsPage() {
  const [brands, citations, rawResponses] = await Promise.all([
    getTrackedUrls(),
    getCitations(),
    getRawResponses(),
  ]);

  const mentions = await getAnswerBrandMentions(rawResponses.map((r) => r.id));

  const totalAnswers = rawResponses.length;
  const totalMentionedAcrossAllBrands = mentions.filter((m) => m.mentioned).length;

  const rows = brands.map((b) => {
    const matchedCitations = citations.filter((c) => matchesDomain(c.domain, b.url));
    const brandMentions = mentions.filter((m) => m.tracked_url_id === b.id && m.mentioned);
    const positions = brandMentions.map((m) => m.position).filter((p): p is number => p !== null);
    const avgPosition = positions.length ? positions.reduce((a, c) => a + c, 0) / positions.length : null;

    return {
      ...b,
      visibility: totalAnswers ? Math.round((brandMentions.length / totalAnswers) * 100) : 0,
      shareOfVoice: totalMentionedAcrossAllBrands
        ? Math.round((brandMentions.length / totalMentionedAcrossAllBrands) * 100)
        : 0,
      answers: brandMentions.length,
      avgPosition,
      pages: new Set(matchedCitations.map((c) => c.url)).size,
    };
  });

  return (
    <div>
      <section className="flex items-end justify-between gap-10 border-b border-[var(--ink)] py-11">
        <div>
          <h1 className="m-0 font-serif text-[40px] font-normal tracking-[-0.02em]">Brands</h1>
          <p className="mt-2.5 max-w-[68ch] font-serif text-[16px] text-[var(--muted-2)] italic">
            Share of voice across {totalAnswers} tracked AI answers — how often each brand is
            actually named, not just cited as a domain.
          </p>
        </div>
      </section>

      <AddBrandForm />

      <BrandsTable rows={rows} />
    </div>
  );
}
