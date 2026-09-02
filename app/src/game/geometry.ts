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
 *   5. A viewport that cannot pay for everything drops whole bands of
 *      information rather than shrinking every band together. See the
 *      priority policy below.
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

/**
 * How much of the table's optional information the viewport is paying for.
 *
 * A label for the whole policy below, so a device can be described in one
 * word — in the layout HUD, in a QA report, or out loud on a phone call —
 * rather than by reciting which flags happen to be false.
 */
export type LayoutTier = "full" | "compact" | "tight";

/**
 * The responsive priority policy.
 *
 * Protected, in order: the player's hand, the current actions and claims, the
 * discard well, exposed melds, opponent metadata, explanatory chrome. When a
 * viewport cannot seat all of it, the layout collapses whole bands from the
 * bottom of that order upwards instead of scaling everything down together —
 * a table where every element is 15% smaller is a table where nothing is
 * readable, which is the failure this policy exists to prevent.
 *
 * Each flag is decided against the axis it actually costs. Chrome is a strip
 * across the felt and is paid for in height; the seat rails stand beside the
 * discard well and are paid for in width. Deciding both off one blended
 * number would drop a rail on a tall phone that had width to spare.
 */
export interface LayoutPolicy {
  readonly tier: LayoutTier;
  /**
   * Explanatory chrome: the Explain banner (#9), which is pinned over the felt
   * rather than laid out in it.
   *
   * The assist hint deliberately is not in here. It lives in the claim band's
   * unconditionally reserved space, so suppressing it buys no pixels and only
   * takes an aid away from the player who switched it on.
   */
  readonly showChrome: boolean;
  /** Opponent metadata: the score readout and the bonus-tile count. */
  readonly showSeatMeta: boolean;
  /** Opponent exposed melds drawn as tiles rather than counted. */
  readonly showSeatMelds: boolean;
}

/** A minimum the layout promises and this viewport could not pay. */
export interface LayoutBreach {
  readonly id: "hand-tile" | "hand-width" | "table-top" | "discard-well";
  readonly need: number;
  readonly got: number;
}

export interface TableGeometry {
  /**
   * The viewport this was computed from, echoed back.
   *
   * The layout HUD reports it rather than re-reading the window, because the
   * bug class the HUD exists to catch is precisely a disagreement between what
   * the phone has and what the app was given — an inset the probe never saw, a
   * visual viewport that moved under a keyboard. Echoing the input is the only
   * way to show the value the layout actually used.
   */
  readonly viewport: Viewport;
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
  /** Tile width inside Learn to Play's Peek overlay, which is a reading surface. */
  readonly peekTileW: number;
  readonly tableTopHeight: number;
  readonly spareWidth: number;
  /** Viewport less its safe-area insets: what the app actually gets to draw in. */
  readonly usableWidth: number;
  readonly usableHeight: number;
  /** Width and height left over once the protected band is paid for. */
  readonly widthSlack: number;
  readonly heightSlack: number;
  readonly policy: LayoutPolicy;
  /** Empty on a viewport the layout can honour. Surfaced by the layout HUD. */
  readonly breaches: readonly LayoutBreach[];
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
/** The tightest gap the loop below will settle for, and the last step in it. */
const MIN_GAP = 2;

/** Width the viewer's own exposed meld tiles are reserved and drawn at. */
const OWN_MELD_TILE_W = 22;

/**
 * Floors for the tiles the player reads but never taps.
 *
 * These are what stops the uniform shrink. They used to be derived from the
 * hand tile with only a nominal floor, so a narrow phone that squeezed the
 * hand squeezed the pile and the melds by the same fraction and the whole
 * table went illegible at once. Now the derived size is a ceiling: when the
 * hand tightens, the discard well shows *fewer* discards at a size still worth
 * reading rather than the same number at a size that is not.
 */
export const MIN_DISCARD_TILE_W = 22;
const MIN_MELD_TILE_W = 16;
const MIN_OPP_TILE_W = 14;

/**
 * The Peek overlay's tiles (Learn to Play).
 *
 * Peek owns the whole viewport while it is up, so its tiles are sized for
 * reading rather than for fitting beside anything. Fourteen slots, not
 * thirteen: the seat that is to play has already drawn, and sizing for the
 * thirteen a seat holds at rest wrapped that one hand onto a second row, which
 * reads as a rendering fault rather than as a hand. Past the cap the row wraps
 * anyway, which is free here because nothing on this surface is tapped.
 */
const PEEK_SLOTS = 14;
const PEEK_MAX_TILE_W = 46;
/** Overlay padding, panel padding and the seat's own label column. */
const PEEK_CHROME_W = 96;

/**
 * The protected band, at its floor: fourteen readable tiles, the claim band,
 * the status strip and a table top that can still show a row of discards.
 * Slack is what is left for everything ranked below them.
 */
const PROTECTED_W = 14 * MIN_TILE_W + 13 * MIN_GAP + EDGE_PAD * 2;
const PROTECTED_H =
  STATUS_H +
  CLAIM_BAND_H +
  Math.round(MIN_TILE_W * TILE_ASPECT) +
  MIN_TABLE_TOP_H +
  ROW_GAP * 2 +
  EDGE_PAD;

/**
 * Where each band stops earning its space, in reverse priority order.
 *
 * Calibrated against the verified matrix (DESIGN.md §4): the 320px-tall class
 * loses its chrome, the 568px-wide class loses its opponent metadata, and
 * nothing narrower than the supported floor keeps drawn opponent melds.
 */
const CHROME_HEIGHT_SLACK = 112;
const SEAT_META_WIDTH_SLACK = 96;
const SEAT_MELD_WIDTH_SLACK = 24;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** The priority policy, decided before anything is sized against it. */
export function layoutPolicy(widthSlack: number, heightSlack: number): LayoutPolicy {
  const showChrome = heightSlack >= CHROME_HEIGHT_SLACK;
  const showSeatMeta = widthSlack >= SEAT_META_WIDTH_SLACK;
  const showSeatMelds = widthSlack >= SEAT_MELD_WIDTH_SLACK;
  const collapsed =
    (showChrome ? 0 : 1) + (showSeatMeta ? 0 : 1) + (showSeatMelds ? 0 : 1);
  return {
    tier: collapsed === 0 ? "full" : collapsed === 1 ? "compact" : "tight",
    showChrome,
    showSeatMeta,
    showSeatMelds,
  };
}

export function computeGeometry({ viewport, meldCount }: GeometryInput): TableGeometry {
  const orientation = viewport.width >= viewport.height ? "landscape" : "portrait";

  const usableWidth = viewport.width - viewport.safeLeft - viewport.safeRight;
  const usableHeight = viewport.height - viewport.safeTop - viewport.safeBottom;
  const availableW = usableWidth - EDGE_PAD * 2;

  const widthSlack = usableWidth - PROTECTED_W;
  const heightSlack = usableHeight - PROTECTED_H;
  const policy = layoutPolicy(widthSlack, heightSlack);

  // Sized for the widest the hand gets this turn cycle. Fourteen tiles less
  // three per exposed meld: the count only falls when a meld is formed, which
  // is a real state change the player just caused, not a resize under a thumb.
  const handSlots = Math.max(1, 14 - meldCount * 3);
  // The viewer's own exposed melds share the hand row rather than taking a row
  // of their own, because vertical room is what the claim band already spends.
  // Reserved at the kong width so a kong cannot overflow the row it lives in.
  const meldStripW = meldCount * (4 * OWN_MELD_TILE_W + ROW_GAP);

  const availableH =
    usableHeight - STATUS_H - CLAIM_BAND_H - ROW_GAP * 2 - EDGE_PAD;

  const heightForHand = availableH - MIN_TABLE_TOP_H;
  const heightLimit = Math.floor(heightForHand / TILE_ASPECT);

  // Try the generous gap first and tighten only if that is what buys
  // readability. Losing 2px of gap is cheaper than losing 2px of face.
  let tileGap = MIN_GAP;
  let widthLimit = HARD_FLOOR_W;
  for (const gap of GAP_STEPS) {
    const usable = availableW - meldStripW - (handSlots - 1) * gap;
    const candidate = Math.floor(usable / handSlots);
    if (candidate >= MIN_TILE_W || gap === MIN_GAP) {
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
  // reads as one set of objects at different distances, not three tile sizes —
  // but the derivation is a ceiling, not a scale. Each has its own floor, and
  // below it the layout shows less rather than smaller.
  const oppTileW = clamp(Math.round(tileW * 0.38), MIN_OPP_TILE_W, 24);
  const discardTileW = clamp(Math.round(tileW * 0.54), MIN_DISCARD_TILE_W, 34);
  const meldTileW = clamp(Math.round(tileW * 0.46), MIN_MELD_TILE_W, OWN_MELD_TILE_W);

  // Spare width is spent here: a wider viewport shows more discard history
  // rather than a stretched hand. A seat rail that has given up its drawn
  // melds hands the width it was holding to the well, which is the next thing
  // up the priority order.
  const seatRailW = policy.showSeatMelds ? oppTileW * 3 + EDGE_PAD * 3 : EDGE_PAD * 2 + 48;
  const discardWellW = Math.max(120, availableW - 2 * seatRailW);
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

  const peekTileW = clamp(
    Math.floor((usableWidth - PEEK_CHROME_W) / PEEK_SLOTS),
    MIN_TILE_W,
    PEEK_MAX_TILE_W,
  );

  const breaches: LayoutBreach[] = [];
  if (tileW < MIN_TILE_W) {
    breaches.push({ id: "hand-tile", need: MIN_TILE_W, got: tileW });
  }
  if (handWidth + meldStripW > availableW) {
    breaches.push({ id: "hand-width", need: handWidth + meldStripW, got: availableW });
  }
  if (availableH - tileH < MIN_TABLE_TOP_H) {
    breaches.push({ id: "table-top", need: MIN_TABLE_TOP_H, got: availableH - tileH });
  }
  // The pile's own floor is six columns, and the discard tile has stopped
  // scaling down with the hand — so on a viewport narrow enough, six readable
  // columns no longer fit the width the well was given. That is the point at
  // which the well itself is being spent, which the priority order says should
  // not happen while anything below it is still on screen.
  const minPileW = 6 * (discardTileW + 2);
  if (minPileW > discardWellW) {
    breaches.push({ id: "discard-well", need: minPileW, got: discardWellW });
  }

  return {
    viewport,
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
    peekTileW,
    tableTopHeight,
    spareWidth,
    usableWidth,
    usableHeight,
    widthSlack,
    heightSlack,
    policy,
    breaches,
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
    "--peek-tile-w": `${String(geometry.peekTileW)}px`,
    "--table-top-h": `${String(geometry.tableTopHeight)}px`,
    "--hand-w": `${String(geometry.handWidth)}px`,
    "--discard-rows": String(geometry.discardRows),
    "--claim-band-h": `${String(CLAIM_BAND_H)}px`,
  };
}
