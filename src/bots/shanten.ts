import type { OrdinaryTileKind, Tile } from "../engine/types.js";

const KINDS: readonly OrdinaryTileKind[] = [
  ...(["characters", "bamboo", "dots"] as const).flatMap((suit) =>
    Array.from({ length: 9 }, (_, index) => `${suit}-${String(index + 1)}` as OrdinaryTileKind),
  ),
  "wind-east", "wind-south", "wind-west", "wind-north",
  "dragon-red", "dragon-green", "dragon-white",
];

const INDEX = new Map(KINDS.map((kind, index) => [kind, index]));
const ORPHANS = new Set([0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]);

export function handShanten(tiles: readonly Tile[], fixedMelds = 0): number {
  const counts = Array<number>(34).fill(0);
  for (const tile of tiles) {
    const index = INDEX.get(tile.kind as OrdinaryTileKind);
    if (index !== undefined) counts[index] = (counts[index] ?? 0) + 1;
  }
  return Math.min(standardShanten(counts, fixedMelds), orphansShanten(counts, fixedMelds));
}

function orphansShanten(counts: readonly number[], fixedMelds: number): number {
  if (fixedMelds > 0) return 13;
  let distinct = 0;
  let pair = false;
  for (const index of ORPHANS) {
    const count = counts[index] ?? 0;
    if (count > 0) distinct += 1;
    if (count > 1) pair = true;
  }
  return 13 - distinct - (pair ? 1 : 0);
}

function standardShanten(source: readonly number[], fixedMelds: number): number {
  const counts = [...source];
  let best = 8;

  const search = (start: number, melds: number, pairs: number, taatsu: number): void => {
    let index = start;
    while (index < 34 && (counts[index] ?? 0) === 0) index += 1;
    if (index >= 34) {
      const totalMelds = fixedMelds + melds;
      const usableTaatsu = Math.min(taatsu, Math.max(0, 4 - totalMelds));
      best = Math.min(best, 8 - totalMelds * 2 - usableTaatsu - Math.min(1, pairs));
      return;
    }

    const count = counts[index] ?? 0;
    if (count >= 3) {
      counts[index] = count - 3;
      search(index, melds + 1, pairs, taatsu);
      counts[index] = count;
    }
    if (index < 27 && index % 9 <= 6 && (counts[index + 1] ?? 0) > 0 && (counts[index + 2] ?? 0) > 0) {
      counts[index] = count - 1;
      counts[index + 1] = (counts[index + 1] ?? 0) - 1;
      counts[index + 2] = (counts[index + 2] ?? 0) - 1;
      search(index, melds + 1, pairs, taatsu);
      counts[index] = count;
      counts[index + 1] = (counts[index + 1] ?? 0) + 1;
      counts[index + 2] = (counts[index + 2] ?? 0) + 1;
    }
    if (count >= 2) {
      counts[index] = count - 2;
      search(index, melds, pairs + 1, taatsu);
      search(index, melds, pairs, taatsu + 1);
      counts[index] = count;
    }
    if (index < 27 && index % 9 <= 7 && (counts[index + 1] ?? 0) > 0) {
      counts[index] = count - 1;
      counts[index + 1] = (counts[index + 1] ?? 0) - 1;
      search(index, melds, pairs, taatsu + 1);
      counts[index] = count;
      counts[index + 1] = (counts[index + 1] ?? 0) + 1;
    }
    if (index < 27 && index % 9 <= 6 && (counts[index + 2] ?? 0) > 0) {
      counts[index] = count - 1;
      counts[index + 2] = (counts[index + 2] ?? 0) - 1;
      search(index, melds, pairs, taatsu + 1);
      counts[index] = count;
      counts[index + 2] = (counts[index + 2] ?? 0) + 1;
    }
    counts[index] = count - 1;
    search(index, melds, pairs, taatsu);
    counts[index] = count;
  };

  search(0, 0, 0, 0);
  return best;
}
