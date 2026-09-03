/**
 * Where an anchored callout goes, and what to do when there is nowhere for it.
 *
 * Pure, and deliberately so: this is the rule `ONBOARDING_DESIGN.md` §5.6
 * settles, and it has to be assertable at every phone class without a browser
 * — the same reason `game/geometry.ts` is a pure function of the viewport.
 * The React layer measures rectangles and renders what this returns.
 *
 * The problem it solves: §5.5 says a callout must never cover its own target,
 * the player's hand, the claim band, or the offered tile. On a short landscape
 * phone those constraints cannot all hold at once — the table has already
 * collapsed its optional bands (`geometry.ts`) and a callout beside the hand
 * lands on the discard well. Shrinking the table is ruled out by `DESIGN.md`
 * §5 and was already disproved by #32.
 *
 * So the design says which half of the attention system degrades. Spotlighting
 * costs no layout: it is painted over the table and moves nothing, so it never
 * degrades. Callouts cost layout, so they do:
 *
 *   1. **adjacent** — beside the target, which is the whole point;
 *   2. **edge** — at the nearest free edge, with a leader back to the target,
 *      so the sentence is still visibly *about* that object;
 *   3. **global** — in the coach strip, with the spotlight retained.
 *
 * Rung 3 is the floor. The learner may have to move their eyes from the strip
 * to the target, but the target is still unambiguously marked, so they never
 * search the whole screen for the referent — which is the failure the whole
 * section exists to prevent.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PlacementViewport {
  readonly width: number;
  readonly height: number;
  readonly safeTop: number;
  readonly safeRight: number;
  readonly safeBottom: number;
  readonly safeLeft: number;
}

export type CalloutRung = "adjacent" | "edge" | "global";
export type CalloutSide = "above" | "below" | "left" | "right";

export interface CalloutPlacement {
  readonly rung: CalloutRung;
  /** Null at the global rung, where the coach strip owns the sentence. */
  readonly box: Rect | null;
  readonly side: CalloutSide | null;
  /** The point on the target a leader should run to. Edge rung only. */
  readonly pointsAt: { readonly x: number; readonly y: number } | null;
}

export interface PlacementInput {
  /** The spotlit objects. Their union is what the callout must sit beside. */
  readonly targets: readonly Rect[];
  readonly viewport: PlacementViewport;
  /** The callout's own measured size. */
  readonly callout: { readonly width: number; readonly height: number };
  /**
   * Rectangles the callout may never cover, because the player is deciding
   * with them right now: the hand, the claim band, the offered tile. The
   * target's own union is added to this — a callout over its own subject is
   * the one placement that is always wrong.
   */
  readonly forbidden?: readonly Rect[];
  /** Clearance between the callout and everything it must not touch. */
  readonly gap?: number;
}

const DEFAULT_GAP = 8;

/** Sides in preference order: above and below first, because a phone in
 *  landscape has far more horizontal room already spoken for than vertical. */
const SIDES: readonly CalloutSide[] = ["above", "below", "right", "left"];

export function unionRect(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const rect of rects) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function overlaps(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.x < b.x + b.width + gap &&
    b.x < a.x + a.width + gap &&
    a.y < b.y + b.height + gap &&
    b.y < a.y + a.height + gap
  );
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/** The rectangle the app may actually draw in, insets removed. */
function safeArea(viewport: PlacementViewport): Rect {
  return {
    x: viewport.safeLeft,
    y: viewport.safeTop,
    width: Math.max(0, viewport.width - viewport.safeLeft - viewport.safeRight),
    height: Math.max(0, viewport.height - viewport.safeTop - viewport.safeBottom),
  };
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * The point on the target that a leader from `box` should run to: the target's
 * own centre, pulled towards the callout so short leaders do not double back
 * across the object they are pointing at.
 */
function attachPoint(target: Rect, box: Rect): { x: number; y: number } {
  const cx = target.x + target.width / 2;
  const cy = target.y + target.height / 2;
  const bx = box.x + box.width / 2;
  const by = box.y + box.height / 2;
  return {
    x: clamp(bx, target.x, target.x + target.width) === bx ? bx : cx,
    y: clamp(by, target.y, target.y + target.height) === by ? by : cy,
  };
}

const GLOBAL: CalloutPlacement = { rung: "global", box: null, side: null, pointsAt: null };

export function placeCallout(input: PlacementInput): CalloutPlacement {
  const focus = unionRect(input.targets);
  if (focus === null) return GLOBAL;

  const gap = input.gap ?? DEFAULT_GAP;
  const safe = safeArea(input.viewport);
  const { width: w, height: h } = input.callout;
  if (w <= 0 || h <= 0 || safe.width < w || safe.height < h) return GLOBAL;

  // The target is always forbidden: a callout over its own subject defeats the
  // point of anchoring it. Everything else is a live decision input.
  const blocked: readonly Rect[] = [focus, ...(input.forbidden ?? [])];
  const clear = (box: Rect): boolean =>
    contains(safe, box) && !blocked.some((rect) => overlaps(box, rect, gap));

  // ---- Rung 1: adjacent -------------------------------------------------
  const centreX = clamp(
    focus.x + focus.width / 2 - w / 2,
    safe.x,
    safe.x + safe.width - w,
  );
  const centreY = clamp(
    focus.y + focus.height / 2 - h / 2,
    safe.y,
    safe.y + safe.height - h,
  );
  for (const side of SIDES) {
    const box: Rect =
      side === "above"
        ? { x: centreX, y: focus.y - gap - h, width: w, height: h }
        : side === "below"
          ? { x: centreX, y: focus.y + focus.height + gap, width: w, height: h }
          : side === "right"
            ? { x: focus.x + focus.width + gap, y: centreY, width: w, height: h }
            : { x: focus.x - gap - w, y: centreY, width: w, height: h };
    if (clear(box)) {
      return { rung: "adjacent", box, side, pointsAt: attachPoint(focus, box) };
    }
  }

  // ---- Rung 2: edge, with a leader --------------------------------------
  //
  // Flush to each safe edge and slid along it as close to the target as it
  // will go, so the leader stays as short as the geometry allows.
  for (const side of SIDES) {
    const box: Rect =
      side === "above"
        ? { x: centreX, y: safe.y, width: w, height: h }
        : side === "below"
          ? { x: centreX, y: safe.y + safe.height - h, width: w, height: h }
          : side === "right"
            ? { x: safe.x + safe.width - w, y: centreY, width: w, height: h }
            : { x: safe.x, y: centreY, width: w, height: h };
    if (clear(box)) {
      return { rung: "edge", box, side, pointsAt: attachPoint(focus, box) };
    }
  }

  // ---- Rung 3: the floor ------------------------------------------------
  return GLOBAL;
}
