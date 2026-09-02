import { describe, expect, it } from "vitest";

import {
  CLAIM_BAND_H,
  MAX_TILE_W,
  MIN_DISCARD_TILE_W,
  MIN_TILE_W,
  computeGeometry,
  type Viewport,
} from "./geometry";

/**
 * The responsive-geometry contract, asserted at the device classes the table
 * actually has to survive rather than at the one resolution it was designed
 * on. #7 passed with horizontal room to spare on the tested phone; production
 * must fit whatever viewport it is given.
 */

function viewport(
  width: number,
  height: number,
  insets: Partial<Viewport> = {},
): Viewport {
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

/** The Android landscape classes in the QA matrix. */
const LANDSCAPE = [
  { id: "narrow 640x360", vp: viewport(640, 360) },
  { id: "typical 915x412", vp: viewport(915, 412) },
  { id: "tall 1024x420", vp: viewport(1024, 420) },
  { id: "wide 1080x460", vp: viewport(1080, 460) },
  {
    id: "inset 915x412",
    vp: viewport(915, 412, { safeLeft: 48, safeRight: 48, safeBottom: 24 }),
  },
  { id: "small 568x320", vp: viewport(568, 320) },
];

describe("computeGeometry across the landscape matrix", () => {
  for (const { id, vp } of LANDSCAPE) {
    describe(id, () => {
      const geometry = computeGeometry({ viewport: vp, meldCount: 0 });

      it("seats a readable hand", () => {
        expect(geometry.tileW).toBeGreaterThanOrEqual(MIN_TILE_W);
        expect(geometry.fits).toBe(true);
      });

      it("never lets the hand exceed the usable width", () => {
        const usable = vp.width - vp.safeLeft - vp.safeRight;
        expect(geometry.handWidth).toBeLessThanOrEqual(usable);
      });

      it("keeps the hand and the rest of the table inside the height", () => {
        const used =
          geometry.tileH + CLAIM_BAND_H + geometry.tableTopHeight + vp.safeTop + vp.safeBottom;
        expect(used).toBeLessThanOrEqual(vp.height + 1);
      });

      it("shows whole rows of discards only", () => {
        expect(geometry.discardRows).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(geometry.discardRows)).toBe(true);
      });

      it("reports landscape", () => {
        expect(geometry.orientation).toBe("landscape");
      });
    });
  }
});

describe("geometry stability", () => {
  it("does not resize the hand between the 13 and 14 tile halves of a turn", () => {
    // The hand is sized for 14 slots throughout, so drawing and discarding
    // cannot move a tile out from under the player's thumb mid-decision.
    const a = computeGeometry({ viewport: viewport(915, 412), meldCount: 0 });
    const b = computeGeometry({ viewport: viewport(915, 412), meldCount: 0 });
    expect(a.tileW).toBe(b.tileW);
    expect(a.handSlots).toBe(14);
  });

  it("reduces the hand only when a meld is actually exposed", () => {
    const none = computeGeometry({ viewport: viewport(915, 412), meldCount: 0 });
    const one = computeGeometry({ viewport: viewport(915, 412), meldCount: 1 });
    expect(none.handSlots).toBe(14);
    expect(one.handSlots).toBe(11);
    // Losing three slots must not shrink the tiles: it should free width.
    expect(one.tileW).toBeGreaterThanOrEqual(none.tileW);
  });

  it("keeps a meld strip inside the row it shares with the hand", () => {
    for (const meldCount of [1, 2, 3, 4]) {
      const geometry = computeGeometry({ viewport: viewport(640, 360), meldCount });
      expect(geometry.handSlots).toBe(Math.max(1, 14 - meldCount * 3));
      expect(geometry.handWidth).toBeLessThan(640);
    }
  });
});

describe("discard pile rows", () => {
  it("never asks for more rows than the well can actually show", () => {
    // The pile shares the table top with the across-seat label and with the
    // focus slot, which is reserved at the height of the offered tile rather
    // than of the plaque. Sizing the pile without that reservation sheared its
    // bottom row on viewports whose insets had taken the slack away.
    for (const { id, vp } of LANDSCAPE) {
      const g = computeGeometry({ viewport: vp, meldCount: 0 });
      const pileH = g.discardRows * (g.discardTileW * (4 / 3) + 2);
      const focusSlot = g.tileH + 16;
      const available = g.tableTopHeight - 34 - focusSlot - 24 - 6;
      expect(
        pileH,
        `${id}: ${String(g.discardRows)} rows do not fit in ${String(available)}px`,
      ).toBeLessThanOrEqual(available + 2);
    }
  });

  it("always shows at least one row", () => {
    for (const { vp } of LANDSCAPE) {
      expect(computeGeometry({ viewport: vp, meldCount: 0 }).discardRows).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("spare width policy", () => {
  it("caps the hand rather than stretching it across a wide viewport", () => {
    const wide = computeGeometry({ viewport: viewport(1400, 500), meldCount: 0 });
    expect(wide.tileW).toBe(MAX_TILE_W);
    expect(wide.spareWidth).toBeGreaterThan(0);
  });

  it("spends the surplus on discard history, not on a wider hand", () => {
    const typical = computeGeometry({ viewport: viewport(915, 412), meldCount: 0 });
    const wide = computeGeometry({ viewport: viewport(1280, 480), meldCount: 0 });
    expect(wide.discardColumns).toBeGreaterThanOrEqual(typical.discardColumns);
  });

  it("always leaves a margin beside the hand", () => {
    for (const { vp } of LANDSCAPE) {
      const geometry = computeGeometry({ viewport: vp, meldCount: 0 });
      const usable = vp.width - vp.safeLeft - vp.safeRight;
      expect(usable - geometry.handWidth).toBeGreaterThan(0);
    }
  });
});

describe("safe areas", () => {
  it("takes landscape side insets out of the hand's width", () => {
    const bare = computeGeometry({ viewport: viewport(915, 412), meldCount: 0 });
    const inset = computeGeometry({
      viewport: viewport(915, 412, { safeLeft: 48, safeRight: 48 }),
      meldCount: 0,
    });
    expect(inset.tileW).toBeLessThan(bare.tileW);
    expect(inset.handWidth).toBeLessThanOrEqual(915 - 96);
  });

  it("still seats a readable hand with heavy insets", () => {
    const geometry = computeGeometry({
      viewport: viewport(915, 412, { safeLeft: 64, safeRight: 64, safeBottom: 32 }),
      meldCount: 0,
    });
    expect(geometry.tileW).toBeGreaterThanOrEqual(MIN_TILE_W);
  });
});

describe("portrait", () => {
  it("is reported as portrait so the app can offer the menu surface", () => {
    const geometry = computeGeometry({ viewport: viewport(412, 915), meldCount: 0 });
    expect(geometry.orientation).toBe("portrait");
  });
});

describe("the responsive priority policy", () => {
  /*
   * The order the policy protects: player hand → actions and claims → discard
   * well → exposed melds → opponent metadata → explanatory chrome. What these
   * assert is that pressure is answered by dropping whole bands from the
   * bottom of that list, never by shrinking the top of it.
   */

  it("pays for everything on the phone classes that can afford it", () => {
    for (const id of ["narrow 640x360", "typical 915x412", "tall 1024x420"]) {
      const entry = LANDSCAPE.find((candidate) => candidate.id === id);
      const geometry = computeGeometry({ viewport: entry?.vp ?? viewport(915, 412), meldCount: 0 });
      expect(geometry.policy.tier, id).toBe("full");
      expect(geometry.breaches, id).toEqual([]);
    }
  });

  it("drops explanatory chrome before anything the player acts on", () => {
    // The 320px-tall class. The Explain banner is pinned over the felt, and
    // over a table top this short it covers the discard well it is annotating.
    const short = computeGeometry({ viewport: viewport(568, 320), meldCount: 0 });
    expect(short.policy.showChrome).toBe(false);
    expect(short.tileW).toBeGreaterThanOrEqual(MIN_TILE_W);
    expect(short.discardTileW).toBeGreaterThanOrEqual(MIN_DISCARD_TILE_W);
  });

  it("drops opponent metadata before the melds beside it", () => {
    const narrow = computeGeometry({ viewport: viewport(600, 340), meldCount: 0 });
    expect(narrow.policy.showSeatMeta).toBe(false);
    expect(narrow.policy.showSeatMelds).toBe(true);
    expect(narrow.policy.tier).toBe("compact");
  });

  it("collapses in order rather than all at once", () => {
    // Every step of the ladder is monotonic in the axis that pays for it: a
    // wider viewport never has *less* shown than a narrower one.
    let meta = false;
    let melds = false;
    for (const width of [420, 470, 520, 568, 600, 640, 720, 915]) {
      const { policy } = computeGeometry({ viewport: viewport(width, 412), meldCount: 0 });
      if (meta) expect(policy.showSeatMeta, `${String(width)}px`).toBe(true);
      if (melds) expect(policy.showSeatMelds, `${String(width)}px`).toBe(true);
      // Metadata is below melds in the order, so it can never be the survivor.
      if (policy.showSeatMeta) expect(policy.showSeatMelds, `${String(width)}px`).toBe(true);
      meta = policy.showSeatMeta;
      melds = policy.showSeatMelds;
    }
  });

  it("never spends the hand or the well to keep a lower-priority band", () => {
    // The whole point of the ladder. Walk the width down through both
    // collapse thresholds: at every step the hand tile and the discard tile
    // are still at or above their floors, which is what the bands below them
    // were given up for. 520px is the narrowest viewport that can seat the
    // protected band at all; below it no policy helps and a breach is
    // reported instead, which the breach tests cover.
    for (const width of [520, 540, 568, 600, 640, 720, 915]) {
      const geometry = computeGeometry({ viewport: viewport(width, 412), meldCount: 0 });
      const where = `${String(width)}px`;
      expect(geometry.tileW, where).toBeGreaterThanOrEqual(MIN_TILE_W);
      expect(geometry.discardTileW, where).toBeGreaterThanOrEqual(MIN_DISCARD_TILE_W);
      expect(geometry.discardColumns, where).toBeGreaterThanOrEqual(6);
    }
  });
});

describe("floors on the tiles the player reads but never taps", () => {
  it("keeps discards readable rather than scaling them with a squeezed hand", () => {
    for (const { id, vp } of LANDSCAPE) {
      const geometry = computeGeometry({ viewport: vp, meldCount: 0 });
      expect(geometry.discardTileW, id).toBeGreaterThanOrEqual(MIN_DISCARD_TILE_W);
    }
  });

  it("shows fewer discards rather than smaller ones on a narrow phone", () => {
    const narrow = computeGeometry({ viewport: viewport(568, 320), meldCount: 0 });
    const wide = computeGeometry({ viewport: viewport(1080, 460), meldCount: 0 });
    expect(narrow.discardTileW).toBeGreaterThanOrEqual(MIN_DISCARD_TILE_W);
    expect(narrow.discardColumns * narrow.discardRows).toBeLessThan(
      wide.discardColumns * wide.discardRows,
    );
  });
});

describe("breached minimums", () => {
  it("reports nothing on the supported matrix", () => {
    for (const { id, vp } of LANDSCAPE) {
      expect(computeGeometry({ viewport: vp, meldCount: 0 }).breaches, id).toEqual([]);
    }
  });

  it("names the constraint it could not pay, rather than silently overflowing", () => {
    // Portrait cannot seat fourteen readable tiles on one row; the tutorial's
    // stylesheet wraps them instead. The engine still has to say so, because
    // the layout HUD is the thing that tells a real phone what went wrong.
    const geometry = computeGeometry({ viewport: viewport(412, 915), meldCount: 0 });
    expect(geometry.fits).toBe(false);
    expect(geometry.breaches.map((breach) => breach.id)).toContain("hand-tile");
    const breach = geometry.breaches.find((candidate) => candidate.id === "hand-tile");
    expect(breach?.need).toBe(MIN_TILE_W);
    expect(breach?.got).toBeLessThan(MIN_TILE_W);
  });
});

describe("the Peek overlay's tiles", () => {
  it("is readable on every class, including the ones the table itself squeezes", () => {
    for (const { id, vp } of LANDSCAPE) {
      const geometry = computeGeometry({ viewport: vp, meldCount: 0 });
      expect(geometry.peekTileW, id).toBeGreaterThanOrEqual(MIN_TILE_W);
    }
  });

  it("is far larger than the seat rail it replaced", () => {
    // The complaint Peek answers: an open hand drawn in a seat rail was 13-16px
    // wide, which is a picture of a tile rather than a tile.
    const geometry = computeGeometry({ viewport: viewport(568, 320), meldCount: 0 });
    expect(geometry.peekTileW).toBeGreaterThan(geometry.oppTileW * 2);
  });

  it("keeps a readable size in portrait by wrapping instead of shrinking", () => {
    const geometry = computeGeometry({ viewport: viewport(412, 915), meldCount: 0 });
    expect(geometry.peekTileW).toBe(MIN_TILE_W);
  });
});

describe("the discard well's own floor", () => {
  it("is reported as a breach rather than overflowed silently", () => {
    // The pile keeps six columns at a readable tile size. Squeeze the width far
    // enough — well below anything this product supports, which is the point:
    // the invariant is checked rather than assumed — and those two promises
    // stop being compatible. The layout says so instead of drawing a pile
    // wider than the well holding it.
    const squeezed = computeGeometry({ viewport: viewport(280, 412), meldCount: 0 });
    expect(squeezed.breaches.map((breach) => breach.id)).toContain("discard-well");
  });

  it("is not breached anywhere on the supported matrix", () => {
    for (const { id, vp } of LANDSCAPE) {
      const geometry = computeGeometry({ viewport: vp, meldCount: 0 });
      expect(geometry.breaches.map((breach) => breach.id), id).not.toContain("discard-well");
    }
  });
});
