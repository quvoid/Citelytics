"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { CURRENT_PROJECT_COOKIE } from "@/lib/current-project";

export async function setCurrentProject(projectId: string) {
  const store = await cookies();
  store.set(CURRENT_PROJECT_COOKIE, projectId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
