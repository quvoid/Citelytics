import { createAnonServerClient } from "@/lib/supabase/server";
import { DEMO_PROJECT_ID } from "@/lib/constants";
import type { Prompt, QueryFanout } from "@/lib/types";

export const dynamic = "force-dynamic";

const STOPWORDS = new Set([
  "the", "a", "an", "of", "for", "and", "or", "in", "on", "to", "is", "are", "with",
  "best", "top", "how", "what", "does", "do", "you", "your", "which", "vs", "india",
]);

function bigrams(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
  const out: string[] = [];
  for (let i = 0; i < words.length - 1; i++) out.push(`${words[i]} ${words[i + 1]}`);
  return out;
}

export default async function FanoutsPage() {
  const sb = createAnonServerClient();

  const { data: prompts } = await sb
    .from("prompts")
    .select("id, project_id, query_text, active, prompt_type, topic, intent, is_branded")
    .eq("project_id", DEMO_PROJECT_ID)
    .returns<Prompt[]>();
  const promptById = new Map((prompts ?? []).map((p) => [p.id, p]));

  const { data: rawResponses } = (prompts ?? []).length
    ? await sb
        .from("raw_responses")
        .select("id, prompt_id")
        .in(
          "prompt_id",
          (prompts ?? []).map((p) => p.id)
        )
    : { data: [] as { id: string; prompt_id: string }[] };
  const promptIdByRawResponse = new Map((rawResponses ?? []).map((r) => [r.id, r.prompt_id]));
  const rawResponseIds = (rawResponses ?? []).map((r) => r.id);

  const { data: fanouts } = rawResponseIds.length
    ? await sb
        .from("query_fanouts")
        .select("id, raw_response_id, query_text")
        .in("raw_response_id", rawResponseIds)
        .returns<QueryFanout[]>()
    : { data: [] as QueryFanout[] };

  const distinctQueries = new Set((fanouts ?? []).map((f) => f.query_text.toLowerCase()));
  const totalOccurrences = fanouts?.length ?? 0;

  const byTopic = new Map<string, Map<string, number>>();
  for (const f of fanouts ?? []) {
    const promptId = promptIdByRawResponse.get(f.raw_response_id);
    const topic = (promptId && promptById.get(promptId)?.topic) || "Uncategorized";
    const topicMap = byTopic.get(topic) ?? new Map<string, number>();
    const key = f.query_text.toLowerCase();
    topicMap.set(key, (topicMap.get(key) ?? 0) + 1);
    byTopic.set(topic, topicMap);
  }
  const topicGroups = Array.from(byTopic.entries())
    .map(([topic, queries]) => ({
      topic,
      total: Array.from(queries.values()).reduce((a, b) => a + b, 0),
      queries: Array.from(queries.entries())
        .map(([query_text, count]) => ({ query_text, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15),
    }))
    .sort((a, b) => b.total - a.total);

  const phraseCounts = new Map<string, number>();
  for (const f of fanouts ?? []) {
    for (const bg of bigrams(f.query_text)) {
      phraseCounts.set(bg, (phraseCounts.get(bg) ?? 0) + 1);
    }
  }
  const topPhrases = Array.from(phraseCounts.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <div>
      <section className="border-b border-[var(--ink)] py-11">
        <h1 className="m-0 font-serif text-[40px] font-normal tracking-[-0.02em]">
          Query fanouts
        </h1>
        <p className="mt-2.5 max-w-[68ch] font-serif text-[16px] text-[var(--muted-2)] italic">
          The background sub-searches Gemini&apos;s grounding tool actually ran before answering
          your tracked prompts. OpenRouter/ChatGPT doesn&apos;t expose these, so this is Gemini-only.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-px border-b border-[var(--rule)] bg-[var(--rule)] py-11">
        <div className="bg-[var(--cream)] pr-8">
          <div className="text-[10px] tracking-[0.11em] text-[var(--muted-2)] uppercase">
            Distinct query fanouts
          </div>
          <div className="mt-2.5 font-serif text-[40px] leading-[1.1]">{distinctQueries.size}</div>
        </div>
        <div className="bg-[var(--cream)] pl-8">
          <div className="text-[10px] tracking-[0.11em] text-[var(--muted-2)] uppercase">
            Total occurrences
          </div>
          <div className="mt-2.5 font-serif text-[40px] leading-[1.1]">{totalOccurrences}</div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-14 py-11 md:grid-cols-[1.5fr_1fr]">
        <div>
          <h2 className="m-0 mb-1.5 font-serif text-[24px] font-normal tracking-[-0.01em]">
            All queries
          </h2>
          <p className="m-0 mb-6 font-serif text-[14px] text-[var(--muted-2)] italic">
            Where Gemini gets its information about this topic
          </p>
          {topicGroups.map((g) => (
            <div key={g.topic} className="mb-8">
              <div className="flex items-baseline gap-2.5 border-b border-[var(--ink)] pb-2">
                <span className="font-serif text-[19px]">{g.topic}</span>
                <span className="font-serif text-[13px] text-[var(--faint)] italic">{g.total}</span>
              </div>
              {g.queries.map((q) => (
                <div
                  key={q.query_text}
                  className="flex items-center justify-between gap-4 border-b border-[var(--rule-light)] py-2.5"
                >
                  <span className="text-[13.5px] text-[var(--ink)]">{q.query_text}</span>
                  <span className="font-serif text-[15px] text-[var(--muted-2)]">{q.count}</span>
                </div>
              ))}
            </div>
          ))}
          {!topicGroups.length && (
            <p className="font-serif text-[15px] text-[var(--muted-2)] italic">
              No fanout data yet — run &ldquo;Fetch citations now&rdquo; to capture Gemini&apos;s
              search queries.
            </p>
          )}
        </div>

        <div>
          <h2 className="m-0 mb-1.5 font-serif text-[24px] font-normal tracking-[-0.01em]">
            Common phrases
          </h2>
          <p className="m-0 mb-6 font-serif text-[14px] text-[var(--muted-2)] italic">
            Most frequent word pairs across all fanout queries
          </p>
          {topPhrases.map(([phrase, count]) => (
            <div
              key={phrase}
              className="flex items-center justify-between gap-4 border-b border-[var(--rule-light)] py-2.5"
            >
              <span className="text-[13.5px] text-[var(--ink)]">{phrase}</span>
              <span className="font-serif text-[15px] text-[var(--muted-2)]">{count}</span>
            </div>
          ))}
          {!topPhrases.length && (
            <p className="font-serif text-[14px] text-[var(--muted-2)] italic">
              Not enough repeated phrases yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
