/**
 * Instant press feedback foundation (compositor-safe).
 *
 * Buttons get press feedback from pure CSS `:active` (WebKit applies `:active` to
 * interactive elements natively). But iOS WebKit does NOT apply `:active` to plain
 * `<div>` cards/rows unless the document has a touch listener — and even then it's
 * touch-only. So for the tappable CARDS we use one globally-delegated pointer
 * handler that toggles `data-pressed` on the nearest `.press-card`. Pointer events
 * unify mouse + touch, fire on press (before click), and we mutate the DOM
 * attribute directly (no React state) so the `transform: scale()` happens on the
 * compositor with zero lag. CSS drives the actual scale (see `.press-card` in
 * index.css). Install once at startup.
 */
export function installPressFeedback(): void {
  if (typeof document === "undefined") return;

  // Opt the whole page in to CSS `:active` on non-interactive elements on iOS.
  document.addEventListener("touchstart", () => {}, { passive: true });

  let pressed: HTMLElement | null = null;
  const release = () => {
    if (pressed) {
      pressed.removeAttribute("data-pressed");
      pressed = null;
    }
  };

  document.addEventListener(
    "pointerdown",
    (e) => {
      const target = e.target as Element | null;
      const card = target?.closest?.(".press-card") as HTMLElement | null;
      if (card) {
        if (pressed && pressed !== card) release();
        card.setAttribute("data-pressed", "true");
        pressed = card;
      }
    },
    { passive: true },
  );

  // Release on lift, cancel (iOS fires pointercancel when a tap turns into a
  // scroll), or when the pointer leaves the document.
  document.addEventListener("pointerup", release, { passive: true });
  document.addEventListener("pointercancel", release, { passive: true });
  document.addEventListener("pointerleave", release, { passive: true });
}
