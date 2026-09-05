import fs from "node:fs";
import path from "node:path";

/**
 * Server-only (uses node:fs — never import this into a "use client" file).
 * Reads public/logos/ once per server lifetime and caches the result: which
 * domains actually have a logo file, so a page can skip requesting
 * `/logos/<domain>.png` entirely for a domain that doesn't, rather than
 * finding out via a failed network request.
 *
 * Real, measured cost of not doing this: 13 competitor brands on one real
 * /insights load, each a genuine 404 round-trip through the dev server
 * (500ms-1.4s each in these logs) before the client-side onError fallback
 * even fires. Both BrandMark components (top-brands-table.tsx,
 * workspace-switcher.tsx) already degrade gracefully to a monogram on
 * failure — this doesn't change that UI at all, it just means the FIRST
 * paint uses it directly for a known-missing logo instead of a broken
 * request having to fail first.
 */
let cached: Set<string> | null = null;

export function logoDomains(): Set<string> {
  if (cached) return cached;
  try {
    const dir = path.join(process.cwd(), "public", "logos");
    cached = new Set(
      fs
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith(".png"))
        .map((f) => f.slice(0, -4)),
    );
  } catch {
    // public/logos/ missing entirely is a valid (if unusual) deploy state —
    // every domain just has no logo, not a reason to throw.
    cached = new Set();
  }
  return cached;
}
