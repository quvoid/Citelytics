"use server";

import { redirect } from "next/navigation";
import { BACKEND_URL } from "@/lib/constants";
import { setCurrentProject } from "@/lib/actions/workspace";
import type { Project } from "@/lib/types";

export async function createProject(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  if (!name || !domain) throw new Error("Brand name and domain are required.");

  const res = await fetch(`${BACKEND_URL}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, domain }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Failed to create brand: ${res.status} ${res.statusText}`);
  }
  const project = (await res.json()) as Project;

  await setCurrentProject(project.id);
  redirect("/");
}
