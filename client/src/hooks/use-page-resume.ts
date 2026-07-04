import { useEffect, useRef } from "react";

// Minimum quiet period between resume callbacks. A bfcache restore fires BOTH
// pageshow and visibilitychange back-to-back, and gym usage flips the tab
// visible between every set — without a floor, each of those would trigger a
// full refetch. Staleness we care about is minutes-to-months, so a few
// seconds of dedupe costs nothing.
const RESUME_THROTTLE_MS = 3000;

/**
 * Fires `onResume` when the page comes back to life after being hidden,
 * frozen, or restored from the back/forward cache — NOT on ordinary loads.
 *
 * This is the shared guard against the stale-resume bug class: a page iOS
 * Safari froze weeks ago still renders (and routes/writes from) a snapshot
 * that may predate a program/cycle switch. Every page that reads or writes
 * workout progress should revalidate through this hook.
 *
 * - `visibilitychange` → visible covers iOS freeze/resume and tab switches.
 * - `pageshow` is gated on `event.persisted` so it only fires for genuine
 *   bfcache restores — unguarded, pageshow fires on EVERY normal load and
 *   would duplicate each page's mount fetch.
 */
export function usePageResume(onResume: () => void) {
  const callbackRef = useRef(onResume);
  useEffect(() => {
    callbackRef.current = onResume;
  }, [onResume]);

  const lastFiredRef = useRef(0);
  useEffect(() => {
    const fire = () => {
      const now = Date.now();
      if (now - lastFiredRef.current < RESUME_THROTTLE_MS) return;
      lastFiredRef.current = now;
      callbackRef.current();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) fire();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") fire();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}
