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
};

export default nextConfig;
