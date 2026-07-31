import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Anon-key client for server-side reads (RLS-protected, safe to use for
 * dashboard queries). Do not use for privileged writes.
 */
export function createAnonServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  return createClient(url, anonKey, { auth: { persistSession: false } });
}
