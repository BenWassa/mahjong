import type { Seat, TileKind, Wind } from "@engine";

/**
 * Every user-facing name for a tile, a seat or a wind lives here. Components
 * never build a label by string concatenation, because the accessible name and
 * the visible label must not be allowed to drift apart.
 */

const SUIT_NAME = {
  characters: "Characters",
  bamboo: "Bamboo",
  dots: "Dots",
} as const;

const RANK_WORD = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
] as const;

const WIND_NAME: Record<Wind, string> = {
  east: "East",
  south: "South",
  west: "West",
  north: "North",
};

const DRAGON_NAME = {
  red: "Red Dragon",
  green: "Green Dragon",
  white: "White Dragon",
} as const;

/** Traditional subjects of the four flowers and the four seasons. */
const FLOWER_NAME = ["", "Plum", "Orchid", "Chrysanthemum", "Bamboo"] as const;
const SEASON_NAME = ["", "Spring", "Summer", "Autumn", "Winter"] as const;

export function windName(wind: Wind): string {
  return WIND_NAME[wind];
}

/** Spoken name of a tile. Never abbreviated: a screen reader has no face to read. */
export function tileName(kind: TileKind): string {
  const suited = /^(characters|bamboo|dots)-([1-9])$/.exec(kind);
  if (suited) {
    const suit = suited[1] as keyof typeof SUIT_NAME;
    const rank = Number(suited[2]) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    return `${RANK_WORD[rank]} of ${SUIT_NAME[suit]}`;
  }
  const wind = /^wind-(east|south|west|north)$/.exec(kind);
  if (wind) {
    return `${WIND_NAME[wind[1] as Wind]} Wind`;
  }
  const dragon = /^dragon-(red|green|white)$/.exec(kind);
  if (dragon) {
    return DRAGON_NAME[dragon[1] as keyof typeof DRAGON_NAME];
  }
  const flower = /^flower-([1-4])$/.exec(kind);
  if (flower) {
    const index = Number(flower[1]) as 1 | 2 | 3 | 4;
    return `Flower ${String(index)}, ${FLOWER_NAME[index]}`;
  }
  const season = /^season-([1-4])$/.exec(kind);
  if (season) {
    const index = Number(season[1]) as 1 | 2 | 3 | 4;
    return `Season ${String(index)}, ${SEASON_NAME[index]}`;
  }
  return kind;
}

/**
 * Short visible label for the optional corner-label learning layer. Distinct
 * from tileName: this one has to fit in a 10px corner, so it abbreviates.
 */
export function tileShortLabel(kind: TileKind, mode: "rank" | "rank-suit"): string {
  const suited = /^(characters|bamboo|dots)-([1-9])$/.exec(kind);
  if (suited) {
    const rank = suited[2] ?? "";
    if (mode === "rank") return rank;
    const initial = { characters: "C", bamboo: "B", dots: "D" }[
      suited[1] as keyof typeof SUIT_NAME
    ];
    return `${rank}${initial}`;
  }
  const wind = /^wind-(east|south|west|north)$/.exec(kind);
  if (wind) return WIND_NAME[wind[1] as Wind].charAt(0);
  const dragon = /^dragon-(red|green|white)$/.exec(kind);
  if (dragon) return { red: "R", green: "G", white: "W" }[dragon[1] as "red" | "green" | "white"];
  const bonus = /^(flower|season)-([1-4])$/.exec(kind);
  if (bonus) return `${bonus[1] === "flower" ? "F" : "S"}${bonus[2] ?? ""}`;
  return "";
}

/** Where a seat sits relative to the viewer, who is always at the bottom. */
export type SeatPosition = "self" | "right" | "across" | "left";

const POSITIONS: readonly SeatPosition[] = ["self", "right", "across", "left"];

/**
 * Play passes to the next seat index, which in Hong Kong Old Style is the
 * player to the viewer's right. The rail order below follows from that and is
 * the reason Chow is only ever offered to the seat drawn on the left.
 */
export function seatPosition(seat: Seat, viewer: Seat): SeatPosition {
  return POSITIONS[(seat - viewer + 4) % 4] ?? "self";
}

export function seatPositionName(position: SeatPosition): string {
  return { self: "You", right: "Right", across: "Across", left: "Left" }[position];
}
