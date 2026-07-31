import { AddBrandForm } from "@/components/add-brand-form";
import { createAnonServerClient } from "@/lib/supabase/server";
import { DEMO_PROJECT_ID } from "@/lib/constants";
import { BrandsTable } from "@/components/brands-table";
import type { AnswerBrandMention, Citation, Prompt, TrackedUrl } from "@/lib/types";

export const dynamic = "force-dynamic";

function matchesDomain(citationDomain: string, brandDomain: string): boolean {
  return citationDomain === brandDomain || citationDomain.endsWith(`.${brandDomain}`);
}

export default async function BrandsPage() {
  const sb = createAnonServerClient();

  const { data: brands } = await sb
    .from("tracked_urls")
    .select("id, project_id, url, name, is_competitor")
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
        .select(
          "id, prompt_id, engine_id, url, domain, is_simulated, raw_response_id, mentions_brand, content_type, fetched_at"
        )
        .in("prompt_id", promptIds)
        .returns<Citation[]>()
    : { data: [] as Citation[] };

  const { data: rawResponses } = promptIds.length
    ? await sb.from("raw_responses").select("id").in("prompt_id", promptIds)
    : { data: [] as { id: string }[] };
  const rawResponseIds = (rawResponses ?? []).map((r) => r.id);

  const { data: mentions } = rawResponseIds.length
    ? await sb
        .from("answer_brand_mentions")
        .select("id, raw_response_id, tracked_url_id, mentioned, position")
        .in("raw_response_id", rawResponseIds)
        .returns<AnswerBrandMention[]>()
    : { data: [] as AnswerBrandMention[] };

  const totalAnswers = rawResponseIds.length;
  const totalMentionedAcrossAllBrands = (mentions ?? []).filter((m) => m.mentioned).length;

  const rows = (brands ?? []).map((b) => {
    const matchedCitations = (citations ?? []).filter((c) => matchesDomain(c.domain, b.url));
    const brandMentions = (mentions ?? []).filter((m) => m.tracked_url_id === b.id && m.mentioned);
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
