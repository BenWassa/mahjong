import type {
  BonusIndex,
  BonusTileKind,
  OrdinaryTileKind,
  Rank,
  Suit,
  SuitedTileKind,
  Tile,
  TileId,
  TileKind,
  TileSetSize,
  Wind,
} from "./types.js";

/**
 * Canonical kind order for the 34 ordinary tile kinds.
 *
 * This order is also the physical-ID order used by {@link createTileSet} and is
 * deliberately written out so a refactor cannot silently change a recorded wall.
 */
export const ORDINARY_TILE_KINDS = [
  "characters-1",
  "characters-2",
  "characters-3",
  "characters-4",
  "characters-5",
  "characters-6",
  "characters-7",
  "characters-8",
  "characters-9",
  "bamboo-1",
  "bamboo-2",
  "bamboo-3",
  "bamboo-4",
  "bamboo-5",
  "bamboo-6",
  "bamboo-7",
  "bamboo-8",
  "bamboo-9",
  "dots-1",
  "dots-2",
  "dots-3",
  "dots-4",
  "dots-5",
  "dots-6",
  "dots-7",
  "dots-8",
  "dots-9",
  "wind-east",
  "wind-south",
  "wind-west",
  "wind-north",
  "dragon-red",
  "dragon-green",
  "dragon-white",
] as const satisfies readonly OrdinaryTileKind[];

/** Canonical kind order for the eight unique bonus tiles. */
export const BONUS_TILE_KINDS = [
  "flower-1",
  "flower-2",
  "flower-3",
  "flower-4",
  "season-1",
  "season-2",
  "season-3",
  "season-4",
] as const satisfies readonly BonusTileKind[];

const ALL_TILE_KINDS: readonly TileKind[] = [
  ...ORDINARY_TILE_KINDS,
  ...BONUS_TILE_KINDS,
];

const TILE_KIND_ORDER = new Map<TileKind, number>(
  ALL_TILE_KINDS.map((kind, index) => [kind, index]),
);

const BONUS_KINDS = new Set<BonusTileKind>(BONUS_TILE_KINDS);

const SUITED_PREFIXES: Readonly<Record<Suit, `${Suit}-`>> = {
  characters: "characters-",
  bamboo: "bamboo-",
  dots: "dots-",
};

const BONUS_INDEX_BY_WIND: Readonly<Record<Wind, BonusIndex>> = {
  east: 1,
  south: 2,
  west: 3,
  north: 4,
};

export interface ParsedSuitedKind {
  readonly suit: Suit;
  readonly rank: Rank;
}

/**
 * Creates the canonical physical tile inventory.
 *
 * Ordinary kinds have four physical copies, numbered 1 through 4. Bonus kinds
 * have one physical copy, numbered 1. The ordinary 136-tile prefix is identical
 * in both supported profiles so enabling bonuses cannot renumber another tile.
 */
export function createTileSet(size: TileSetSize): Tile[] {
  const tiles: Tile[] = [];

  for (const kind of ORDINARY_TILE_KINDS) {
    for (let copy = 1; copy <= 4; copy += 1) {
      tiles.push({ id: createTileId(kind, copy), kind });
    }
  }

  if (size === 144) {
    for (const kind of BONUS_TILE_KINDS) {
      tiles.push({ id: `${kind}-1`, kind });
    }
  }

  return tiles;
}

export function isBonusKind(kind: TileKind): kind is BonusTileKind {
  return BONUS_KINDS.has(kind as BonusTileKind);
}

export function isBonusTile(tile: Tile): tile is Tile & { kind: BonusTileKind } {
  return isBonusKind(tile.kind);
}

export function isSuitedKind(kind: TileKind): kind is SuitedTileKind {
  return (
    kind.startsWith(SUITED_PREFIXES.characters) ||
    kind.startsWith(SUITED_PREFIXES.bamboo) ||
    kind.startsWith(SUITED_PREFIXES.dots)
  );
}

export function parseSuitedKind(kind: SuitedTileKind): ParsedSuitedKind;
export function parseSuitedKind(kind: TileKind): ParsedSuitedKind | null;
export function parseSuitedKind(kind: TileKind): ParsedSuitedKind | null {
  if (!isSuitedKind(kind)) {
    return null;
  }

  const separator = kind.lastIndexOf("-");
  const suit = kind.slice(0, separator) as Suit;
  const rank = Number(kind.slice(separator + 1)) as Rank;
  return { suit, rank };
}

/** Sort comparator matching the canonical kind order above. */
export function compareTileKinds(left: TileKind, right: TileKind): number {
  return getKindOrder(left) - getKindOrder(right);
}

/** Whether a flower or season belongs to the supplied current seat wind. */
export function seatOwnsBonus(seatWind: Wind, kind: TileKind): boolean {
  if (!isBonusKind(kind)) {
    return false;
  }

  return Number(kind.slice(kind.lastIndexOf("-") + 1)) === BONUS_INDEX_BY_WIND[seatWind];
}

function getKindOrder(kind: TileKind): number {
  const order = TILE_KIND_ORDER.get(kind);
  if (order === undefined) {
    throw new RangeError(`Unknown tile kind: ${kind}`);
  }
  return order;
}

function createTileId(kind: TileKind, copy: number): TileId {
  return `${kind}-${String(copy)}` as TileId;
}
