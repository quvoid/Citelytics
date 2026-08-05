"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { BACKEND_URL } from "@/lib/constants";
import { getCurrentProjectId } from "@/lib/current-project";
import type { ContentBrief } from "@/lib/types";

async function postBrief(promptText: string, origin: string): Promise<ContentBrief> {
  const projectId = await getCurrentProjectId();
  const res = await fetch(`${BACKEND_URL}/api/content-briefs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, prompt_text: promptText, origin }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Failed to create brief: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ContentBrief;
}

export async function createBrief(formData: FormData) {
  const promptText = String(formData.get("prompt_text") ?? "").trim();
  if (!promptText) throw new Error("A prompt or topic is required.");
  const brief = await postBrief(promptText, "manual entry");
  revalidatePath("/briefs");
  redirect(`/briefs/${brief.id}`);
}

export async function createBriefFromGap(promptText: string, origin: string) {
  const brief = await postBrief(promptText, origin);
  revalidatePath("/briefs");
  redirect(`/briefs/${brief.id}`);
}
