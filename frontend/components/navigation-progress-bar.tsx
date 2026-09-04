"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * A thin bar at the top of the viewport that appears the instant a nav link
 * is clicked, not when the new page finishes rendering — plus, for pages
 * that stay pending long enough to actually feel stuck, a shimmering
 * skeleton overlay over the content area.
 *
 * Why this exists: every route in this app is `force-dynamic` and hits
 * Supabase per request. Some pages (Insights) fire ~10 sequential/parallel
 * queries before anything paints, so a click on that sidebar link can take
 * a real, visible couple of seconds with nothing on screen changing. The
 * thin bar alone reads as too subtle for that gap — a real user reported it
 * as "doesn't load quickly, I need an animation for it" even with the bar
 * already shipped. `app/loading.tsx` (Next's own Suspense-based mechanism)
 * would normally be the fix for the content-area half of this, but it
 * caused a real, reproducible permanent hang on this exact Next
 * 16.2.12/Turbopack + async-root-layout stack (see git history) and was
 * removed — this stays pure client-side (click listener + pathname change),
 * the same mechanism already proven safe for the bar itself.
 *
 * No new dependency: a global click listener plus `usePathname()` are
 * enough to know when a navigation starts and when it lands.
 */
export function NavigationProgressBar() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  // Only shown once a navigation has been pending for a beat — most clicks
  // resolve fast enough that a full-screen overlay would just flash and
  // read as a glitch rather than feedback. Below that threshold, the thin
  // bar alone is the honest amount of feedback to give.
  const [showOverlay, setShowOverlay] = useState(false);
  const creepRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopCreeping = () => {
    if (creepRef.current) clearInterval(creepRef.current);
    creepRef.current = null;
    if (safetyRef.current) clearTimeout(safetyRef.current);
    safetyRef.current = null;
    if (overlayDelayRef.current) clearTimeout(overlayDelayRef.current);
    overlayDelayRef.current = null;
  };

  // Pathname changed -> the navigation this bar was tracking actually
  // landed. Snap to 100% (a real "done", not just "stopped moving") then
  // fade the bar out, rather than leaving it stalled wherever it happened
  // to creep to.
  useEffect(() => {
    // This IS "subscribe to an external system (the router) and setState in
    // response" — the exact case the rule's own docs carve out as correct —
    // but the linter flags it regardless since it can't tell pathname is
    // externally driven rather than locally computed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgress((p) => (p > 0 ? 100 : p));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowOverlay(false);
    stopCreeping();
  }, [pathname]);

  useEffect(() => {
    if (progress !== 100) return;
    const t = setTimeout(() => setProgress(0), 220);
    return () => clearTimeout(t);
  }, [progress]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      // New tab / modified click / non-primary button: the current page
      // isn't going anywhere, so no bar.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const anchor = (e.target as HTMLElement)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || anchor.target === "_blank") return;
      // External or non-navigable links never trigger App Router's own
      // loading state, so a bar for them would just hang until the safety
      // timeout — only track same-origin path changes.
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      stopCreeping();
      setProgress(15);
      setShowOverlay(false);
      // Creeps toward 80% so a slow fetch still reads as "working", never
      // "stuck" — real completion (pathname change, above) always jumps
      // straight to 100 rather than waiting for the creep to arrive there.
      creepRef.current = setInterval(() => {
        setProgress((p) => (p >= 80 ? p : Math.min(80, p + 4 + Math.random() * 6)));
      }, 260);
      // Most navigations land well under this — only a genuinely slow page
      // (Insights' ~10-query render, a re-fetch) ever shows the overlay, so
      // fast clicks stay a quick flash of the bar, not a jarring full-screen
      // cover-and-uncover.
      overlayDelayRef.current = setTimeout(() => setShowOverlay(true), 450);
      // If a navigation never lands (a thrown error boundary, a dead link),
      // don't leave the bar (or overlay) stuck forever.
      safetyRef.current = setTimeout(() => {
        stopCreeping();
        setProgress(0);
        setShowOverlay(false);
      }, 8000);
    }

    // CAPTURE phase, not bubble — this is the actual fix, not a style
    // choice. Next's <Link> calls e.preventDefault() in its own onClick,
    // which React delegates at the app's root container (inside <body>).
    // A bubble-phase listener on `document` sits OUTSIDE that container, so
    // it only sees the event AFTER Link has already run and prevented it —
    // meaning the `e.defaultPrevented` bail-out below fired on literally
    // every internal Link click, every time, and neither the bar nor the
    // overlay ever showed on a real navigation. Capture fires on the way
    // DOWN, before Link's handler runs at all, so defaultPrevented is still
    // false when this reads it.
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
    // pathname isn't read inside onClick via closure staleness risk — it's
    // read fresh off window.location at click time, not from this render.
  }, []);

  if (progress === 0) return null;

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2.5px]"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Page loading"
      >
        <div
          className="h-full w-full origin-left bg-[var(--ember)]"
          style={{
            // transform: scaleX instead of animating `width` — same visual
            // result, but scale/opacity are compositor-only, so this never
            // triggers layout on every tick the way a width transition does.
            transform: `scaleX(${progress / 100})`,
            transition: `transform ${progress === 100 ? 150 : 400}ms ease-out, opacity 200ms ease-out ${
              progress === 100 ? "80ms" : "0ms"
            }`,
            opacity: progress === 100 ? 0 : 1,
            boxShadow: "0 0 8px var(--ember)",
          }}
        />
      </div>

      {/* Only for navigations that stay pending past the delay above — a
          scrim + shimmering page-shaped skeleton over the content area, so a
          genuinely slow route (Insights' ~10-query render) reads as "working
          on it" instead of "did my click even register". Generic on purpose
          (a title bone, a filter-row bone, a card grid) rather than
          per-route, since it can't know which page is loading — that
          specificity is what app/loading.tsx would normally give us, and
          that mechanism is the one that hung this exact stack. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[90] flex justify-center"
        style={{
          opacity: showOverlay ? 1 : 0,
          transition: "opacity 200ms ease-out",
          background: "var(--background)",
          backdropFilter: showOverlay ? "blur(6px)" : "none",
        }}
      >
        <div className="w-full max-w-[1240px] px-8 pt-24">
          <div className="h-[34px] w-[260px] animate-pulse rounded-[6px] bg-[var(--muted)]" />
          <div className="mt-3 h-[14px] w-[360px] animate-pulse rounded-[4px] bg-[var(--muted)]" />
          <div className="mt-6 flex gap-2">
            <div className="h-[30px] w-[64px] animate-pulse rounded-full bg-[var(--muted)]" />
            <div className="h-[30px] w-[64px] animate-pulse rounded-full bg-[var(--muted)]" />
            <div className="h-[30px] w-[90px] animate-pulse rounded-full bg-[var(--muted)]" />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[86px] animate-pulse rounded-[var(--radius-xl,10px)] bg-[var(--card)]"
                style={{ boxShadow: "var(--shadow-card)", animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
          <div
            className="mt-3.5 h-[220px] animate-pulse rounded-[var(--radius-xl,10px)] bg-[var(--card)]"
            style={{ boxShadow: "var(--shadow-card)", animationDelay: "260ms" }}
          />
        </div>
      </div>
    </>
  );
}
