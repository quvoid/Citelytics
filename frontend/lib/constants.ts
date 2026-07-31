// Single-tenant demo: one hardcoded project (seeded by supabase/migrations/0001_init.sql).
export const DEMO_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
