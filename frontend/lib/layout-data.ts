import { createAnonServerClient } from "@/lib/supabase/server";
import { getCurrentProjectId } from "@/lib/current-project";
import { getProjects, getPrompts } from "@/lib/queries";
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

  // All four in ONE batch. This used to be two sequential Promise.all
  // phases (projects + prompts, THEN the two counts) even though the counts
  // never depended on the first phase — a second ~230ms Supabase round trip
  // paid on every single page load, since this runs in the root layout.
  // getPrompts is the same per-request-cached read the pages use, so a page
  // that also lists prompts shares this fetch instead of repeating it.
  const [projects, prompts, { count: brandCount }, { count: briefCount }] = await Promise.all([
    getProjects(),
    getPrompts(undefined, projectId),
    sb.from("tracked_urls").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    sb.from("content_briefs").select("id", { count: "exact", head: true }).eq("project_id", projectId),
  ]);

  const citationPromptCount = prompts.filter((p) => p.prompt_type === "citation").length;

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
