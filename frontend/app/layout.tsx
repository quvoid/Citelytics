import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";
import { HapticFeedback } from "@/components/haptic-feedback";
import { NavigationProgressBar } from "@/components/navigation-progress-bar";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
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
      {/* overflow-x-clip (NOT overflow-x-hidden) on both html and body is the
          belt on top of the braces below: any card that miscalculates its
          own width should scroll internally (see the overflow-x-auto
          wrappers in components/segment-heatmap.tsx, top-rankings.tsx,
          top-brands-table etc.), never force the whole document wider.
          `hidden` was tried first and broke the sidebar: pairing
          overflow-x:hidden with the default overflow-y:visible makes the
          UA silently convert overflow-y to `auto` too (CSS Overflow spec's
          axis-coupling rule), which turns <body>/<html> into their own
          scroll containers and detaches the sidebar's `sticky top-0` from
          the viewport — it scrolled away instead of staying pinned. `clip`
          is exempt from that coupling: it suppresses the overflow without
          creating a scroll container, so sticky keeps resolving against the
          real viewport. */}
      <body className="min-h-screen overflow-x-clip bg-background font-sans text-[15px] text-foreground">
        <NavigationProgressBar />
        <HapticFeedback />
        <div className="flex min-h-screen">
          <Sidebar data={data} />
          <div className="flex min-w-0 flex-1 flex-col pb-16">
            <TopBar data={data} />
            <main className="min-w-0 max-w-[1240px] px-8">{children}</main>
            <footer className="mt-14 flex max-w-[1240px] justify-between px-8 pt-5 font-sans text-[12.5px] text-[var(--faint)]">
              <span>Citelytics · real citations from Gemini &amp; ChatGPT</span>
              <span>Filled dots mark real fetches; hollow dots mark simulated demo records.</span>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
