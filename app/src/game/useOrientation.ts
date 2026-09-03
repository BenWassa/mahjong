import { useEffect, useState } from "react";

/**
 * Which way up the phone is.
 *
 * It used to decide which *screen* the player was on: landscape was the table
 * and portrait was the menu, settings, Learn, rules and stats. #33 removes
 * that. `ONBOARDING_DESIGN.md` §4.2 replaces it with one rule —
 *
 *   > screen state chooses the surface; orientation only affects how that
 *   > surface lays out
 *
 * — because rotating the hardware is not a menu command anybody would guess,
 * and a player holding a live table had no visible route to the rest of the
 * product. The table is still landscape: fourteen readable tiles is a hard
 * constraint and #33 does not reopen it. What changed is that portrait now
 * holds the table's state and asks for the phone back, rather than silently
 * navigating somewhere else.
 */
export function useIsLandscape(): boolean {
  const [landscape, setLandscape] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= window.innerHeight,
  );
  useEffect(() => {
    const update = (): void => { setLandscape(window.innerWidth >= window.innerHeight); };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return landscape;
}
