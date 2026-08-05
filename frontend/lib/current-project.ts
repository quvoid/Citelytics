import { cookies } from "next/headers";
import { DEMO_PROJECT_ID } from "@/lib/constants";

export const CURRENT_PROJECT_COOKIE = "cly_project_id";

/** Resolves the active workspace from the switcher's cookie (set by
 * setCurrentProject). Falls back to the seeded demo project when unset —
 * e.g. on a first visit before any workspace has been chosen. */
export async function getCurrentProjectId(): Promise<string> {
  const store = await cookies();
  return store.get(CURRENT_PROJECT_COOKIE)?.value || DEMO_PROJECT_ID;
}
