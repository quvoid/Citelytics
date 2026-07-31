"use server";

import { revalidatePath } from "next/cache";
import { createAnonServerClient } from "@/lib/supabase/server";
import { DEMO_PROJECT_ID } from "@/lib/constants";

export async function addPrompt(formData: FormData) {
  const queryText = String(formData.get("query_text") ?? "").trim();
  if (!queryText) return;
  const promptType = formData.get("prompt_type") === "perception" ? "perception" : "citation";

  const sb = createAnonServerClient();
  const { error } = await sb
    .from("prompts")
    .insert({ project_id: DEMO_PROJECT_ID, query_text: queryText, prompt_type: promptType });

  if (error) throw new Error(`Failed to add prompt: ${error.message}`);
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
