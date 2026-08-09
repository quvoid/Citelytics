"use server";

import { revalidatePath } from "next/cache";
import { createAnonServerClient } from "@/lib/supabase/server";
import { getCurrentProjectId } from "@/lib/current-project";
import { COUNTRIES } from "@/lib/countries";

export async function addPrompt(formData: FormData) {
  const queryText = String(formData.get("query_text") ?? "").trim();
  if (!queryText) return;
  const promptType = formData.get("prompt_type") === "perception" ? "perception" : "citation";

  // "" is the composer's "use the project's market" option — store null so
  // the prompt keeps following the project if that default ever changes,
  // rather than being frozen to whatever it happened to be today.
  const rawCountry = String(formData.get("country") ?? "").trim().toUpperCase();
  const country = COUNTRIES.some((c) => c.code === rawCountry) ? rawCountry : null;

  const sb = createAnonServerClient();
  const projectId = await getCurrentProjectId();
  const { error } = await sb
    .from("prompts")
    .insert({ project_id: projectId, query_text: queryText, prompt_type: promptType, country });

  if (error) throw new Error(`Failed to add prompt: ${error.message}`);
  revalidatePath("/prompts");
  revalidatePath("/perception");
  revalidatePath("/");
}

export async function setPromptCountry(promptId: string, country: string | null) {
  const code = country && COUNTRIES.some((c) => c.code === country) ? country : null;
  const sb = createAnonServerClient();
  const { error } = await sb.from("prompts").update({ country: code }).eq("id", promptId);
  if (error) throw new Error(`Failed to update prompt market: ${error.message}`);
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
