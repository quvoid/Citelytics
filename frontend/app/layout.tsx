import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";
import { HapticFeedback } from "@/components/haptic-feedback";
import { HoverSidebar } from "@/components/hover-sidebar";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { NavigationProgressBar } from "@/components/navigation-progress-bar";
import { getLayoutData } from "@/lib/layout-data";
import { logoDomains } from "@/lib/logo-domains";

/** Round 4 reskin: Sora, matching schbang.com's actual typeface (confirmed
 * live via computed styles, not guessed) — one grotesk across the whole
 * app, weight/size doing the contrast work a separate serif used to. Both
 * --font-sans AND --font-serif point at this same variable in globals.css's
 * @theme block, so the ~137 existing font-serif call sites repaint for free
 * with no per-component edits — same aliasing trick this file already used
 * for --rust -> --ember. Self-hosted via next/font, not a render-blocking
 * fonts.googleapis.com @import. */
const sora = Sora({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-sora",
});

export const metadata: Metadata = {
  title: "Citelytics — AI Citation Intelligence",
  description: "Track how often your content gets cited by AI answer engines.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const data = await getLayoutData();

  return (
    <html lang="en" className={`${sora.variable} overflow-x-clip antialiased`}>
      {/* overflow-x-clip (NOT overflow-x-hidden) on both html and body: any
          card that miscalculates its own width should scroll internally
          (see the overflow-x-auto wrappers in components/segment-heatmap.tsx,
          top-rankings.tsx, top-brands-table etc.), never force the whole
          document wider. `hidden` was tried first and broke the sidebar's
          fixed positioning (pairing overflow-x:hidden with the default
          overflow-y:visible makes the UA silently convert overflow-y to
          `auto` too — CSS Overflow's axis-coupling rule — which turns
          <body>/<html> into their own scroll containers). `clip` is exempt
          from that coupling. */}
      <body className="min-h-screen overflow-x-clip bg-background font-sans text-[15px] text-foreground">
        <NavigationProgressBar />
        <HapticFeedback />
        {/* HoverSidebar needs real hover, which a touchscreen doesn't have —
            hidden below `sm` in favor of MobileTabBar's floating pill, the
            mirror image of this same rule in that component. */}
        <div className="hidden sm:block">
          <HoverSidebar data={data} logoDomains={[...logoDomains()]} />
        </div>
        <MobileTabBar />
        {/* The Trendtrack-style shell: a flush-left dark rail, then the
            ENTIRE rest of the app sits in one large rounded card floating
            on the page's warm-gray canvas (--bg), with a visible gap on
            every side — not just Insights getting its own card, the whole
            app shaped this way. pl-[88px] clears the 72px collapsed rail
            plus a real gap (the rail is `position: fixed` and overlays
            rather than pushes the content column when it expands on hover,
            so this padding never changes on hover) — 0 below `sm`, where
            there's no rail to clear. pb-28 below `sm` clears MobileTabBar's
            floating pill instead. */}
        <div className="min-w-0 py-4 pr-4 pb-28 pl-4 sm:pb-4 sm:pl-[88px]">
          <div
            className="mx-auto min-w-0 max-w-[1280px] rounded-[var(--radius-2xl)] bg-[var(--card)] sm:rounded-[var(--radius-4xl)]"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <main className="min-w-0 px-4 pt-6 sm:px-8 sm:pt-8">{children}</main>
            <footer className="mt-14 flex flex-col justify-between gap-1 px-4 pt-5 pb-8 font-sans text-[12.5px] text-[var(--faint)] sm:flex-row sm:px-8">
              <span>Citelytics · real citations from Gemini &amp; ChatGPT</span>
              <span>Filled dots mark real fetches; hollow dots mark simulated demo records.</span>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
