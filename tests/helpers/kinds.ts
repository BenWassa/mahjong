/** Readable TileKind constants for fixtures. */
export const m = (n: number): number => n - 1; // characters 1–9  -> 0–8
export const s = (n: number): number => 8 + n; // bamboo     1–9  -> 9–17
export const p = (n: number): number => 17 + n; // dots      1–9  -> 18–26

export const EAST = 27;
export const SOUTH = 28;
export const WEST = 29;
export const NORTH = 30;
export const RED = 31;
export const GREEN = 32;
export const WHITE = 33;

export const PLUM = 34;
export const ORCHID = 35;
export const CHRYS = 36;
export const BAMBOO_F = 37;
export const SPRING = 38;
export const SUMMER = 39;
export const AUTUMN = 40;
export const WINTER = 41;

/** `run(m, 3)` -> [3m, 4m, 5m] */
export function run(suit: (n: number) => number, from: number): number[] {
  return [suit(from), suit(from + 1), suit(from + 2)];
}

/** `trip(RED)` -> [RED, RED, RED] */
export function trip(kind: number): number[] {
  return [kind, kind, kind];
}

export function pair(kind: number): number[] {
  return [kind, kind];
}
