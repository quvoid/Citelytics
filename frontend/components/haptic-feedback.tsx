"use client";

import { useEffect } from "react";
import { haptic } from "@/lib/haptics";

/**
 * App-wide haptic feedback on real touch/pen contact — one global listener
 * (same pattern as NavigationProgressBar's click listener) instead of
 * threading a haptic call into every button component individually, so
 * every existing button, link, tab, and toggle gets it without any of
 * their own code changing.
 *
 * Deliberately `pointerdown` with `pointerType` filtered to touch/pen: a
 * mouse click on desktop has no haptic hardware behind it (the guidance
 * this is patterned on — Apple HIG's playing-haptics.md — is about
 * "engaging people's sense of touch", which a mouse cursor doesn't have),
 * and `navigator.vibrate` would silently no-op there anyway, but filtering
 * up front means this listener does zero work on the overwhelming majority
 * of clicks in what is primarily a desktop dashboard.
 *
 * Opt out of a specific element with `data-no-haptic`; opt into a
 * non-default pattern with `data-haptic="selection" | "success" | ...`
 * (see lib/haptics.ts for the full set) without needing this file to know
 * about every button in the app.
 */
export function HapticFeedback() {
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      const el = target.closest<HTMLElement>(
        'button, a[href], [role="button"], [role="tab"], [role="switch"], input[type="checkbox"], input[type="radio"]',
      );
      if (!el || el.hasAttribute("data-no-haptic")) return;
      if (el instanceof HTMLButtonElement && el.disabled) return;

      const override = el.getAttribute("data-haptic");
      const isValueControl =
        el.matches('[role="tab"], [role="switch"], input[type="checkbox"], input[type="radio"]');

      haptic(
        (override as Parameters<typeof haptic>[0] | null) ??
          (isValueControl ? "selection" : "light"),
      );
    }

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return null;
}
