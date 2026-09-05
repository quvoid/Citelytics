"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";

/**
 * Route-segment error boundary — catches an unhandled throw anywhere under
 * the root layout (every page: Overview, Insights, Prompts, ...) and shows
 * this instead of Next's raw stack-trace/500 page. There was no error.tsx
 * anywhere in the app before this; every route was one Supabase hiccup away
 * from a dead end with no way back except typing a URL by hand.
 *
 * Does NOT catch a throw inside app/layout.tsx itself (getLayoutData()) —
 * error.js explicitly does not wrap the layout above it in the same
 * segment, per Next's own docs. See app/global-error.tsx for that case.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // No error-reporting service wired up yet — logging is the one honest
    // thing to do here rather than swallowing a real bug silently.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 py-16 text-center">
      <div
        className="flex h-[52px] w-[52px] items-center justify-center rounded-full"
        style={{ background: "var(--tint-peach)" }}
      >
        <RotateCcw size={22} strokeWidth={2} style={{ color: "var(--tint-peach-fg)" }} aria-hidden="true" />
      </div>
      <h1 className="mt-5 font-sans text-[20px] font-bold tracking-[-0.02em]">Something went wrong</h1>
      <p className="mt-2 max-w-[46ch] font-sans text-[13.5px] leading-[1.6] text-[var(--muted-2)]">
        This page hit an error loading its data. It&rsquo;s usually temporary — try
        again, or head back to Overview.
        {error.digest && (
          <>
            {" "}
            <span className="font-mono text-[11px] text-[var(--faint)]">Ref: {error.digest}</span>
          </>
        )}
      </p>
      <div className="mt-6 flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="rounded-full bg-[var(--ink)] px-5 py-2.5 font-sans text-[12.5px] font-semibold text-[var(--paper)] transition-opacity duration-150 hover:opacity-85"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-[var(--border)] px-5 py-2.5 font-sans text-[12.5px] font-semibold text-[var(--ink)] no-underline transition-colors duration-150 hover:bg-[var(--muted)]"
        >
          Go to Overview
        </Link>
      </div>
    </div>
  );
}
