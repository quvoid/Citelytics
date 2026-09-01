"use server";

import { revalidatePath } from "next/cache";
import { createAnonServerClient } from "@/lib/supabase/server";
import { getCurrentProjectId } from "@/lib/current-project";

/** Creates a tag if it doesn't already exist for this project (name is
 * unique per project — see migration 0009), otherwise no-ops rather than
 * erroring, so "add tag" always feels safe to click even on a name that's
 * already there. */
export async function createTag(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const sb = createAnonServerClient();
  const projectId = await getCurrentProjectId();
  const { error } = await sb
    .from("tags")
    .upsert({ project_id: projectId, name }, { onConflict: "project_id,name", ignoreDuplicates: true });

  if (error) throw new Error(`Failed to create tag: ${error.message}`);
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

export async function addTagToPrompt(promptId: string, tagId: string) {
  const sb = createAnonServerClient();
  const { error } = await sb
    .from("prompt_tags")
    .upsert({ prompt_id: promptId, tag_id: tagId }, { onConflict: "prompt_id,tag_id", ignoreDuplicates: true });
  if (error) throw new Error(`Failed to add tag: ${error.message}`);
  revalidatePath("/prompts");
  revalidatePath("/fanouts");
  revalidatePath("/brands");
}

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
