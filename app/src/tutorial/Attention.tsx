import { useEffect, useLayoutEffect, useRef, useState, type JSX } from "react";

import { placeCallout, unionRect, type PlacementViewport, type Rect } from "./placement";
import { useTeachingRects } from "./useTeachingRects";

/**
 * The spatial teaching layer (`ONBOARDING_DESIGN.md` §5).
 *
 * Two things are drawn over the table: a **spotlight** that quiets everything
 * except the objects the current step is about, and a **callout** carrying the
 * sentence about them. Both are painted above the table and neither is in its
 * layout, so nothing here can move a tile under the player's thumb.
 *
 * The whole overlay is `pointer-events: none`. The learner taps the real hand,
 * the real claim button and the real tile — the spotlight is a way of seeing
 * the table, never a thing standing in front of it. That also means a step
 * that spotlights the wrong element is a cosmetic bug rather than a lockout.
 *
 * The callout's placement is decided by `placement.ts`, which owns the
 * degradation ladder §5.6 settles: beside the target where the phone has room,
 * at the nearest free edge with a leader where it does not, and — as the floor
 * — back to the coach strip with **the spotlight retained**, so the learner is
 * never reduced to searching the screen for the sentence's referent.
 */

/** Corner rounding on the spotlight hole, in px. */
const HOLE_RADIUS = 10;
/** Breathing room around a spotlit object so its own edge is not clipped. */
const HOLE_PAD = 6;

export interface AttentionProps {
  /**
   * The viewport and its safe-area insets, taken from the same geometry the
   * table itself was laid out from rather than re-read here. Two readers of
   * env(safe-area-inset-*) can disagree — that disagreement is precisely the
   * bug class `?layoutdebug=1` exists to catch — and a spotlight computed
   * against a different viewport than the table would be wrong in exactly the
   * situations it matters most.
   */
  readonly viewport: PlacementViewport;
  /** Selectors for the objects this step is about. */
  readonly targets: readonly string[];
  /** The sentence to put beside them. */
  readonly callout: string;
  /**
   * Selectors for live decision inputs the callout must not cover, on top of
   * the target itself: the hand, the claim band, the offered tile (§5.5).
   */
  readonly protect?: readonly string[];
  /**
   * How hard the step is currently cueing (§5.4). Raises the spotlight's
   * contrast and thickens the target ring; it never changes what is spotlit.
   */
  readonly level?: 0 | 1 | 2 | 3;
  /**
   * Called with the rung the callout actually reached. The coach strip uses it
   * to take the sentence over when the ladder bottoms out at "global", which
   * is the one case where the strip is the right place for it.
   */
  readonly onRung?: (rung: "adjacent" | "edge" | "global") => void;
}

function pad(rect: Rect, by: number): Rect {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + by * 2,
    height: rect.height + by * 2,
  };
}

export function Attention({
  viewport,
  targets,
  callout,
  protect = [],
  level = 0,
  onRung,
}: AttentionProps): JSX.Element | null {
  const targetRects = useTeachingRects(targets);
  const protectRects = useTeachingRects(protect);
  const [calloutSize, setCalloutSize] = useState({ width: 0, height: 0 });
  const calloutRef = useRef<HTMLDivElement>(null);

  /*
   * The callout is measured rather than estimated.
   *
   * Its height depends on how many lines the sentence wraps to, which depends
   * on the width the tier gives it — so a guessed height would place a
   * two-line callout as though it were one line and put it over the tile it is
   * about, which is the one thing §5.5 forbids outright. It is rendered
   * off-placement for a frame, measured, then positioned.
   */
  useLayoutEffect(() => {
    const node = calloutRef.current;
    if (node === null) return;
    const box = node.getBoundingClientRect();
    setCalloutSize((current) =>
      Math.abs(current.width - box.width) < 0.5 && Math.abs(current.height - box.height) < 0.5
        ? current
        : { width: box.width, height: box.height },
    );
  }, [callout, viewport.width, viewport.height, targetRects]);

  const placement = placeCallout({
    targets: targetRects,
    viewport,
    callout: calloutSize,
    forbidden: protectRects,
  });

  const reportedRef = useRef<string | null>(null);
  useEffect(() => {
    if (reportedRef.current === placement.rung) return;
    reportedRef.current = placement.rung;
    onRung?.(placement.rung);
  }, [placement.rung, onRung]);

  if (targetRects.length === 0) return null;
  const focus = unionRect(targetRects);
  if (focus === null) return null;

  const holes = targetRects.map((rect) => pad(rect, HOLE_PAD));
  const box = placement.box;
  const anchored = box !== null;

  return (
    <div className="attention" data-level={level} aria-hidden="true">
      {/*
        The scrim, with a hole cut per spotlit object.
        An SVG mask rather than the usual single-hole box-shadow trick, because
        a step routinely lights two or three separate objects at once — the two
        matching tiles and the discard they would combine with — and a shadow
        can only ever cut one hole.
      */}
      <svg className="attention__scrim" width={viewport.width} height={viewport.height}>
        <defs>
          <mask id="attention-mask">
            <rect x="0" y="0" width={viewport.width} height={viewport.height} fill="white" />
            {holes.map((hole, index) => (
              <rect
                key={index}
                x={hole.x}
                y={hole.y}
                width={hole.width}
                height={hole.height}
                rx={HOLE_RADIUS}
                fill="black"
              />
            ))}
          </mask>
        </defs>
        <rect
          className="attention__dim"
          x="0"
          y="0"
          width={viewport.width}
          height={viewport.height}
          mask="url(#attention-mask)"
        />
        {/*
          A drawn ring as well as the hole. Dimming alone is a brightness
          difference, and §5.5 requires the target to survive colour-vision
          differences through shape and outline — so the object is outlined,
          not merely left brighter than its surroundings.
        */}
        {holes.map((hole, index) => (
          <rect
            key={index}
            className="attention__ring"
            x={hole.x}
            y={hole.y}
            width={hole.width}
            height={hole.height}
            rx={HOLE_RADIUS}
          />
        ))}
        {placement.rung === "edge" && placement.pointsAt !== null && box !== null && (
          <line
            className="attention__leader"
            x1={box.x + box.width / 2}
            y1={box.y + box.height / 2}
            x2={placement.pointsAt.x}
            y2={placement.pointsAt.y}
          />
        )}
      </svg>

      {/*
        Rendered even at the global rung so it can be measured — it is hidden
        rather than unmounted, because unmounting it would leave nothing to
        measure and the placement would never climb back off the floor when the
        phone rotates into a shape that has room for it.
      */}
      <div
        ref={calloutRef}
        className="attention__callout"
        data-rung={placement.rung}
        data-side={placement.side ?? "none"}
        style={
          anchored
            ? { left: `${String(box.x)}px`, top: `${String(box.y)}px` }
            : { left: "0px", top: "0px", visibility: "hidden" }
        }
      >
        {callout}
      </div>
    </div>
  );
}
