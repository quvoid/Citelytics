"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser client for client components (anon key only, RLS-protected). */
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
