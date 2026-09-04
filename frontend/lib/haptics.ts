/**
 * Web Vibration API wrapper, patterned after Apple HIG's playing-haptics.md
 * (there's no native Taptic Engine on the web, but the guidance for WHEN and
 * HOW MUCH to use haptic feedback translates directly):
 *
 *  - "Prefer playing short haptics that complement discrete events" — every
 *    pattern below is a handful of milliseconds, never a prolonged buzz.
 *  - "Use standard patterns for standard controls; reserve custom patterns
 *    for distinct experiences" — light for a plain tap, selection for a
 *    value change (tab/toggle/checkbox), success/warning/error only for an
 *    action's actual outcome.
 *  - "Users must be able to disable haptics without compromising app
 *    functionality" — nothing here is required for any feature to work; on
 *    a device/browser with vibration turned off at the OS level (or no
 *    vibration hardware at all, e.g. every desktop browser),
 *    `navigator.vibrate` already silently no-ops, so that requirement is
 *    satisfied for free rather than needing an in-app setting.
 */

const PATTERNS = {
  // Impact patterns — collision-weight metaphor per HIG, reused here for
  // "how big a thing did you just tap".
  light: 8,
  medium: 15,
  heavy: 25,
  rigid: 10,
  soft: 18,
  // A UI element's value changed (tab switch, checkbox, toggle, filter chip).
  selection: 6,
  // Notification patterns — the outcome of an action, not the tap itself.
  success: [10, 40, 10],
  warning: [15, 60, 15],
  error: [20, 50, 20, 50, 20],
} as const;

export type HapticPattern = keyof typeof PATTERNS;

let supported: boolean | null = null;

function isSupported(): boolean {
  if (supported !== null) return supported;
  supported =
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function";
  return supported;
}

/** Fire a short haptic pulse. Safe to call anywhere, any number of times —
 *  no-ops instantly on any browser/device without vibration hardware
 *  (every desktop, iOS Safari, etc.), and never throws. */
export function haptic(pattern: HapticPattern = "light"): void {
  if (!isSupported()) return;
  try {
    // PATTERNS is declared `as const` for the literal HapticPattern union
    // above; navigator.vibrate wants a plain (mutable) number | number[].
    navigator.vibrate(PATTERNS[pattern] as number | number[]);
  } catch {
    // Some browsers throw if called outside a user gesture, or if the tab
    // isn't focused — the feedback just silently doesn't happen, never a
    // reason to break whatever the user actually clicked.
  }
}
