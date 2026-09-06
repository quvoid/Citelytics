"use client";

import { motion } from "framer-motion";

/** The one loading idiom for content-area transitions — three bars pulsing
 *  in a staggered loop, like a small equalizer. Framer Motion (already the
 *  animation library the bottom-drawer/hover-sidebar use), swapped in for
 *  the plain CSS `animate-spin` ring it replaces because a static spinning
 *  circle reads as inert next to everything else in this app that now has
 *  real spring/stagger motion. Used as the fallback for the Suspense
 *  boundary wrapping filter-driven content (e.g. Insights' date-range
 *  presets), so every content-area loading moment in the app shows the same
 *  language. */
export function CircleSpinner({ size = 28 }: { size?: number }) {
  const barWidth = Math.max(3, Math.round(size / 8));
  const gap = Math.max(2, Math.round(size / 12));
  return (
    <span
      role="status"
      aria-label="Loading"
      className="inline-flex items-end justify-center"
      style={{ width: size, height: size, gap }}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="rounded-full"
          style={{ width: barWidth, background: "var(--ember)" }}
          animate={{ height: [size * 0.3, size, size * 0.3] }}
          transition={{
            duration: 0.9,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.15,
          }}
        />
      ))}
    </span>
  );
}

/** Fills the content column while a Suspense boundary's data is in flight —
 *  centered, generous vertical room so it doesn't read as a broken empty
 *  page while it's up. */
export function CircleSpinnerFill({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <CircleSpinner size={36} />
      {label && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="m-0 font-sans text-[12.5px] text-[var(--muted-2)]"
        >
          {label}
        </motion.p>
      )}
    </div>
  );
}
