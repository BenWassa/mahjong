/**
 * Responsive table geometry.
 *
 * This is a pure function of the real viewport, so the layout can be asserted
 * at any device class without a browser. Production must fit the viewport it
 * is actually given: the #7 device gate passed with horizontal room to spare
 * on the tested phone, and hardcoding that phone's dimensions would throw the
 * finding away.
 *
 * The rules it encodes, in order of authority:
 *   1. The player's whole hand is visible at once. It never scrolls, because a
 *      scrolling hand breaks tap targeting under a thumb.
 *   2. Tiles stay readable. Below MIN_TILE_W a face is guesswork, so the
 *      layout gives up other things first.
 *   3. Geometry is stable inside a turn. The hand is sized for 14 tiles even
 *      while it holds 13, so nothing resizes under the thumb mid-decision.
 *   4. Spare width is not spent on stretching the hand. Past MAX_TILE_W the
 *      surplus goes to the discard well and the rails instead.
 */

export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly safeTop: number;
  readonly safeRight: number;
  readonly safeBottom: number;
  readonly safeLeft: number;
}

export interface GeometryInput {
  readonly viewport: Viewport;
  /** Exposed melds the viewer holds. Each one removes three tiles from the hand. */
  readonly meldCount: number;
}

export interface TableGeometry {
  readonly tileW: number;
  readonly tileH: number;
  readonly tileGap: number;
  readonly handSlots: number;
  readonly handWidth: number;
  readonly oppTileW: number;
  readonly discardTileW: number;
  readonly discardColumns: number;
  readonly discardRows: number;
  readonly meldTileW: number;
  readonly tableTopHeight: number;
  readonly spareWidth: number;
  /** False when the viewport cannot seat a readable hand; QA asserts on this. */
  readonly fits: boolean;
  readonly orientation: "landscape" | "portrait";
}

/** A face below this is not reliably identifiable at arm's length. PRD §8. */
export const MIN_TILE_W = 34;
/**
 * Past this the hand stops growing and the surplus goes elsewhere.
 *
 * 56px lands around 14.5mm on a typical phone, comfortably above the 13.5mm
 * the #7 device gate accepted, and it guarantees the hand never runs to both
 * screen edges. A hand with no margin puts its outermost tiles under the
 * thumb's screen-edge travel and reads as overflow rather than as composition.
 */
export const MAX_TILE_W = 56;
/** Absolute floor before the layout would rather overflow than lie. */
const HARD_FLOOR_W = 26;

export const TILE_ASPECT = 4 / 3;

const STATUS_H = 26;
/** Reserved whether or not a claim is live, so the hand never moves. PRD §7. */
export const CLAIM_BAND_H = 44;
/** The table top stops being a table below this. */
const MIN_TABLE_TOP_H = 92;
const EDGE_PAD = 8;
const ROW_GAP = 6;
/** Vertical room the across-seat label takes out of the table top. */
const SEAT_LABEL_H = 34;
/** Padding inside the discard well, matching --space-5. */
const WELL_PAD = 12;
/** Room around the offered tile in the reserved focus slot, matching --space-6. */
const FOCUS_SLOT_PAD = 16;

const GAP_STEPS = [4, 3, 2] as const;

/** Width the viewer's own exposed meld tiles are reserved and drawn at. */
const OWN_MELD_TILE_W = 22;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function computeGeometry({ viewport, meldCount }: GeometryInput): TableGeometry {
  const orientation = viewport.width >= viewport.height ? "landscape" : "portrait";

  const availableW =
    viewport.width - viewport.safeLeft - viewport.safeRight - EDGE_PAD * 2;

  // Sized for the widest the hand gets this turn cycle. Fourteen tiles less
  // three per exposed meld: the count only falls when a meld is formed, which
  // is a real state change the player just caused, not a resize under a thumb.
  const handSlots = Math.max(1, 14 - meldCount * 3);
  // The viewer's own exposed melds share the hand row rather than taking a row
  // of their own, because vertical room is what the claim band already spends.
  // Reserved at the kong width so a kong cannot overflow the row it lives in.
  const meldStripW = meldCount * (4 * OWN_MELD_TILE_W + ROW_GAP);

  const availableH =
    viewport.height -
    viewport.safeTop -
    viewport.safeBottom -
    STATUS_H -
    CLAIM_BAND_H -
    ROW_GAP * 2 -
    EDGE_PAD;

  const heightForHand = availableH - MIN_TABLE_TOP_H;
  const heightLimit = Math.floor(heightForHand / TILE_ASPECT);

  // Try the generous gap first and tighten only if that is what buys
  // readability. Losing 2px of gap is cheaper than losing 2px of face.
  let tileGap = GAP_STEPS[GAP_STEPS.length - 1] ?? 2;
  let widthLimit = HARD_FLOOR_W;
  for (const gap of GAP_STEPS) {
    const usable = availableW - meldStripW - (handSlots - 1) * gap;
    const candidate = Math.floor(usable / handSlots);
    if (candidate >= MIN_TILE_W || gap === GAP_STEPS[GAP_STEPS.length - 1]) {
      tileGap = gap;
      widthLimit = candidate;
    }
    if (candidate >= MIN_TILE_W) break;
  }

  const unclamped = Math.min(widthLimit, heightLimit);
  const tileW = clamp(Math.floor(unclamped), HARD_FLOOR_W, MAX_TILE_W);
  const tileH = Math.round(tileW * TILE_ASPECT);
  const handWidth = handSlots * tileW + (handSlots - 1) * tileGap;

  const spareWidth = Math.max(0, availableW - meldStripW - handWidth);

  // Opponent and discard tiles are derived from the hand tile so the table
  // reads as one set of objects at different distances, not three tile sizes.
  const oppTileW = clamp(Math.round(tileW * 0.38), 14, 24);
  const discardTileW = clamp(Math.round(tileW * 0.54), 18, 34);
  const meldTileW = clamp(Math.round(tileW * 0.46), 16, OWN_MELD_TILE_W);

  // Spare width is spent here: a wider viewport shows more discard history
  // rather than a stretched hand.
  const discardWellW = Math.max(120, availableW - 2 * (oppTileW * 3 + EDGE_PAD * 3));
  // Capped at fourteen so a wide phone deepens the pile instead of drawing it
  // as a single line spanning the whole table.
  const discardColumns = clamp(
    Math.floor(discardWellW / (discardTileW + 2)),
    6,
    14,
  );

  const tableTopHeight = Math.max(MIN_TABLE_TOP_H, availableH - tileH);

  // Whole rows only. A pile clipped through the middle of a tile reads as a
  // rendering fault, and half a face is worse than no face.
  //
  // The room the pile actually gets is what is left of the table top after the
  // across-seat label and the focus slot, and the focus slot is reserved at the
  // height of the offered tile rather than of the plaque. Estimating it at a
  // constant sheared the bottom row on viewports whose insets had already
  // taken the slack away.
  const discardTileH = discardTileW * TILE_ASPECT;
  const focusSlotH = tileH + FOCUS_SLOT_PAD;
  const pileHeight =
    tableTopHeight - SEAT_LABEL_H - focusSlotH - WELL_PAD * 2 - ROW_GAP;
  const discardRows = clamp(Math.floor(pileHeight / (discardTileH + 2)), 1, 5);

  return {
    tileW,
    tileH,
    tileGap,
    handSlots,
    handWidth,
    oppTileW,
    discardTileW,
    discardColumns,
    discardRows,
    meldTileW,
    tableTopHeight,
    spareWidth,
    fits: tileW >= MIN_TILE_W && tableTopHeight >= MIN_TABLE_TOP_H,
    orientation,
  };
}

/** The CSS custom properties the table reads. Set once per resize. */
export function geometryVariables(geometry: TableGeometry): Record<string, string> {
  return {
    "--tile-w": `${String(geometry.tileW)}px`,
    "--tile-h": `${String(geometry.tileH)}px`,
    "--tile-gap": `${String(geometry.tileGap)}px`,
    "--opp-tile-w": `${String(geometry.oppTileW)}px`,
    "--discard-tile-w": `${String(geometry.discardTileW)}px`,
    "--meld-tile-w": `${String(geometry.meldTileW)}px`,
    "--table-top-h": `${String(geometry.tableTopHeight)}px`,
    "--hand-w": `${String(geometry.handWidth)}px`,
    "--discard-rows": String(geometry.discardRows),
    "--claim-band-h": `${String(CLAIM_BAND_H)}px`,
  };
}
