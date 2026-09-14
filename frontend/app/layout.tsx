import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";
import { HapticFeedback } from "@/components/haptic-feedback";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { NavigationProgressBar } from "@/components/navigation-progress-bar";
import { Sidebar } from "@/components/sidebar";
import { getLayoutData } from "@/lib/layout-data";

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
          sticky positioning (pairing overflow-x:hidden with the default
          overflow-y:visible makes the UA silently convert overflow-y to
          `auto` too — CSS Overflow's axis-coupling rule — which turns
          <body>/<html> into their own scroll containers). `clip` is exempt
          from that coupling. */}
      <body className="min-h-screen overflow-x-clip bg-background font-sans text-[15px] text-foreground">
        <NavigationProgressBar />
        <HapticFeedback />
        {/* Static, always-open sidebar — back to how this was before the
            hover-to-expand experiment. `sticky` (not `fixed`), so it's a
            normal flex sibling of the content column: it reserves its own
            248px, nothing needs padding to "clear" it, and there's no
            hover state to get wrong. Hidden below `sm` in favor of
            MobileTabBar's floating pill (no hover on a touchscreen either
            way), the mirror image of that component's own `sm:hidden`. */}
        <div className="flex min-h-screen">
          <div className="hidden sm:block">
            <Sidebar data={data} />
          </div>
          <MobileTabBar />
          {/* The Trendtrack-style shell: the sidebar reserves its own
              width now (flex, not a fixed overlay needing padding to
              clear), so this column just fills whatever's left. pb-28
              below `sm` clears MobileTabBar's floating pill. */}
          <div className="min-w-0 flex-1 py-4 pr-4 pb-28 pl-4 sm:pb-4">
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
        </div>
      </body>
    </html>
  );
}
