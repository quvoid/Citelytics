import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: "Citelytics — AI Citation Intelligence",
  description: "Track how often your content gets cited by AI answer engines.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="antialiased">
      <body className="min-h-screen bg-background pb-24 font-sans text-[15px] text-foreground">
        <Header />
        <main className="mx-auto max-w-[1240px] px-10">{children}</main>
        <footer className="mx-auto mt-18 flex max-w-[1240px] justify-between border-t border-[var(--rule)] px-10 pt-5 font-serif text-[13.5px] italic text-[var(--faint)]">
          <span>Citelytics · real citations from Gemini &amp; ChatGPT · demo project</span>
          <span>Filled dots mark real fetches; hollow dots mark simulated demo records.</span>
        </footer>
      </body>
    </html>
  );
}
