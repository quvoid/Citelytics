"use client";

import "./globals.css";

/**
 * Catches a throw inside app/layout.tsx itself — specifically
 * `getLayoutData()`, the one await that runs on every single page. A real
 * Supabase hiccup there previously meant the ENTIRE app was unreachable
 * with nothing but Next's raw error overlay/500 page, since app/error.tsx
 * (a normal route-segment boundary) explicitly does not wrap the layout
 * above it in the same segment — this file is the only thing that can.
 *
 * Must define its own <html>/<body> (it replaces the root layout while
 * active) and, per Next's own docs, does NOT automatically inherit the
 * app's global styles or theme — importing globals.css directly is what
 * makes the design tokens below (var(--ink) etc.) resolve at all. Kept
 * deliberately simple: no Sidebar/TopBar, since the thing that just failed
 * is the very data those need.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        className="flex min-h-screen flex-col items-center justify-center bg-background px-8 text-center font-sans text-foreground"
        style={{ background: "var(--background)" }}
      >
        <div
          className="flex h-[56px] w-[56px] items-center justify-center rounded-full font-sans text-[22px] font-bold"
          style={{ background: "var(--ink)", color: "var(--paper)" }}
        >
          C
        </div>
        <h1 className="mt-5 font-sans text-[22px] font-bold tracking-[-0.02em]" style={{ color: "var(--ink)" }}>
          Citelytics couldn&rsquo;t load
        </h1>
        <p
          className="mt-2 max-w-[40ch] font-sans text-[13.5px] leading-[1.6]"
          style={{ color: "var(--muted-2)" }}
        >
          The app itself hit an error before any page could render — usually
          a temporary connection issue. Try again in a moment.
          {error.digest && (
            <>
              {" "}
              <span className="font-mono text-[11px]" style={{ color: "var(--faint)" }}>
                Ref: {error.digest}
              </span>
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="mt-6 rounded-full px-5 py-2.5 font-sans text-[12.5px] font-semibold transition-opacity duration-150 hover:opacity-85"
          style={{ background: "var(--ink)", color: "var(--paper)" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
