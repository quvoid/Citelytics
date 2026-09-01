"use server";

import { createAnonServerClient } from "@/lib/supabase/server";
import {
  parseEngineDetail,
  resolveRedirectSources,
  type EngineAnswerDetail,
} from "@/lib/engine-details";

export type PromptDetailPayload = {
  queryText: string;
  answers: (EngineAnswerDetail & {
    rawResponseId: string;
    country: string | null;
    fetchedAt: string;
  })[];
};

/**
 * Everything one prompt's answers contain, per engine — the answer text, the
 * sources, the engine's own mini-searches, and (where the engine exposes it)
 * which span of the answer each source actually backs.
 *
 * A server action rather than page data on purpose: `raw_response` is a large
 * jsonb blob per answer, and the prompts list renders 100+ rows. Loading it
 * only when a card is actually opened keeps the list page's payload unchanged.
 */
export async function getPromptDetail(promptId: string): Promise<PromptDetailPayload | null> {
  const sb = createAnonServerClient();

  const { data: prompt } = await sb
    .from("prompts")
    .select("id, query_text")
    .eq("id", promptId)
    .maybeSingle<{ id: string; query_text: string }>();
  if (!prompt) return null;

  // raw_response is deliberately NOT in queries.ts's shared RAW_RESPONSE_COLS —
  // it is only ever wanted here, and adding it there would put a large blob on
  // every list page that selects a raw response.
  const { data: rows, error } = await sb
    .from("raw_responses")
    .select("id, engine_id, answer_text, raw_response, country, fetched_at")
    .eq("prompt_id", promptId)
    .order("fetched_at", { ascending: false })
    .returns<
      {
        id: string;
        engine_id: string;
        answer_text: string | null;
        raw_response: unknown;
        country: string | null;
        fetched_at: string;
      }[]
    >();
  if (error) throw new Error(`Failed to load prompt detail: ${error.message}`);

  const { data: engines } = await sb.from("engines").select("id, name").returns<
    { id: string; name: string }[]
  >();
  const engineName = new Map((engines ?? []).map((e) => [e.id, e.name]));

  // Resolved article URLs, to swap in over Gemini's redirect-proxy URIs (see
  // resolveRedirectSources). Ordered by `position`, which is the engine's own
  // citation order — the same order the grounding chunks were enumerated in.
  const { data: cites } = await sb
    .from("citations")
    .select("raw_response_id, url, position")
    .in("raw_response_id", (rows ?? []).map((r) => r.id))
    .order("position", { ascending: true })
    .returns<{ raw_response_id: string; url: string; position: number | null }[]>();
  const urlsByResponse = new Map<string, string[]>();
  for (const c of cites ?? []) {
    const list = urlsByResponse.get(c.raw_response_id) ?? [];
    list.push(c.url);
    urlsByResponse.set(c.raw_response_id, list);
  }

  // One card per engine — the most recent answer for each. An older re-fetch
  // of the same engine is history, not a second engine, and stacking both
  // would read as "two engines answered".
  const seen = new Set<string>();
  const answers: PromptDetailPayload["answers"] = [];
  for (const r of rows ?? []) {
    if (seen.has(r.engine_id)) continue;
    seen.add(r.engine_id);
    const parsed = parseEngineDetail(
      engineName.get(r.engine_id) ?? "unknown",
      r.raw_response,
      r.answer_text,
    );
    answers.push({
      ...resolveRedirectSources(parsed, urlsByResponse.get(r.id) ?? []),
      rawResponseId: r.id,
      country: r.country,
      fetchedAt: r.fetched_at,
    });
  }

  return { queryText: prompt.query_text, answers };
}
