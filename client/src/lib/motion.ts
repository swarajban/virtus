import type { Variants, Transition } from "framer-motion";

/**
 * Motion system: "Racked."
 *
 * The subject is a barbell strength program. Movement in a gym is mechanical and
 * weighted — a loaded bar slides through the J-hooks and the plates seat with a
 * firm clack. Nothing floats or springs. So screens travel HORIZONTALLY with
 * weight: quick out of the gate, firm settle, no overshoot (a spring bounce would
 * read as toy-like — wrong for iron). Direction encodes position in the lift
 * sequence: forward drives in from the right, back from the left.
 *
 * One easing token, two durations. Applied with restraint — pages and the press
 * of a button, nothing else.
 */

// iOS-like "decelerate" curve: fast start, weighted settle, zero overshoot.
export const RACK_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

export const DURATION = {
  page: 0.26, // screen travel
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

/** Enter-only page variants. The entering screen slides a short, weighted
 * distance and fades up; the previous screen is covered. A 40px travel reads as
 * native and stays scroll-safe on tall pages (full-bleed card slides are the
 * flashy default but fragile here — the disciplined call is the short slide). */
export function pageVariants(direction: NavDirection, reduced: boolean): Variants {
  if (reduced) {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
    };
  }
  const dx = direction === "forward" ? 40 : -40;
  return {
    initial: { x: dx, opacity: 0 },
    animate: { x: 0, opacity: 1 },
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
