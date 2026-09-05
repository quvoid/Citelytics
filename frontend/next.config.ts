import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server only trusts the hostname it was started with — "localhost"
  // by default — and blocks /_next/ dev resources requested from any other
  // origin. We browse this app on 127.0.0.1 (the project's .env.local points
  // server-side fetches there too, because "localhost" resolves to IPv6 ::1
  // and the backend listens on IPv4), so every client chunk and the HMR
  // websocket were being refused.
  //
  // The visible symptom was NOT an error page: pages rendered fine because the
  // server components had already run. React simply never hydrated, so every
  // "use client" component was inert — the workspace switcher wouldn't open,
  // tag pickers did nothing, sortable headers didn't sort. Dev-only setting.
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  // Every route in this app is `export const dynamic = "force-dynamic"` —
  // real Supabase reads on every request, since Celery drives real changes
  // in the background. Next.js 15+ changed the CLIENT-side router cache's
  // default freshness window for exactly this kind of page from 30s to 0s
  // (see staleTimes.md's Version History) — meaning every navigation, even
  // clicking straight back to a page visited seconds ago, discarded the
  // cache and re-ran the full server render. That's the literal cause of
  // "I click Prompts (fine), click back to Overview, it renders again too".
  // 30s restores the pre-v15 default: navigating back to any page within
  // 30s of last visiting it reuses the cached render instantly, no server
  // round-trip; past 30s it fetches fresh again. 30s is short enough that
  // nothing here goes stale in any way that matters — this app's real data
  // changes on Celery's hourly/daily schedule, not sub-minute — while being
  // long enough to cover the actual complaint (clicking between a couple of
  // tabs while looking at something).
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
