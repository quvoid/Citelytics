"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items: { href: string; label: string; count?: string }[] = [
  { href: "/", label: "Overview" },
  { href: "/prompts", label: "Prompts" },
  { href: "/fanouts", label: "Fanouts" },
  { href: "/sources", label: "Sources" },
  { href: "/sources/gap-analysis", label: "Gap Analysis" },
  { href: "/brands", label: "Brands" },
  { href: "/perception", label: "Perception" },
];

export function NavTabs({ promptCount, brandCount }: { promptCount: number; brandCount: number }) {
  const pathname = usePathname();

  const counts: Record<string, string> = {
    "/prompts": String(promptCount),
    "/brands": String(brandCount),
  };

  return (
    <nav className="mx-auto flex max-w-[1240px] gap-8 px-10">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href === "/prompts" && pathname.startsWith("/prompts/"));
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-baseline gap-1.5 border-b-2 pb-2.5 text-[13px] tracking-[0.04em] no-underline"
            style={{
              borderColor: active ? "var(--rust)" : "transparent",
              color: active ? "var(--ink)" : "var(--muted-2)",
            }}
          >
            <span>{item.label}</span>
            {counts[item.href] && (
              <span className="font-serif text-[12px] italic text-[var(--faint)]">
                {counts[item.href]}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
