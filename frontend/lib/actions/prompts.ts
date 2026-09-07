"use server";

import { revalidatePath } from "next/cache";
import { createAnonServerClient } from "@/lib/supabase/server";
import { getCurrentProjectId } from "@/lib/current-project";
import { COUNTRIES } from "@/lib/countries";
import { matchesAnyText } from "@/lib/tag-match";

/** Resolves the composer's Category field to a topic row, creating one if
 * the user typed a new name rather than picking an existing option.
 * `raw` is either an existing topic's id (dropdown selection) or a
 * brand-new name (the "+ add new" input) — the composer sends whichever
 * one the user actually used, prefixed so this can tell them apart without
 * a second form field. Returns null for "no category chosen", which is a
 * legitimate state (Uncategorized), not an error. */
async function resolveTopic(
  sb: ReturnType<typeof createAnonServerClient>,
  projectId: string,
  raw: string,
): Promise<{ id: string; name: string } | null> {
  if (!raw) return null;
  if (raw.startsWith("id:")) {
    const id = raw.slice(3);
    const { data } = await sb.from("topics").select("id, name").eq("id", id).maybeSingle();
    return data ?? null;
  }
  const name = raw.startsWith("new:") ? raw.slice(4).trim() : raw.trim();
  if (!name) return null;
  // Manually chosen, never AI-suggested — matches the whole point of this
  // feature (see topics.is_ai_suggested, migration 0010).
  const { data, error } = await sb
    .from("topics")
    .upsert(
      { project_id: projectId, name, is_ai_suggested: false },
      { onConflict: "project_id,name", ignoreDuplicates: true },
    )
    .select("id, name")
    .maybeSingle();
  if (error) throw new Error(`Failed to create category: ${error.message}`);
  if (data) return data;
  // Upsert with ignoreDuplicates returns no row when the name already
  // existed — re-select it (and flip is_ai_suggested off, since a human
  // just chose it by name even if it started life as a guess).
  const existing = await sb
    .from("topics")
    .select("id, name")
    .eq("project_id", projectId)
    .eq("name", name)
    .maybeSingle();
  if (existing.data) {
    await sb.from("topics").update({ is_ai_suggested: false }).eq("id", existing.data.id);
  }
  return existing.data ?? null;
}

export async function addPrompt(formData: FormData) {
  const queryText = String(formData.get("query_text") ?? "").trim();
  if (!queryText) return;
  const promptType = formData.get("prompt_type") === "perception" ? "perception" : "citation";

  // "" is the composer's "use the project's market" option — store null so
  // the prompt keeps following the project if that default ever changes,
  // rather than being frozen to whatever it happened to be today.
  const rawCountry = String(formData.get("country") ?? "").trim().toUpperCase();
  const country = COUNTRIES.some((c) => c.code === rawCountry) ? rawCountry : null;

  // Google Trends interest, 0-100 — set only by a one-off backfill script
  // historically; the composer never sends this field itself. Kept as a
  // pass-through rather than removed, since a caller could still supply it.
  const rawVolume = formData.get("search_volume");
  const searchVolume =
    rawVolume !== null && rawVolume !== "" && !Number.isNaN(Number(rawVolume))
      ? Math.max(0, Math.min(100, Math.round(Number(rawVolume))))
      : null;

  const sb = createAnonServerClient();
  const projectId = await getCurrentProjectId();

  const topic = await resolveTopic(sb, projectId, String(formData.get("category") ?? "").trim());

  const { data: inserted, error } = await sb
    .from("prompts")
    .insert({
      project_id: projectId,
      query_text: queryText,
      prompt_type: promptType,
      country,
      topic_id: topic?.id ?? null,
      // Kept in sync with topic_id's name so every existing free-text
      // consumer (rollups, Chats log) keeps working unmodified.
      topic: topic?.name ?? null,
      search_volume: searchVolume,
      search_volume_checked_at: searchVolume !== null ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to add prompt: ${error.message}`);

  // Auto-match tagging (the only way a prompt is ever tagged now — see
  // tag-picker.tsx and lib/actions/tags.ts's createTag, which does the same
  // scan in the other direction): every existing tag whose name shows up in
  // this brand-new prompt's own text gets linked immediately, without
  // waiting for its first fetch. An answer arriving later can add more
  // (backend/store.py's auto_link_tags runs the same check server-side).
  const { data: tags } = await sb.from("tags").select("id, name").eq("project_id", projectId);
  const matchedTagIds = (tags ?? [])
    .filter((t) => matchesAnyText(t.name, [queryText]))
    .map((t) => t.id);
  if (matchedTagIds.length) {
    const { error: linkError } = await sb
      .from("prompt_tags")
      .upsert(
        matchedTagIds.map((tag_id) => ({ prompt_id: inserted.id, tag_id })),
        { onConflict: "prompt_id,tag_id", ignoreDuplicates: true },
      );
    if (linkError) throw new Error(`Failed to auto-link tags: ${linkError.message}`);
  }

  revalidatePath("/prompts");
  revalidatePath("/perception");
  revalidatePath("/");
}

export async function setPromptActive(promptId: string, active: boolean) {
  const sb = createAnonServerClient();
  const { error } = await sb.from("prompts").update({ active }).eq("id", promptId);
  if (error) throw new Error(`Failed to update prompt: ${error.message}`);
  revalidatePath("/prompts");
  revalidatePath("/");
}
