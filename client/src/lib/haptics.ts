/**
 * Tiny haptic helper — progressive enhancement.
 *
 * Fires a short vibration tick on high-value actions (Complete / Next / Prev) to
 * make the app feel physical. The Vibration API is unevenly supported (notably
 * partial on iOS Safari), so every call is feature-detected and wrapped — it is a
 * guaranteed no-op (never throws) where the API is absent or blocked.
 */
export function haptic(durationMs: number = 10): void {
  try {
    const nav = typeof navigator !== "undefined" ? (navigator as Navigator) : undefined;
    if (nav && typeof nav.vibrate === "function") {
      nav.vibrate(durationMs);
    }
  } catch {
    /* no-op: vibration unsupported, blocked, or disabled by the user */
  }
}
