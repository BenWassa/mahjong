import { describe, expect, it } from "vitest";

import {
  placeCallout,
  unionRect,
  type CalloutPlacement,
  type PlacementViewport,
  type Rect,
} from "./placement";

/**
 * The degradation ladder of `ONBOARDING_DESIGN.md` §5.6, asserted as a
 * behavioural contract rather than as a set of coordinates.
 *
 * §5.5 gives the callout three promises it must keep at once — never cover its
 * own target, never cover a live decision input, stay inside the safe area —
 * and §5.6 admits that on a short landscape phone they cannot all be kept
 * while also sitting beside the target. What it does *not* admit is breaking
 * one of them quietly. So every assertion here is of the same shape: the rung
 * may fall as far as the floor, but whatever box comes back must be legal.
 */

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

function viewport(
  width: number,
  height: number,
  insets: Partial<PlacementViewport> = {},
): PlacementViewport {
  return {
    width,
    height,
    safeTop: 0,
    safeRight: 0,
    safeBottom: 0,
    safeLeft: 0,
    ...insets,
  };
}

/** The rectangle the app may draw in at all, insets removed. */
function safeArea(vp: PlacementViewport): Rect {
  return rect(
    vp.safeLeft,
    vp.safeTop,
    vp.width - vp.safeLeft - vp.safeRight,
    vp.height - vp.safeTop - vp.safeBottom,
  );
}

/**
 * Plain geometric overlap, with no clearance allowance. The module keeps a gap
 * as well, but the §5.5 promise the tests pin down is the weaker, absolute one:
 * whatever else happens, pixels of the callout must not land on the target.
 */
function overlapping(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

function inside(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function boxOf(placement: CalloutPlacement): Rect {
  const { box } = placement;
  if (box === null) throw new Error(`expected a box, got the ${placement.rung} rung`);
  return box;
}

/**
 * The whole contract in one place: a placement that carries a box must have
 * put that box somewhere the player can actually read it, clear of everything
 * they are currently deciding with.
 */
function expectLegal(
  placement: CalloutPlacement,
  vp: PlacementViewport,
  offLimits: readonly Rect[],
  where: string,
): void {
  const { box } = placement;
  if (box === null) return;
  expect(inside(safeArea(vp), box), `${where}: box escapes the safe area`).toBe(true);
  for (const [index, blocked] of offLimits.entries()) {
    expect(
      overlapping(box, blocked),
      `${where}: box covers off-limits rect ${String(index)}`,
    ).toBe(false);
  }
}

const CALLOUT = { width: 200, height: 60 };

describe("the anchored rung", () => {
  it("sits the callout beside a small target when the table has room for it", () => {
    // Rung 1 is the point of the whole feature: the sentence is next to the
    // thing it is about, so the learner never has to look for the referent.
    const target = rect(450, 250, 100, 100);
    const placement = placeCallout({
      targets: [target],
      viewport: viewport(1000, 600),
      callout: CALLOUT,
    });

    expect(placement.rung).toBe("adjacent");
    expect(placement.side).not.toBeNull();
    expect(overlapping(boxOf(placement), target)).toBe(false);
    expectLegal(placement, viewport(1000, 600), [target], "roomy viewport");
  });

  it("prefers the vertical sides, because landscape width is already spoken for", () => {
    // §5.6 places the callout on the side with room; on a landscape table the
    // horizontal room is where the discard well and the seats already live.
    const placement = placeCallout({
      targets: [rect(450, 250, 100, 100)],
      viewport: viewport(1000, 600),
      callout: CALLOUT,
    });

    expect(placement.side).toBe("above");
  });

  it("keeps the box out of the display cutout as well as off the target", () => {
    // §5.5 says placement respects safe areas rather than fixed coordinates,
    // so a notch or a gesture bar removes room in exactly the same way a
    // decision input does.
    const vp = viewport(900, 420, {
      safeTop: 20,
      safeRight: 44,
      safeBottom: 16,
      safeLeft: 44,
    });
    const target = rect(60, 300, 120, 60);
    const placement = placeCallout({ targets: [target], viewport: vp, callout: CALLOUT });
    const box = boxOf(placement);

    expect(box.x).toBeGreaterThanOrEqual(44);
    expectLegal(placement, vp, [target], "inset viewport");
  });
});

describe("the edge rung", () => {
  /*
   * §5.6 rung 2: when nothing fits beside the target, the callout goes to a
   * free edge and draws a leader back. The sentence has moved, but it is still
   * visibly about that object, which is the property the rung exists to buy.
   */
  const vp = viewport(1000, 600);
  const target = rect(400, 270, 200, 60);
  /** Two bands that between them block every adjacent slot but leave the top edge. */
  const decisionInputs = [rect(0, 100, 1000, 168), rect(0, 332, 1000, 68)];
  const placement = placeCallout({
    targets: [target],
    viewport: vp,
    callout: CALLOUT,
    forbidden: decisionInputs,
  });

  it("moves to a free edge rather than covering a live decision input", () => {
    expect(placement.rung).toBe("edge");
    expectLegal(placement, vp, [target, ...decisionInputs], "blocked adjacent slots");
  });

  it("always carries a leader, since an edge callout is otherwise unattached", () => {
    expect(placement.pointsAt).not.toBeNull();
  });

  it("aims the leader at the target itself, not at empty felt", () => {
    const { pointsAt } = placement;
    expect(pointsAt).not.toBeNull();
    if (pointsAt === null) return;
    expect(pointsAt.x).toBeGreaterThanOrEqual(target.x);
    expect(pointsAt.x).toBeLessThanOrEqual(target.x + target.width);
    expect(pointsAt.y).toBeGreaterThanOrEqual(target.y);
    expect(pointsAt.y).toBeLessThanOrEqual(target.y + target.height);
  });
});

describe("the global rung, which is the floor", () => {
  it("hands the sentence to the coach strip when no legal box exists anywhere", () => {
    // The short-phone case §5.6 was written for: the hand owns the bottom of
    // the table and the well plus the coach strip own the top, so there is no
    // rectangle left that is both inside the safe area and off everything the
    // player is deciding with. The spotlight still marks the target, so this
    // degrades the callout without losing the referent.
    const vp = viewport(800, 400);
    const hand = rect(0, 320, 800, 80);
    const tableTop = rect(0, 0, 800, 312);
    const placement = placeCallout({
      targets: [hand],
      viewport: vp,
      callout: { width: 240, height: 64 },
      forbidden: [tableTop],
    });

    expect(placement.rung).toBe("global");
    expect(placement.box).toBeNull();
    expect(placement.side).toBeNull();
    expect(placement.pointsAt).toBeNull();
  });

  it("degrades rather than drawing a callout too large for the screen", () => {
    // A sentence that cannot fit is a sentence the coach strip has to carry;
    // the alternative — placing it half off-screen — breaks §5.5 silently.
    const vp = viewport(400, 300);
    const placement = placeCallout({
      targets: [rect(100, 100, 40, 40)],
      viewport: vp,
      callout: { width: 500, height: 100 },
    });

    expect(placement.rung).toBe("global");
    expect(placement.box).toBeNull();
  });

  it("degrades when the safe area, rather than the viewport, is the thing too small", () => {
    const vp = viewport(400, 300, { safeLeft: 120, safeRight: 120 });
    const placement = placeCallout({
      targets: [rect(160, 100, 40, 40)],
      viewport: vp,
      callout: { width: 200, height: 60 },
    });

    expect(placement.rung).toBe("global");
  });

  it("has nothing to anchor to when nothing is spotlit", () => {
    // §5.1 reserves the global coach line for ideas with no single target, so
    // a step with no target rectangle is already a global-rung step.
    const placement = placeCallout({
      targets: [],
      viewport: viewport(1000, 600),
      callout: CALLOUT,
    });

    expect(placement.rung).toBe("global");
    expect(placement.box).toBeNull();
  });
});

describe("the focus union", () => {
  it("treats several spotlit tiles as the single object they illustrate", () => {
    // §5.2 allows one locus of attention made of several rectangles — the
    // drawn tile and the group it completes, say. The callout must clear all
    // of them, so they are reduced to their bounding box first.
    expect(unionRect([rect(10, 20, 30, 40), rect(100, 5, 20, 20), rect(50, 50, 10, 10)])).toEqual(
      rect(10, 5, 110, 55),
    );
  });

  it("is the rectangle itself when only one thing is spotlit", () => {
    expect(unionRect([rect(4, 8, 15, 16)])).toEqual(rect(4, 8, 15, 16));
  });

  it("is null when nothing is spotlit, so callers cannot anchor to a phantom", () => {
    expect(unionRect([])).toBeNull();
  });

  it("clears every member of a multi-tile focus, not just the first", () => {
    const tiles = [rect(200, 300, 40, 60), rect(260, 300, 40, 60), rect(320, 300, 40, 60)];
    const vp = viewport(1000, 600);
    const placement = placeCallout({ targets: tiles, viewport: vp, callout: CALLOUT });

    for (const tile of tiles) {
      expect(overlapping(boxOf(placement), tile)).toBe(false);
    }
    expectLegal(placement, vp, tiles, "multi-tile focus");
  });
});

/**
 * The reason this module is pure. §5.6 says the rung is a property of the
 * measured viewport and the measured target, not of a device allowlist, so the
 * ladder has to be checkable at every phone class the table has to survive.
 * What follows is not a table of expected rungs — the design deliberately lets
 * the rung fall — but a table of viewports on which an illegal placement would
 * be a bug. It may degrade; it may not lie.
 */
const PHONE_LANDSCAPE: readonly { readonly id: string; readonly vp: PlacementViewport }[] = [
  { id: "compact 640x360", vp: viewport(640, 360) },
  { id: "short 667x375", vp: viewport(667, 375) },
  { id: "wide-short 740x360", vp: viewport(740, 360) },
  { id: "mini 851x393", vp: viewport(851, 393) },
  { id: "typical 915x412", vp: viewport(915, 412) },
  {
    id: "notched 844x390",
    vp: viewport(844, 390, { safeLeft: 44, safeRight: 44, safeBottom: 21 }),
  },
];

const PERMITTED_RUNGS = ["adjacent", "edge", "global"];

/** The player hand: a band across the bottom of the safe area. */
function handRect(vp: PlacementViewport): Rect {
  const usable = vp.width - vp.safeLeft - vp.safeRight;
  const height = Math.round(vp.height * 0.24);
  return rect(
    vp.safeLeft + usable * 0.08,
    vp.height - vp.safeBottom - height,
    usable * 0.84,
    height,
  );
}

/** The claim band, which §5.5 names as a decision input the callout may not cover. */
function claimBandRect(vp: PlacementViewport): Rect {
  const usable = vp.width - vp.safeLeft - vp.safeRight;
  return rect(vp.safeLeft, handRect(vp).y - 44, usable, 36);
}

/** The discard well, the other thing a landscape callout tends to land on. */
function discardWellRect(vp: PlacementViewport): Rect {
  const usable = vp.width - vp.safeLeft - vp.safeRight;
  const top = vp.safeTop + 36;
  return rect(
    vp.safeLeft + usable * 0.28,
    top,
    usable * 0.44,
    Math.max(0, claimBandRect(vp).y - top - 8),
  );
}

describe("the ladder on real landscape phones", () => {
  for (const { id, vp } of PHONE_LANDSCAPE) {
    describe(id, () => {
      const hand = handRect(vp);
      const callout = { width: 220, height: 56 };

      it("returns a rung the design recognises when the hand is the target", () => {
        const placement = placeCallout({ targets: [hand], viewport: vp, callout });
        expect(PERMITTED_RUNGS, id).toContain(placement.rung);
      });

      it("never covers the hand it is talking about", () => {
        // The one placement §5.6 calls always wrong: a callout on its own
        // subject. Whatever rung this phone falls to, this must hold.
        const placement = placeCallout({ targets: [hand], viewport: vp, callout });
        expectLegal(placement, vp, [hand], id);
      });

      it("stays legal once the claim band and the well are off limits too", () => {
        // The realistic case: by the time a claim is offered, all three §5.5
        // decision inputs are live at once. Most phone classes have to drop a
        // rung here, and dropping is allowed — placing the box on the claim
        // band is not.
        const blocked = [claimBandRect(vp), discardWellRect(vp)];
        const placement = placeCallout({
          targets: [hand],
          viewport: vp,
          callout,
          forbidden: blocked,
        });

        expect(PERMITTED_RUNGS, id).toContain(placement.rung);
        expectLegal(placement, vp, [hand, ...blocked], `${id} with decision inputs live`);
      });

      it("never claims to be anchored while pointing at nothing", () => {
        // A box without a rung, or an edge rung without a leader, would leave
        // the learner with a sentence they cannot attach to an object.
        const placement = placeCallout({ targets: [hand], viewport: vp, callout });
        if (placement.box === null) {
          expect(placement.rung, id).toBe("global");
        } else {
          expect(placement.side, id).not.toBeNull();
          expect(placement.pointsAt, id).not.toBeNull();
        }
      });
    });
  }

  it("keeps its clearance promise when a caller asks for a wider gap", () => {
    // The gap is the callout's breathing room, not decoration: at the tight
    // tier a box that merely abuts the hand reads as part of it.
    const vp = viewport(915, 412);
    const hand = handRect(vp);
    const placement = placeCallout({
      targets: [hand],
      viewport: vp,
      callout: { width: 220, height: 56 },
      gap: 24,
    });

    expect(placement.rung).toBe("adjacent");
    expect(placement.side).toBe("above");
    expect(boxOf(placement).y + boxOf(placement).height).toBeLessThanOrEqual(hand.y - 24);
    expectLegal(placement, vp, [hand], "wide gap");
  });
});
