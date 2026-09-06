"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_ITEMS, isNavItemActive } from "@/lib/nav-items";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import type { LayoutData } from "@/lib/layout-data";

const COLLAPSED_W = 72;
const EXPANDED_W = 256;

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
}

/** Left rail, back from the bottom-drawer experiment — but this time it
 *  never needs a click. Collapsed to an icon-only strip by default; hovering
 *  anywhere on it smoothly widens the whole rail into the full labeled panel
 *  (Trendtrack's reference behavior: overlay, not push — the rail is
 *  `position: fixed` at a high z-index so expanding it draws OVER the page
 *  content rather than shoving it sideways, and the content column's
 *  fixed left padding never moves). Same mount point as the old Sidebar and
 *  the (now unmounted) BottomNav — root layout, so it never remounts across
 *  a navigation. */
export function HoverSidebar({ data, logoDomains }: { data: LayoutData; logoDomains: string[] }) {
  const { current, projects, promptCount, brandCount, briefCount } = data;
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);

  const counts: Record<string, number | undefined> = {
    "/prompts": promptCount,
    "/brands": brandCount,
    "/briefs": briefCount,
  };

  return (
    <motion.aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      initial={false}
      animate={{ width: expanded ? EXPANDED_W : COLLAPSED_W }}
      transition={{ type: "spring", stiffness: 340, damping: 34, mass: 0.7 }}
      className="fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden bg-cover bg-center"
      style={{
        background: "var(--sb-bg)",
        backgroundImage: "url(/images/sidebar-texture.webp)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        boxShadow: expanded ? "10px 0 40px rgba(0,0,0,0.28)" : "none",
      }}
    >
      <div className="flex flex-none items-center gap-2.5 px-[19px] pt-6 pb-5">
        <Link
          href="/"
          className="flex h-7 w-7 flex-none items-center justify-center rounded-[9px] bg-[var(--ember)] text-[13px] font-bold text-white no-underline"
        >
          C
        </Link>
        <AnimatePresence>
          {expanded && (
            <motion.span
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden font-sans text-[17px] leading-none font-bold tracking-[-0.01em] whitespace-nowrap text-white"
            >
              Citelytics
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-none px-3 pb-4">
        {expanded ? (
          <WorkspaceSwitcher current={current} projects={projects} logoDomains={logoDomains} />
        ) : (
          <div
            className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] text-[11px] font-semibold text-white"
            style={{ background: "var(--ember)" }}
            title={current.name}
          >
            {initialsFor(current.name).toUpperCase()}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4">
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="overflow-hidden px-3 pb-2 font-sans text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap text-[var(--sb-text)] uppercase"
            >
              Workspace
            </motion.div>
          )}
        </AnimatePresence>

        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            const hovered = hoveredHref === item.href;
            const Icon = item.icon;
            const count = counts[item.href];
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onMouseEnter={() => setHoveredHref(item.href)}
                onMouseLeave={() => setHoveredHref((h) => (h === item.href ? null : h))}
                className="group flex items-center gap-2.5 rounded-[10px] px-3 py-2 font-sans text-[13.5px] no-underline transition-colors duration-150 active:scale-[0.98]"
                style={{
                  background: active ? "var(--sb-active-bg)" : hovered ? "var(--sb-hover-bg)" : "transparent",
                  color: active || hovered ? "var(--sb-text-active)" : "var(--sb-text)",
                }}
              >
                <Icon
                  size={16}
                  strokeWidth={active ? 2.1 : 1.75}
                  className="flex-none"
                  style={{ opacity: active || hovered ? 1 : 0.7 }}
                  aria-hidden="true"
                />
                <AnimatePresence>
                  {expanded && (
                    <motion.span
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.12 }}
                      className="flex flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap"
                    >
                      <span className="flex-1">{item.label}</span>
                      {count !== undefined && (
                        <span
                          className="font-sans text-[11px] tabular-nums"
                          style={{ color: active ? "rgba(255,255,255,0.55)" : "var(--faint)" }}
                        >
                          {count}
                        </span>
                      )}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            );
          })}
        </nav>
      </div>
    </motion.aside>
  );
}
