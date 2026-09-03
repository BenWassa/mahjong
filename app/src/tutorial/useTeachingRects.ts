import { useCallback, useEffect, useState } from "react";

import type { Rect } from "./placement";

/**
 * Measures the live elements a teaching step is pointing at.
 *
 * The attention layer never stores a coordinate. It asks the DOM where the
 * player's hand actually is on this phone, in this orientation, at this layout
 * tier, with these safe-area insets — which is the only way a spotlight can be
 * correct on hardware the layout was not tuned against. `game/geometry.ts`
 * makes the same bargain from the other direction: it computes the layout from
 * the real viewport rather than from a device list.
 *
 * A selector that matches nothing measures to nothing. That is a normal state,
 * not an error: a step may point at the Pung control a beat before the claim
 * is offered, and the attention layer simply has nothing to draw until it
 * exists. It must never fabricate a rectangle for a control that is not there.
 */
export function useTeachingRects(selectors: readonly string[]): readonly Rect[] {
  const [rects, setRects] = useState<readonly Rect[]>([]);
  // The selectors' contents, not the array's identity: every render builds a
  // new array and what the effect depends on is which elements it names.
  const key = selectors.join("|");

  const measure = useCallback(() => {
    const next: Rect[] = [];
    for (const selector of key === "" ? [] : key.split("|")) {
      let nodes: NodeListOf<Element>;
      try {
        nodes = document.querySelectorAll(selector);
      } catch {
        // A malformed selector is a content bug, not a reason to take the
        // table down. It measures to nothing and the step degrades to the
        // global rung, which is the same floor every other failure lands on.
        continue;
      }
      for (const node of nodes) {
        const box = node.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) continue;
        next.push({ x: box.x, y: box.y, width: box.width, height: box.height });
      }
    }
    setRects((current) => (sameRects(current, next) ? current : next));
  }, [key]);

  useEffect(() => {
    measure();
    // Rotation, a keyboard, an inset change, a tier change that re-lays the
    // whole table, and the tile that arrives mid-step all move the target.
    // Observing the document covers all of them without the caller having to
    // enumerate which of its own state changes matter.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { measure(); });
    observer?.observe(document.documentElement);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.addEventListener("scroll", measure, true);
    // One deferred re-measure after paint: a step that begins on the same
    // frame its target mounts would otherwise measure the frame before it.
    const raf =
      typeof requestAnimationFrame === "undefined" ? null : requestAnimationFrame(measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.removeEventListener("scroll", measure, true);
      if (raf !== null && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(raf);
    };
  }, [measure]);

  return rects;
}

function sameRects(left: readonly Rect[], right: readonly Rect[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((rect, index) => {
    const other = right[index];
    if (other === undefined) return false;
    // Sub-pixel jitter from a transform or a scrollbar is not a layout change,
    // and treating it as one would re-render the overlay on every frame.
    return (
      Math.abs(rect.x - other.x) < 0.5 &&
      Math.abs(rect.y - other.y) < 0.5 &&
      Math.abs(rect.width - other.width) < 0.5 &&
      Math.abs(rect.height - other.height) < 0.5
    );
  });
}
