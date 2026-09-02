/**
 * `?layoutdebug=1` — the layout diagnostics flag.
 *
 * The whole reason this exists is a real phone. Reasoning about a landscape
 * Android viewport from a laptop is guesswork: the browser's device emulation
 * does not reproduce the gesture-navigation insets, the address bar's effect on
 * the visual viewport, or the cutout, and those are exactly the values that
 * decide whether the hand fits. The HUD puts the numbers the layout actually
 * used on the screen the layout is actually on, so a responsive question is
 * answered by reading rather than by another build.
 *
 * It ships in the production bundle on purpose. Gating it on `import.meta.env`
 * would put it in dev builds only, which is the one place it is least needed —
 * the phone runs the deployed PWA. It is instead gated on a query parameter
 * that nothing in the interface links to, read once at startup, and never
 * written to storage: a normal launch cannot reach it, and a link cannot leave
 * it switched on.
 */
export function isLayoutDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("layoutdebug") === "1";
}
