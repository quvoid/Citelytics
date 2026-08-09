// Fallback project (seeded by supabase/migrations/0001_init.sql), used only
// until a workspace is chosen via the switcher — see lib/current-project.ts.
export const DEMO_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
