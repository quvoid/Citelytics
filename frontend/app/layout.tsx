import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { DemoModeBanner } from "@/components/demo-mode-banner";

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
    <html lang="en" className="h-full antialiased">
      <body className="flex h-screen overflow-hidden bg-background text-foreground font-sans text-[13px]">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
            <DemoModeBanner />
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
