/**
 * Tile identity for Hong Kong Old Style.
 *
 * Contract: docs/HKOS_RULES.md §2.
 *
 * Two distinct notions:
 *
 *   TileKind  — what a tile *is* (1 Characters, Red Dragon, Spring). 42 kinds.
 *   TileId    — which *physical* tile it is. 144 ids, each unique for a whole game.
 *
 * Play never cares which copy of a tile you hold, but tile conservation does:
 * asserting that all 144 ids appear exactly once across the wall, hands, melds,
 * bonus areas and discards is a much stronger invariant than counting kinds.
 */

/** 0–33 are the four-copy kinds, 34–41 are the single-copy bonus tiles. */
export type TileKind = number;

/** 0–143. `kindOf` maps it to a TileKind. */
export type TileId = number;

export const KIND_COUNT = 42;
export const SUITED_KIND_COUNT = 34;
export const TILE_COUNT = 144;
export const TILE_COUNT_NO_BONUS = 136;

/** First id of the single-copy bonus tiles. */
export const FIRST_BONUS_ID = 136;

export const enum Suit {
  Characters = 0,
  Bamboo = 1,
  Dots = 2,
  Wind = 3,
  Dragon = 4,
  Flower = 5,
  Season = 6,
}

// Kind ranges.
export const CHARACTERS_1 = 0; // 0–8   萬 1–9
export const BAMBOO_1 = 9; // 9–17  索 1–9
export const DOTS_1 = 18; // 18–26 筒 1–9
export const WIND_EAST = 27; // 27–30 東南西北
export const DRAGON_RED = 31; // 31–33 中發白
export const FLOWER_PLUM = 34; // 34–37 梅蘭菊竹
export const SEASON_SPRING = 38; // 38–41 春夏秋冬

export const DRAGON_KINDS: readonly TileKind[] = [31, 32, 33];
export const WIND_KINDS: readonly TileKind[] = [27, 28, 29, 30];

/** Which physical tile is this id? */
export function kindOf(id: TileId): TileKind {
  return id < FIRST_BONUS_ID ? id >> 2 : SUITED_KIND_COUNT + (id - FIRST_BONUS_ID);
}

/** All ids for a kind, ascending. */
export function idsOfKind(kind: TileKind): TileId[] {
  if (kind < SUITED_KIND_COUNT) {
    const base = kind << 2;
    return [base, base + 1, base + 2, base + 3];
  }
  return [FIRST_BONUS_ID + (kind - SUITED_KIND_COUNT)];
}

export function suitOf(kind: TileKind): Suit {
  if (kind < BAMBOO_1) return Suit.Characters;
  if (kind < DOTS_1) return Suit.Bamboo;
  if (kind < WIND_EAST) return Suit.Dots;
  if (kind < DRAGON_RED) return Suit.Wind;
  if (kind < FLOWER_PLUM) return Suit.Dragon;
  if (kind < SEASON_SPRING) return Suit.Flower;
  return Suit.Season;
}

/** 1–9 for the three numbered suits, 0 for everything else. */
export function rankOf(kind: TileKind): number {
  if (kind < WIND_EAST) return (kind % 9) + 1;
  return 0;
}

export function isNumbered(kind: TileKind): boolean {
  return kind < WIND_EAST;
}

export function isHonour(kind: TileKind): boolean {
  return kind >= WIND_EAST && kind < FLOWER_PLUM;
}

export function isWind(kind: TileKind): boolean {
  return kind >= WIND_EAST && kind < DRAGON_RED;
}

export function isDragon(kind: TileKind): boolean {
  return kind >= DRAGON_RED && kind < FLOWER_PLUM;
}

/** Flowers and seasons. Never held in a hand, never melded. §2.1 */
export function isBonus(kind: TileKind): boolean {
  return kind >= FLOWER_PLUM;
}

export function isBonusId(id: TileId): boolean {
  return id >= FIRST_BONUS_ID;
}

/** 1 or 9 of a numbered suit. */
export function isTerminal(kind: TileKind): boolean {
  const r = rankOf(kind);
  return r === 1 || r === 9;
}

/** Terminal or honour — the 13 kinds that make up Thirteen Orphans. */
export function isTerminalOrHonour(kind: TileKind): boolean {
  return isHonour(kind) || isTerminal(kind);
}

export const THIRTEEN_ORPHAN_KINDS: readonly TileKind[] = [
  CHARACTERS_1,
  CHARACTERS_1 + 8,
  BAMBOO_1,
  BAMBOO_1 + 8,
  DOTS_1,
  DOTS_1 + 8,
  27,
  28,
  29,
  30,
  31,
  32,
  33,
];

/**
 * Can `kind` start a run? Requires a numbered suit with rank <= 7 and both
 * successors in the same suit.
 */
export function canStartRun(kind: TileKind): boolean {
  return isNumbered(kind) && rankOf(kind) <= 7;
}

/** Seat winds, in turn order. §2.2 */
export const WINDS = ['east', 'south', 'west', 'north'] as const;
export type Wind = (typeof WINDS)[number];

export type Seat = 0 | 1 | 2 | 3;
export const SEATS: readonly Seat[] = [0, 1, 2, 3];

export function windKind(wind: Wind): TileKind {
  return WIND_EAST + WINDS.indexOf(wind);
}

/** The flower and the season owned by a seat wind. §2.2 */
export function bonusKindsForWind(wind: Wind): { flower: TileKind; season: TileKind } {
  const i = WINDS.indexOf(wind);
  return { flower: FLOWER_PLUM + i, season: SEASON_SPRING + i };
}

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) & 3) as Seat;
}

/** How many seats forward from `from` to `to`, 1–3. Used for claim priority. §4.4 */
export function seatDistance(from: Seat, to: Seat): number {
  return (to - from + 4) & 3;
}

const SUIT_LABEL: Record<Suit, string> = {
  [Suit.Characters]: 'm',
  [Suit.Bamboo]: 's',
  [Suit.Dots]: 'p',
  [Suit.Wind]: 'z',
  [Suit.Dragon]: 'z',
  [Suit.Flower]: 'f',
  [Suit.Season]: 'f',
};

const HONOUR_LABEL = ['E', 'S', 'W', 'N', 'C', 'F', 'P'];
const BONUS_LABEL = ['plum', 'orchid', 'chrys', 'bamboo', 'spring', 'summer', 'autumn', 'winter'];

/** Compact debug notation: `3m`, `9p`, `Ez`, `Cz`, `spring`. Never shown to a player. */
export function kindLabel(kind: TileKind): string {
  if (isNumbered(kind)) return `${rankOf(kind)}${SUIT_LABEL[suitOf(kind)]}`;
  if (isHonour(kind)) return `${HONOUR_LABEL[kind - WIND_EAST]}z`;
  return BONUS_LABEL[kind - FLOWER_PLUM]!;
}

export function tileLabel(id: TileId): string {
  return kindLabel(kindOf(id));
}

export function handLabel(ids: readonly TileId[]): string {
  return ids.map(tileLabel).join(' ');
}

/** Sort ids by kind then id, so hands are stable and comparable. */
export function sortTiles(ids: TileId[]): TileId[] {
  return ids.sort((a, b) => kindOf(a) - kindOf(b) || a - b);
}

/** Count array indexed by TileKind. */
export function countsOf(ids: readonly TileId[]): Int8Array {
  const counts = new Int8Array(KIND_COUNT);
  for (const id of ids) counts[kindOf(id)]!++;
  return counts;
}
