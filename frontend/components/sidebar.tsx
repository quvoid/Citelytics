"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const sections: { label: string; links: { href: string; label: string; icon: string }[] }[] = [
  {
    label: "General",
    links: [{ href: "/", label: "Overview", icon: "◱" }],
  },
  {
    label: "Prompts",
    links: [{ href: "/prompts", label: "Prompts", icon: "≡" }],
  },
  {
    label: "Sources",
    links: [
      { href: "/sources/domains", label: "Domains", icon: "⊞" },
      { href: "/sources/urls", label: "URLs", icon: "⧉" },
    ],
  },
  {
    label: "Brand",
    links: [{ href: "/brands", label: "Brands", icon: "◐" }],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex w-[246px] flex-none flex-col overflow-hidden border-r border-border bg-card">
      <div className="border-b border-[#f0f0f2] p-3">
        <div className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 hover:border-[#d3d3da]">
          <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-md bg-[#157f53] font-mono text-[11px] font-medium text-white">
            CL
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold">Citelytics Demo</div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">
              citelytics.ai
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground">▾</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2.5 pb-1">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="px-2.5 pt-3.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-[#a2a2ac]">
              {section.label}
            </div>
            {section.links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2.5 py-[6.5px] text-[13px] text-[#5d5d68] hover:bg-[#f4f4f6]",
                    active && "bg-[#f4f4f6] font-medium text-foreground"
                  )}
                >
                  <span className="w-[15px] text-center opacity-75">{link.icon}</span>
                  {link.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-[#f0f0f2] p-2.5">
        <div className="flex cursor-pointer items-center gap-2 px-1 py-1 text-[12px] text-[#5d5d68] hover:text-primary">
          <span className="opacity-75">✦</span>Demo build — Gemini + OpenRouter
        </div>
      </div>
    </div>
  );
}
