"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FileText, Gauge, Layers, MessagesSquare, Plus, Search, Sparkles } from "lucide-react";
import { isNavItemActive } from "@/lib/nav-items";

const MOBILE_ITEMS = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/insights", label: "Insights", icon: Sparkles },
  { href: "/prompts", label: "Prompts", icon: Search },
  { href: "/chats", label: "Chats", icon: MessagesSquare },
];

/** What the "+" fans out into. Real destinations only — each is a place in
 *  this app where you actually create something. */
const QUICK_ACTIONS = [
  { href: "/prompts", label: "Add a prompt", icon: Search },
  { href: "/briefs/new", label: "New brief", icon: FileText },
  { href: "/brands", label: "Track a brand", icon: Layers },
];

/** The reference's floating bottom pill nav — a hover-to-expand rail has no
 *  equivalent on a touchscreen, so mobile gets its own chrome: a dark
 *  floating pill with the four highest-traffic sections, plus a raised "+"
 *  that fans a vertical stack of create-actions up out of it (the
 *  speed-dial pattern the mobile-UI video describes: "the plus button
 *  either opens a little menu or opens the keyboard"). Tapping "+" again,
 *  the backdrop, or any action closes it; navigating closes it too.
 *  `sm:hidden` — the static Sidebar takes over at that breakpoint and up
 *  (see app/layout.tsx, which hides this the same way in reverse). */
export function MobileTabBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on route change — the menu shouldn't survive into the next page.
  // Subscribing to the router and reacting with setState is the case the
  // set-state-in-effect rule's own docs carve out (same justified exception
  // navigation-progress-bar.tsx already uses).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.button
            key="backdrop"
            type="button"
            aria-label="Close menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 border-0 sm:hidden"
            style={{ background: "rgba(15,15,18,0.45)" }}
          />
        )}
      </AnimatePresence>

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

        {/* The "+" and the stack that fans up out of it share one relative
            wrapper so the actions sit directly above the button. */}
        <div className="relative ml-1 flex-none">
          <AnimatePresence>
            {open && (
              <motion.ul
                key="actions"
                initial="closed"
                animate="open"
                exit="closed"
                variants={{
                  open: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } },
                  closed: { transition: { staggerChildren: 0.03, staggerDirection: -1 } },
                }}
                className="absolute right-0 bottom-[calc(100%+12px)] m-0 flex list-none flex-col items-end gap-2.5 p-0"
              >
                {QUICK_ACTIONS.map((a) => {
                  const Icon = a.icon;
                  return (
                    <motion.li
                      key={a.href}
                      variants={{
                        open: { opacity: 1, y: 0, scale: 1 },
                        closed: { opacity: 0, y: 12, scale: 0.9 },
                      }}
                      transition={{ type: "spring", stiffness: 420, damping: 28 }}
                    >
                      <Link
                        href={a.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2.5 rounded-full py-2.5 pr-4 pl-3 font-sans text-[13px] font-semibold whitespace-nowrap no-underline"
                        style={{
                          background: "var(--card)",
                          color: "var(--ink)",
                          boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                        }}
                      >
                        <span
                          className="flex h-7 w-7 flex-none items-center justify-center rounded-full"
                          style={{ background: "var(--tint-peach)", color: "var(--tint-peach-fg)" }}
                        >
                          <Icon size={15} strokeWidth={2} aria-hidden="true" />
                        </span>
                        {a.label}
                      </Link>
                    </motion.li>
                  );
                })}
              </motion.ul>
            )}
          </AnimatePresence>

          <motion.button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={open ? "Close quick actions" : "Open quick actions"}
            whileTap={{ scale: 0.92 }}
            className="flex h-11 w-11 items-center justify-center rounded-full border-0"
            style={{ background: "var(--ember)", boxShadow: "0 4px 14px rgba(232,89,12,0.45)" }}
          >
            <motion.span
              animate={{ rotate: open ? 45 : 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 24 }}
              className="flex"
            >
              <Plus size={20} strokeWidth={2.4} color="#fff" aria-hidden="true" />
            </motion.span>
          </motion.button>
        </div>
      </nav>
    </>
  );
}
