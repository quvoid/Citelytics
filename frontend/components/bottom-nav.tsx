"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import { NAV_ITEMS, isNavItemActive } from "@/lib/nav-items";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import type { LayoutData } from "@/lib/layout-data";

/** Replaces the left-rail Sidebar (components/sidebar.tsx, still present but
 *  unmounted — see app/layout.tsx) with a persistent bottom bar plus a
 *  spring-driven drawer holding every category link. The bar itself never
 *  unmounts across a navigation (it lives in the root layout, same as the
 *  old sidebar did) — clicking a link inside the drawer closes the drawer
 *  and lets the normal Next.js Link/Suspense loading state (CircleSpinner,
 *  wrapped around each page's filter-driven content) show in the content
 *  column, exactly the "chrome stays still, only the white part reloads"
 *  behavior that was the point of this redesign. */
export function BottomNav({ data, logoDomains }: { data: LayoutData; logoDomains: string[] }) {
  const { current, projects, promptCount, brandCount, briefCount } = data;
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const activeItem = NAV_ITEMS.find((i) => isNavItemActive(pathname, i.href)) ?? NAV_ITEMS[0];
  const ActiveIcon = activeItem.icon;

  // Close on Escape, close on route change (so navigating via a link and
  // browser back/forward both leave the drawer shut), lock body scroll
  // while open — same trio prompt-detail-modal.tsx already established.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    // Subscribing to the router (pathname is externally driven, not
    // locally computed) and reacting with setState in response is exactly
    // the case the rule's own docs carve out as correct — same justified
    // exception navigation-progress-bar.tsx already uses for the same
    // reason.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Bottom bar — fixed, always mounted, matches the old sidebar's dark
          texture so the redesign reads as a repositioning of the same
          chrome, not a different app. */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t px-4 py-2.5 bg-cover bg-center"
        style={{
          background: "var(--sb-bg)",
          backgroundImage: "url(/images/sidebar-texture.webp)",
          borderColor: "var(--sb-border)",
        }}
      >
        <button
          type="button"
          onClick={() => router.push("/")}
          className="flex flex-none items-center gap-2 rounded-[10px] border-0 bg-transparent p-1"
        >
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[9px] bg-[var(--ember)] text-[13px] font-bold text-white">
            C
          </span>
          <span className="hidden font-sans text-[14px] font-bold tracking-[-0.01em] text-white sm:inline">
            Citelytics
          </span>
        </button>

        <div className="min-w-0 max-w-[220px] flex-1 sm:max-w-[280px]">
          <WorkspaceSwitcher current={current} projects={projects} logoDomains={logoDomains} compact />
        </div>

        {/* The trigger. `whileHover` nudges the whole pill up a few px — a
            real physical "pull" tease (the ask: "button or hover which
            pulls a drawer") — without fully opening on hover, which would
            be unusable on touch and unreliable on desktop (move the mouse
            wrong and it snaps shut mid-read). Click commits to the full
            open, which is the part that actually needs to be robust. */}
        <motion.button
          type="button"
          onClick={() => setOpen((v) => !v)}
          whileHover={{ y: -4 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
          aria-expanded={open}
          aria-label={open ? "Close navigation" : "Open navigation"}
          className="flex flex-none items-center gap-2 rounded-full border-0 px-3.5 py-2"
          style={{ background: "var(--sb-active-bg)", color: "var(--sb-text-active)" }}
        >
          <ActiveIcon size={15} strokeWidth={1.9} aria-hidden="true" className="flex-none" />
          <span className="hidden font-sans text-[12.5px] font-medium sm:inline">{activeItem.label}</span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 24 }}
            className="flex flex-none"
          >
            <ChevronUp size={14} strokeWidth={2} aria-hidden="true" />
          </motion.span>
        </motion.button>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40"
              style={{ background: "rgba(15,15,18,0.5)" }}
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              key="drawer"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              // The "waveform" pull: an underdamped spring overshoots its
              // rest position slightly before settling, reading as an
              // elastic pull-up rather than a mechanical slide — damping
              // and stiffness tuned down from the trigger button's snappier
              // spring above since a full-height panel exaggerates motion a
              // stiffer spring would keep controlled at button-size.
              transition={{ type: "spring", stiffness: 260, damping: 24, mass: 0.9 }}
              className="fixed inset-x-0 bottom-0 z-50 flex max-h-[82vh] flex-col rounded-t-[20px] pb-[env(safe-area-inset-bottom)]"
              style={{
                background: "var(--sb-bg)",
                backgroundImage: "url(/images/sidebar-texture.webp)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                boxShadow: "0 -20px 50px rgba(0,0,0,0.35)",
              }}
            >
              <div className="flex justify-center pt-2.5 pb-1">
                <span className="h-[4px] w-[36px] rounded-full" style={{ background: "var(--sb-border)" }} />
              </div>

              <div className="flex items-center justify-between px-5 pt-1 pb-3">
                <span className="font-sans text-[11px] font-semibold tracking-[0.1em] text-[var(--sb-text)] uppercase">
                  Navigate
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded-full border-0 p-1.5"
                  style={{ background: "var(--sb-hover-bg)", color: "var(--sb-text)" }}
                >
                  <ChevronUp size={16} strokeWidth={2} className="rotate-180" aria-hidden="true" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
                  {NAV_ITEMS.map((item) => {
                    const active = isNavItemActive(pathname, item.href);
                    const hovered = hoveredHref === item.href;
                    const Icon = item.icon;
                    const count =
                      item.href === "/prompts"
                        ? promptCount
                        : item.href === "/brands"
                          ? brandCount
                          : item.href === "/briefs"
                            ? briefCount
                            : undefined;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onMouseEnter={() => setHoveredHref(item.href)}
                        onMouseLeave={() => setHoveredHref((h) => (h === item.href ? null : h))}
                        aria-current={active ? "page" : undefined}
                        className="flex flex-col items-center gap-1.5 rounded-[14px] px-2 py-3.5 text-center no-underline transition-transform duration-150 active:scale-[0.96]"
                        style={{
                          background: active
                            ? "var(--sb-active-bg)"
                            : hovered
                              ? "var(--sb-hover-bg)"
                              : "transparent",
                        }}
                      >
                        <Icon
                          size={19}
                          strokeWidth={active ? 2.1 : 1.75}
                          aria-hidden="true"
                          style={{ color: active ? "var(--sb-text-active)" : "var(--sb-text)" }}
                        />
                        <span
                          className="font-sans text-[11px] leading-[1.25] font-medium"
                          style={{ color: active ? "var(--sb-text-active)" : "var(--sb-text)" }}
                        >
                          {item.label}
                        </span>
                        {count !== undefined && (
                          <span className="font-sans text-[10px] tabular-nums" style={{ color: "var(--faint)" }}>
                            {count}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
