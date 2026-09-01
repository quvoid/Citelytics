"use server";

import { revalidatePath } from "next/cache";
import { createAnonServerClient } from "@/lib/supabase/server";
import { getCurrentProjectId } from "@/lib/current-project";

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

/** Comma-separated free text -> a clean array. Shared by add and update so
 * "Moto, Lenovo Motorola, " normalizes the same way in both places. */
function parseAliases(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export async function addBrand(formData: FormData) {
  const rawUrl = String(formData.get("url") ?? "").trim();
  const rawName = String(formData.get("name") ?? "").trim();
  const isCompetitor = formData.get("is_competitor") === "true";
  const aliases = parseAliases(String(formData.get("aliases") ?? ""));
  if (!rawUrl) return;

  const domain = normalizeDomain(rawUrl);
  if (!domain) return;
  const name = rawName || deriveBrandName(domain);

  const sb = createAnonServerClient();
  const projectId = await getCurrentProjectId();
  const { error } = await sb
    .from("tracked_urls")
    .insert({ project_id: projectId, url: domain, name, is_competitor: isCompetitor, aliases });

  if (error) throw new Error(`Failed to add brand: ${error.message}`);
  revalidatePath("/brands");
}

export async function removeBrand(id: string) {
  const sb = createAnonServerClient();
  const { error } = await sb.from("tracked_urls").delete().eq("id", id);
  if (error) throw new Error(`Failed to remove brand: ${error.message}`);
  revalidatePath("/brands");
}

/** The first edit path a tracked brand has ever had (migration 0014 added
 * the update RLS policy tracked_urls never had before). Classifier matching
 * picks this up on the NEXT fetch — not retroactively; the reclassify
 * backfill is the retroactive path if you want history rescored too. */
export async function updateBrandAliases(id: string, aliasesInput: string) {
  const aliases = parseAliases(aliasesInput);
  const sb = createAnonServerClient();
  const { error } = await sb.from("tracked_urls").update({ aliases }).eq("id", id);
  if (error) throw new Error(`Failed to update aliases: ${error.message}`);
  revalidatePath("/brands");
}
