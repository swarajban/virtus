import type { Variants, Transition } from "framer-motion";

/**
 * Motion system.
 *
 * Fast crossfade for page transitions (150ms opacity 0→1, no travel). Tactile
 * button press feedback (scale 0.96). Weighted easing (RACK_EASE) — quick start,
 * firm settle, no bounce. Applied with restraint: pages and buttons only.
 */

// iOS-like "decelerate" curve: fast start, weighted settle, zero overshoot.
export const RACK_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

export const DURATION = {
  page: 0.15, // fast crossfade
  tap: 0.08, // button press response
  reward: 0.32, // completion "seat and lock"
} as const;

export type NavDirection = "forward" | "back";

// Module-level direction, set synchronously by a nav action right before the
// route changes, then read once by the entering page on mount. Defaults to
// "forward" so a fresh load / deep-link slides in naturally.
let _navDirection: NavDirection = "forward";

export function setNavDirection(dir: NavDirection) {
  _navDirection = dir;
}

export function getNavDirection(): NavDirection {
  return _navDirection;
}

/** Fast crossfade for page transitions. Pure opacity, no travel.
 * Includes exit variant so AnimatePresence can overlap outgoing/incoming screens. */
export function pageVariants(direction: NavDirection, reduced: boolean): Variants {
  if (reduced) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 }, // instant, no fade
    };
  }
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 }, // fade out while new fades in
  };
}

export function pageTransition(reduced: boolean): Transition {
  return reduced
    ? { duration: 0 }
    : { duration: DURATION.page, ease: RACK_EASE };
}

/** Firm physical-button press. Scale only — no opacity flicker. */
export function tapProps(reduced: boolean) {
  if (reduced) return {};
  return {
    whileTap: { scale: 0.96 },
    transition: { duration: DURATION.tap, ease: RACK_EASE },
  };
}
