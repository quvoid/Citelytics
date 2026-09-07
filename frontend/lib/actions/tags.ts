"use server";

import { revalidatePath } from "next/cache";
import { createAnonServerClient } from "@/lib/supabase/server";
import { getCurrentProjectId } from "@/lib/current-project";
import { matchesAnyText } from "@/lib/tag-match";

/** Creates a tag if it doesn't already exist for this project (name is
 * unique per project — see migration 0009), otherwise no-ops rather than
 * erroring, so "add tag" always feels safe to click even on a name that's
 * already there.
 *
 * Auto-match tagging (the only way a prompt is ever tagged now — see
 * components/tag-picker.tsx and backend/store.py's auto_link_tags): a brand
 * new tag is immediately scanned against every existing prompt's query text
 * AND every one of its answers, so "add Moto Fusion as a tag" retroactively
 * tags every prompt that already mentions it, not just future ones. */
export async function createTag(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const sb = createAnonServerClient();
  const projectId = await getCurrentProjectId();
  const { data: tagRow, error } = await sb
    .from("tags")
    .upsert({ project_id: projectId, name }, { onConflict: "project_id,name", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Failed to create tag: ${error.message}`);

  // ignoreDuplicates means an existing tag returns no row here — re-select
  // it so the scan below still runs (re-adding an existing tag name is also
  // how a user would ask "re-scan for this tag", harmless to repeat).
  const tagId =
    tagRow?.id ??
    (
      await sb.from("tags").select("id").eq("project_id", projectId).eq("name", name).maybeSingle()
    ).data?.id;
  if (!tagId) return;

  const { data: prompts } = await sb.from("prompts").select("id, query_text").eq("project_id", projectId);
  const promptIds = (prompts ?? []).map((p) => p.id);
  // raw_responses has no project_id of its own — it's reached through
  // prompt_id, same as everywhere else in this codebase that joins the two.
  const { data: responses } = promptIds.length
    ? await sb.from("raw_responses").select("prompt_id, answer_text").in("prompt_id", promptIds)
    : { data: [] as { prompt_id: string; answer_text: string | null }[] };

  const answersByPrompt = new Map<string, string[]>();
  for (const r of responses ?? []) {
    const list = answersByPrompt.get(r.prompt_id) ?? [];
    if (r.answer_text) list.push(r.answer_text);
    answersByPrompt.set(r.prompt_id, list);
  }

  const matches = (prompts ?? [])
    .filter((p) => matchesAnyText(name, [p.query_text, ...(answersByPrompt.get(p.id) ?? [])]))
    .map((p) => ({ prompt_id: p.id, tag_id: tagId }));

  if (matches.length) {
    const { error: linkError } = await sb
      .from("prompt_tags")
      .upsert(matches, { onConflict: "prompt_id,tag_id", ignoreDuplicates: true });
    if (linkError) throw new Error(`Failed to auto-link tag: ${linkError.message}`);
  }

  revalidatePath("/prompts");
  revalidatePath("/fanouts");
  revalidatePath("/brands");
}

export async function renameTag(tagId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const sb = createAnonServerClient();
  const { error } = await sb.from("tags").update({ name: trimmed }).eq("id", tagId);
  if (error) throw new Error(`Failed to rename tag: ${error.message}`);
  revalidatePath("/prompts");
  revalidatePath("/fanouts");
  revalidatePath("/brands");
}

/** Deletes the tag entirely — cascades to prompt_tags (migration 0009), so
 * every prompt carrying it just loses that one tag, nothing else. */
export async function deleteTag(tagId: string) {
  const sb = createAnonServerClient();
  const { error } = await sb.from("tags").delete().eq("id", tagId);
  if (error) throw new Error(`Failed to delete tag: ${error.message}`);
  revalidatePath("/prompts");
  revalidatePath("/fanouts");
  revalidatePath("/brands");
}

/** Sets or clears a tag's group label (migration 0017's `tags.group_name`).
 * Thin by design, matching Peec's own API surface — there's no separate
 * group entity to create, a group is just a shared label on the tag. Empty
 * string clears it back to ungrouped rather than storing "". */
export async function updateTagGroup(tagId: string, groupName: string) {
  const trimmed = groupName.trim();
  const sb = createAnonServerClient();
  const { error } = await sb
    .from("tags")
    .update({ group_name: trimmed || null })
    .eq("id", tagId);
  if (error) throw new Error(`Failed to update tag group: ${error.message}`);
  revalidatePath("/prompts");
  revalidatePath("/fanouts");
  revalidatePath("/brands");
  revalidatePath("/insights");
}

/** Manual override only — removes a bad auto-match. Nothing calls the
 * inverse (a manual "add") any more; see createTag/addPrompt for the only
 * two ways a prompt_tags row gets written now. */
export async function removeTagFromPrompt(promptId: string, tagId: string) {
  const sb = createAnonServerClient();
  const { error } = await sb
    .from("prompt_tags")
    .delete()
    .eq("prompt_id", promptId)
    .eq("tag_id", tagId);
  if (error) throw new Error(`Failed to remove tag: ${error.message}`);
  revalidatePath("/prompts");
  revalidatePath("/fanouts");
  revalidatePath("/brands");
}
