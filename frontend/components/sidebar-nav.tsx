"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items: { href: string; label: string; icon: string }[] = [
  { href: "/", label: "Overview", icon: "◱" },
  { href: "/prompts", label: "Prompts", icon: "≡" },
  { href: "/briefs", label: "Briefs", icon: "▤" },
  { href: "/fanouts", label: "Fanouts", icon: "⑃" },
  { href: "/sources", label: "Sources", icon: "◧" },
  { href: "/sources/gap-analysis", label: "Gap Analysis", icon: "◐" },
  { href: "/brands", label: "Brands", icon: "◈" },
  { href: "/perception", label: "Perception", icon: "◇" },
];

export function SidebarNav({
  promptCount,
  brandCount,
  briefCount,
}: {
  promptCount: number;
  brandCount: number;
  briefCount: number;
}) {
  const pathname = usePathname();

  const counts: Record<string, string> = {
    "/prompts": String(promptCount),
    "/brands": String(brandCount),
    "/briefs": String(briefCount),
  };

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href === "/prompts" && pathname.startsWith("/prompts/")) ||
          (item.href === "/briefs" && pathname.startsWith("/briefs/"));
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 font-sans text-[13.5px] no-underline transition-colors duration-150"
            style={{
              background: active ? "var(--sb-active-bg)" : "transparent",
              color: active ? "var(--sb-text-active)" : "var(--sb-text)",
            }}
          >
            <span className="w-4 flex-none text-center text-[13px] opacity-90">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {counts[item.href] && (
              <span
                className="font-sans text-[11px] tabular-nums"
                style={{ color: active ? "rgba(255,255,255,0.55)" : "var(--faint)" }}
              >
                {counts[item.href]}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
