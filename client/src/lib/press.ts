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

  // Track each pointer's pressed card by pointerId so multi-touch can never
  // strand a card scaled (one finger lifting must release only its own card).
  const active = new Map<number, HTMLElement>();
  const release = (pointerId: number) => {
    const card = active.get(pointerId);
    if (card) {
      card.removeAttribute("data-pressed");
      active.delete(pointerId);
    }
  };

  document.addEventListener(
    "pointerdown",
    (e) => {
      const target = e.target as Element | null;
      const card = target?.closest?.(".press-card") as HTMLElement | null;
      if (!card) return;
      // If the press is on a nested control (a button/link INSIDE the card), let
      // that control's own :active feedback handle it — don't also scale the whole
      // row (which would compound into a janky double-shrink).
      const control = target?.closest?.('button, a[href], [role="button"]') as HTMLElement | null;
      if (control && control !== card && card.contains(control)) return;
      card.setAttribute("data-pressed", "true");
      active.set(e.pointerId, card);
    },
    { passive: true },
  );

  // Release on lift or cancel (iOS fires pointercancel when a tap becomes a
  // scroll). Keyed by pointerId — covers every realistic end-of-press.
  document.addEventListener("pointerup", (e) => release(e.pointerId), { passive: true });
  document.addEventListener("pointercancel", (e) => release(e.pointerId), { passive: true });
}
