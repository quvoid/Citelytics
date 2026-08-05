import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { getLayoutData } from "@/lib/layout-data";

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
    <html lang="en" className="antialiased">
      <body className="min-h-screen bg-background font-sans text-[15px] text-foreground">
        <div className="flex min-h-screen">
          <Sidebar data={data} />
          <div className="flex min-w-0 flex-1 flex-col pb-16">
            <TopBar data={data} />
            <main className="max-w-[1240px] px-8">{children}</main>
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
