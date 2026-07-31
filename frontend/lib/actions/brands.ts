"use server";

import { revalidatePath } from "next/cache";
import { createAnonServerClient } from "@/lib/supabase/server";
import { DEMO_PROJECT_ID } from "@/lib/constants";

function normalizeDomain(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "");
  value = value.replace(/^www\./, "");
  value = value.split("/")[0];
  return value;
}

function deriveBrandName(domain: string): string {
  const label = domain.split(".")[0] ?? domain;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export async function addBrand(formData: FormData) {
  const rawUrl = String(formData.get("url") ?? "").trim();
  const rawName = String(formData.get("name") ?? "").trim();
  const isCompetitor = formData.get("is_competitor") === "true";
  if (!rawUrl) return;

  const domain = normalizeDomain(rawUrl);
  if (!domain) return;
  const name = rawName || deriveBrandName(domain);

  const sb = createAnonServerClient();
  const { error } = await sb
    .from("tracked_urls")
    .insert({ project_id: DEMO_PROJECT_ID, url: domain, name, is_competitor: isCompetitor });

  if (error) throw new Error(`Failed to add brand: ${error.message}`);
  revalidatePath("/brands");
}

export async function removeBrand(id: string) {
  const sb = createAnonServerClient();
  const { error } = await sb.from("tracked_urls").delete().eq("id", id);
  if (error) throw new Error(`Failed to remove brand: ${error.message}`);
  revalidatePath("/brands");
}
