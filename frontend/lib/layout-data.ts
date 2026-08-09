import { createAnonServerClient } from "@/lib/supabase/server";
import { getCurrentProjectId } from "@/lib/current-project";
import { getProjects } from "@/lib/queries";
import type { Project } from "@/lib/types";

export type LayoutData = {
  projectId: string;
  projects: Project[];
  current: Project;
  promptCount: number;
  brandCount: number;
  briefCount: number;
};

/** Everything the sidebar + top bar need, computed once per request in the
 * root layout and passed down — avoids each chrome piece re-querying the
 * same counts independently. */
export async function getLayoutData(): Promise<LayoutData> {
  const projectId = await getCurrentProjectId();
  const sb = createAnonServerClient();

  const [projects, { data: prompts }] = await Promise.all([
    getProjects(),
    sb.from("prompts").select("id, prompt_type").eq("project_id", projectId),
  ]);

  const citationPromptCount = (prompts ?? []).filter((p) => p.prompt_type === "citation").length;

  const [{ count: brandCount }, { count: briefCount }] = await Promise.all([
    sb.from("tracked_urls").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    sb.from("content_briefs").select("id", { count: "exact", head: true }).eq("project_id", projectId),
  ]);

  const fallback: Project = {
    id: projectId,
    name: "Untitled brand",
    domain: "",
    default_country: "IN",
  };
  const current = projects.find((p) => p.id === projectId) ?? projects[0] ?? fallback;

  return {
    projectId,
    projects,
    current,
    promptCount: citationPromptCount,
    brandCount: brandCount ?? 0,
    briefCount: briefCount ?? 0,
  };
}
