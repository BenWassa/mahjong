import { useEffect, useState } from "react";

import { computeGeometry, type TableGeometry, type Viewport } from "./geometry";

/**
 * Reads the real viewport, including the safe-area insets, and recomputes the
 * table geometry when either changes.
 *
 * Insets are read from a probe element rather than guessed, because the value
 * of env(safe-area-inset-*) is not otherwise available to script, and in
 * landscape on an Android phone the left and right insets are the ones that
 * actually take width away from the hand.
 */

function readInsets(): Pick<Viewport, "safeTop" | "safeRight" | "safeBottom" | "safeLeft"> {
  if (typeof document === "undefined") {
    return { safeTop: 0, safeRight: 0, safeBottom: 0, safeLeft: 0 };
  }
  const probe = document.createElement("div");
  probe.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "visibility:hidden",
    "pointer-events:none",
    "padding-top:env(safe-area-inset-top,0px)",
    "padding-right:env(safe-area-inset-right,0px)",
    "padding-bottom:env(safe-area-inset-bottom,0px)",
    "padding-left:env(safe-area-inset-left,0px)",
  ].join(";");
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const insets = {
    safeTop: Number.parseFloat(style.paddingTop) || 0,
    safeRight: Number.parseFloat(style.paddingRight) || 0,
    safeBottom: Number.parseFloat(style.paddingBottom) || 0,
    safeLeft: Number.parseFloat(style.paddingLeft) || 0,
  };
  probe.remove();
  return insets;
}

function readViewport(): Viewport {
  const width = window.visualViewport?.width ?? window.innerWidth;
  const height = window.visualViewport?.height ?? window.innerHeight;
  return { width: Math.round(width), height: Math.round(height), ...readInsets() };
}

export function useTableGeometry(meldCount: number): TableGeometry {
  const [viewport, setViewport] = useState<Viewport>(() =>
    typeof window === "undefined"
      ? { width: 915, height: 412, safeTop: 0, safeRight: 0, safeBottom: 0, safeLeft: 0 }
      : readViewport(),
  );

  useEffect(() => {
    const update = (): void => {
      setViewport((previous) => {
        const next = readViewport();
        const same =
          previous.width === next.width &&
          previous.height === next.height &&
          previous.safeLeft === next.safeLeft &&
          previous.safeRight === next.safeRight &&
          previous.safeTop === next.safeTop &&
          previous.safeBottom === next.safeBottom;
        return same ? previous : next;
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  return computeGeometry({ viewport, meldCount });
}
