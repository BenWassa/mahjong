import { useCallback, useEffect, useRef } from "react";

/**
 * The Android Back contract for anything that opens over something else.
 *
 * `ONBOARDING_DESIGN.md` §4.3 states it: Back is always "close the topmost
 * thing", never "leave the product". Each overlay owns exactly one history
 * entry, and *every* exit routes through that entry — the close button, a tap
 * on the backdrop, Escape and the hardware button all pop the same one. One
 * door, so Back never has to be pressed twice to get anywhere and there is no
 * ordering to get wrong between the mechanisms.
 *
 * Lifted out of `PeekHands`, which has implemented exactly this since #32 and
 * now shares it with the menu sheet, the rules and stats surfaces, and the
 * walkthrough's leave prompt — the whole point of §4.3 being that Back means
 * the same thing on every one of them.
 */
export function useOverlayBack(onClose: () => void): () => void {
  /*
   * Guards the push against StrictMode's deliberate double-invoke of effects
   * in development, which would otherwise stack two entries and make the first
   * back press a no-op on the dev server only — exactly the class of bug that
   * survives to a phone because production never reproduces it.
   */
  const pushedRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!pushedRef.current) {
      pushedRef.current = true;
      try {
        window.history.pushState({ mahjongOverlay: true }, "");
      } catch {
        // A browsing context that refuses pushState still gets a working
        // overlay; it just closes directly rather than through history.
        pushedRef.current = false;
      }
    }
    const onPop = (): void => {
      pushedRef.current = false;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => { window.removeEventListener("popstate", onPop); };
  }, []);

  return useCallback(() => {
    if (pushedRef.current) window.history.back();
    else closeRef.current();
  }, []);
}

/** Escape, bound on the document so it works wherever focus happens to be. */
export function useEscapeToClose(requestClose: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      requestClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); };
  }, [requestClose]);
}
