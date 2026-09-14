"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gauge, MessagesSquare, Plus, Search, Sparkles } from "lucide-react";
import { isNavItemActive } from "@/lib/nav-items";

const MOBILE_ITEMS = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/insights", label: "Insights", icon: Sparkles },
  { href: "/prompts", label: "Prompts", icon: Search },
  { href: "/chats", label: "Chats", icon: MessagesSquare },
];

/** The reference's floating bottom pill nav — HoverSidebar's hover-to-expand
 *  rail doesn't translate to touch (there is no hover on a phone), so mobile
 *  gets its own chrome entirely: a dark floating pill with the four
 *  highest-traffic sections, plus a raised "+" action (straight to the
 *  prompt composer, this app's actual most-common quick action — the
 *  reference's own floating "+" opens a generic add-item menu, which this
 *  app has no equivalent of). `sm:hidden` — HoverSidebar takes over at that
 *  breakpoint and up (see app/layout.tsx, which hides this the same way in
 *  reverse). */
export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit items-center gap-1 rounded-full px-2 py-2 sm:hidden"
      style={{
        background: "var(--sb-bg)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      {MOBILE_ITEMS.map((item) => {
        const active = isNavItemActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="flex flex-col items-center gap-0.5 rounded-full px-3.5 py-1.5 no-underline"
            style={{ background: active ? "var(--sb-active-bg)" : "transparent" }}
          >
            <Icon
              size={18}
              strokeWidth={active ? 2.2 : 1.8}
              aria-hidden="true"
              style={{ color: active ? "var(--sb-text-active)" : "var(--sb-text)" }}
            />
            <span
              className="font-sans text-[9.5px] font-medium"
              style={{ color: active ? "var(--sb-text-active)" : "var(--sb-text)" }}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
      <Link
        href="/prompts"
        aria-label="Add a prompt"
        className="ml-1 flex h-11 w-11 flex-none items-center justify-center rounded-full no-underline"
        style={{ background: "var(--ember)", boxShadow: "0 4px 14px rgba(232,89,12,0.45)" }}
      >
        <Plus size={20} strokeWidth={2.4} color="#fff" aria-hidden="true" />
      </Link>
    </nav>
  );
}
