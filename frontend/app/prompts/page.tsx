import { createAnonServerClient } from "@/lib/supabase/server";
import { DEMO_PROJECT_ID } from "@/lib/constants";
import { AddPromptForm } from "@/components/add-prompt-form";
import { PromptsTable, type PromptRow } from "@/components/prompts-table";
import type { Citation, Prompt, RawResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PromptsPage() {
  const sb = createAnonServerClient();
  const { data: prompts } = await sb
    .from("prompts")
    .select("id, project_id, query_text, active, prompt_type, topic, intent, is_branded")
    .eq("project_id", DEMO_PROJECT_ID)
    .eq("prompt_type", "citation")
    .order("query_text")
    .returns<Prompt[]>();

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
    ? await sb
        .from("raw_responses")
        .select(
          "id, prompt_id, engine_id, answer_text, brand_mentioned_in_answer, brand_sentiment_score, brand_position, fetched_at"
        )
        .in("prompt_id", promptIds)
        .returns<RawResponse[]>()
    : { data: [] as RawResponse[] };

  const stats = new Map<
    string,
    { citations: number; mentions: number; real: boolean; lastFetched: string | null; sentiments: number[]; positions: number[] }
  >();
  for (const c of citations ?? []) {
    const s = stats.get(c.prompt_id) ?? {
      citations: 0,
      mentions: 0,
      real: false,
      lastFetched: null,
      sentiments: [],
      positions: [],
    };
    s.citations += 1;
    if (c.mentions_brand === true) s.mentions += 1;
    if (!c.is_simulated) s.real = true;
    if (!s.lastFetched || c.fetched_at > s.lastFetched) s.lastFetched = c.fetched_at;
    stats.set(c.prompt_id, s);
  }
  for (const r of rawResponses ?? []) {
    const s = stats.get(r.prompt_id) ?? {
      citations: 0,
      mentions: 0,
      real: false,
      lastFetched: null,
      sentiments: [],
      positions: [],
    };
    if (r.brand_sentiment_score !== null) s.sentiments.push(r.brand_sentiment_score);
    if (r.brand_position !== null) s.positions.push(r.brand_position);
    stats.set(r.prompt_id, s);
  }

  const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null);

  const rows: PromptRow[] = (prompts ?? []).map((p) => {
    const s = stats.get(p.id) ?? {
      citations: 0,
      mentions: 0,
      real: false,
      lastFetched: null,
      sentiments: [],
      positions: [],
    };
    return {
      ...p,
      citations: s.citations,
      mentions: s.mentions,
      real: s.real,
      lastFetched: s.lastFetched,
      avgSentiment: avg(s.sentiments),
      avgPosition: avg(s.positions),
    };
  });

  return (
    <div>
      <section className="flex items-end justify-between gap-10 border-b border-[var(--ink)] py-9">
        <div>
          <h1 className="m-0 font-serif text-[40px] font-normal tracking-[-0.02em]">
            Tracked prompts
          </h1>
          <p className="mt-2.5 font-serif text-[16px] text-[var(--muted-2)] italic">
            {rows.length} prompts, {rows.filter((r) => r.active).length} active — queried on each
            &ldquo;Fetch citations&rdquo; run.
          </p>
        </div>
      </section>

      <AddPromptForm />

      <PromptsTable prompts={rows} />
    </div>
  );
}
