"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowUpRight,
  CircleDollarSign,
  FileText,
  Gauge,
  Layers,
  Link2,
  ListChecks,
  MessagesSquare,
  Search,
  Sparkles,
  SplitSquareHorizontal,
  Target,
  type LucideIcon,
} from "lucide-react";

/** Real drawn icons, one library, one stroke weight.
 *
 *  Every icon in this app used to be a Unicode geometric glyph (◱ ◉ ⑃ ⛁).
 *  Those render at whatever weight and baseline the user's font happens to
 *  supply, never align with each other, and are the single loudest tell that
 *  an interface was assembled rather than designed. Lucide gives one
 *  consistent 1.5px stroke across the set and scales cleanly at 16px. */
const items: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/insights", label: "Insights", icon: Sparkles },
  { href: "/actions", label: "Actions", icon: ListChecks },
  { href: "/prompts", label: "Prompts", icon: Search },
  { href: "/chats", label: "Chats", icon: MessagesSquare },
  { href: "/briefs", label: "Briefs", icon: FileText },
  { href: "/fanouts", label: "Fanouts", icon: SplitSquareHorizontal },
  { href: "/sources", label: "Sources", icon: Link2 },
  { href: "/sources/gap-analysis", label: "Gap Analysis", icon: Target },
  { href: "/brands", label: "Brands", icon: Layers },
  { href: "/perception", label: "Perception", icon: ArrowUpRight },
  { href: "/engine-costs", label: "Engine Costs", icon: CircleDollarSign },
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
  // React-tracked, not CSS `:hover` — this project's stylesheet stack has an
  // UNLAYERED rule somewhere (very likely from the shadcn/tailwind.css
  // import) that beats any `@layer utilities` class regardless of
  // specificity, per the CSS Cascade Layers spec (unlayered always wins over
  // layered). Verified directly: the `.hover\:bg-...:hover` rule really is
  // in the compiled sheet and really does match on hover, and the background
  // still never painted. Rather than chase a third-party layer conflict,
  // hover uses the exact mechanism `active` below already relies on —
  // inline style, which no stylesheet layer can ever out-rank.
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);
  // Same cascade-layer problem as hover, plus the sidebar had NO keyboard
  // focus indicator at all before this — tabbing through the app's primary
  // nav showed nothing. `:focus-visible` (checked in the handler, not
  // written as CSS the layer bug would beat) distinguishes a real keyboard
  // tab from a mouse click landing here, so clicking a link doesn't also
  // light up a ring that's meant for keyboard users.
  const [focusedHref, setFocusedHref] = useState<string | null>(null);

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
        const hovered = hoveredHref === item.href;
        const focused = focusedHref === item.href;
        const highlighted = hovered || focused;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onMouseEnter={() => setHoveredHref(item.href)}
            onMouseLeave={() => setHoveredHref((h) => (h === item.href ? null : h))}
            onFocus={(e) => {
              if (e.currentTarget.matches(":focus-visible")) setFocusedHref(item.href);
            }}
            onBlur={() => setFocusedHref((h) => (h === item.href ? null : h))}
            className="group flex items-center gap-2.5 rounded-[10px] px-3 py-2 font-sans text-[13.5px] no-underline transition-colors duration-150 outline-none active:scale-[0.98]"
            style={{
              background: active ? "var(--sb-active-bg)" : highlighted ? "var(--sb-hover-bg)" : "transparent",
              color: active ? "var(--sb-text-active)" : highlighted ? "var(--sb-text-active)" : "var(--sb-text)",
              boxShadow: focused ? "0 0 0 2px var(--ember)" : undefined,
            }}
          >
            <Icon
              size={16}
              strokeWidth={active ? 2.1 : 1.75}
              className="flex-none transition-transform duration-150"
              style={{
                opacity: active || highlighted ? 1 : 0.7,
                transform: highlighted && !active ? "translateX(2px)" : undefined,
              }}
              aria-hidden="true"
            />
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
