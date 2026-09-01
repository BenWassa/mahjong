import type { InteractionModel } from "./interaction.ts";

/**
 * Every knob the device gate needs to vary. These are measurement controls, not
 * product settings: none of them survives into #8 as-is.
 */

/** Hand sizing. `fit` derives the tile width from the space available. */
export type TileSizeMode = "fit" | "s" | "m" | "l";

/** Corner learning labels, the optional legibility treatment from the issue. */
export type LabelMode = "off" | "rank" | "rank-suit";

/** Where the contextual claim controls live relative to the hand. */
export type ControlPlacement = "rail" | "band";

export interface PrototypeSettings {
  readonly tileSize: TileSizeMode;
  readonly tileGap: number;
  readonly labels: LabelMode;
  readonly placement: ControlPlacement;
  readonly model: InteractionModel;
  /** Outlines the tiles the pending claim depends on, to prove no control covers them. */
  readonly showDecisionTiles: boolean;
}

export const DEFAULT_SETTINGS: PrototypeSettings = {
  tileSize: "fit",
  tileGap: 3,
  labels: "off",
  placement: "rail",
  model: "tap-tap",
  showDecisionTiles: false,
};

/** Fixed widths in CSS px for the non-`fit` modes. */
export const FIXED_TILE_WIDTH: Readonly<Record<Exclude<TileSizeMode, "fit">, number>> = {
  s: 42,
  m: 52,
  l: 62,
};

export const TILE_ASPECT = 4 / 3;

/** Widest hand the layout must survive: 14 concealed tiles, no melds. */
export const MAX_HAND_TILES = 14;

export interface HandMetrics {
  readonly tileWidth: number;
  readonly tileHeight: number;
  /** True when the chosen fixed size cannot show the whole hand at once. */
  readonly overflows: boolean;
  /** Rough physical width, using the 96 CSS px per inch reference. Approximate. */
  readonly approxMillimetres: number;
}

/**
 * Sizes hand tiles for the space available. The drawn tile is rendered detached,
 * so its extra gap is charged to the layout budget here rather than discovered
 * at paint time. `fit` is additionally capped by the caller's height budget;
 * the fixed sizes are not, because a fixed size that no longer fits is a result
 * the device gate wants to see reported rather than silently corrected.
 */
export function measureHand(
  availableWidth: number,
  tileCount: number,
  settings: PrototypeSettings,
  hasDrawnTile: boolean,
  /** Widest a tile may be before its 3:4 face runs out of vertical room. */
  heightCap: number = Number.POSITIVE_INFINITY,
): HandMetrics {
  const count = Math.max(1, tileCount);
  const gaps = settings.tileGap * (count - 1) + (hasDrawnTile ? settings.tileGap * 4 : 0);
  const budget = Math.max(0, availableWidth - gaps);
  const fitted = Math.floor(budget / count);

  const width =
    settings.tileSize === "fit"
      ? Math.max(18, Math.min(96, fitted, heightCap))
      : FIXED_TILE_WIDTH[settings.tileSize];

  return {
    tileWidth: width,
    tileHeight: Math.round(width * TILE_ASPECT),
    overflows: width * count + gaps > availableWidth + 0.5,
    approxMillimetres: Math.round((width * 25.4 * 10) / 96) / 10,
  };
}
