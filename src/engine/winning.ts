import {
  ORDINARY_TILE_KINDS,
  isBonusKind,
  isSuitedKind,
  parseSuitedKind,
} from "./tiles.js";
import type {
  ConcealedSet,
  Meld,
  OrdinaryTileKind,
  PungSet,
  StandardWinningStructure,
  Tile,
  WinningStructure,
} from "./types.js";

const ORPHAN_KINDS: readonly OrdinaryTileKind[] = [
  "characters-1",
  "characters-9",
  "bamboo-1",
  "bamboo-9",
  "dots-1",
  "dots-9",
  "wind-east",
  "wind-south",
  "wind-west",
  "wind-north",
  "dragon-red",
  "dragon-green",
  "dragon-white",
];

type Counts = Map<OrdinaryTileKind, number>;

function asOrdinary(tile: Tile): OrdinaryTileKind | null {
  return isBonusKind(tile.kind) ? null : tile.kind;
}

function makeCounts(tiles: readonly Tile[]): Counts | null {
  const counts: Counts = new Map();
  for (const tile of tiles) {
    const kind = asOrdinary(tile);
    if (kind === null) {
      return null;
    }
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return counts;
}

function decrement(counts: Counts, kind: OrdinaryTileKind, amount: number): void {
  counts.set(kind, (counts.get(kind) ?? 0) - amount);
}

function increment(counts: Counts, kind: OrdinaryTileKind, amount: number): void {
  counts.set(kind, (counts.get(kind) ?? 0) + amount);
}

function firstRemainingKind(counts: Counts): OrdinaryTileKind | null {
  for (const kind of ORDINARY_TILE_KINDS) {
    if ((counts.get(kind) ?? 0) > 0) {
      return kind;
    }
  }
  return null;
}

function enumerateSets(
  counts: Counts,
  setsNeeded: number,
  prefix: readonly ConcealedSet[],
  output: ConcealedSet[][],
): void {
  if (setsNeeded === 0) {
    if (firstRemainingKind(counts) === null) {
      output.push([...prefix]);
    }
    return;
  }

  const first = firstRemainingKind(counts);
  if (first === null) {
    return;
  }

  if ((counts.get(first) ?? 0) >= 3) {
    decrement(counts, first, 3);
    const pung: PungSet = { type: "pung", tile: first };
    enumerateSets(counts, setsNeeded - 1, [...prefix, pung], output);
    increment(counts, first, 3);
  }

  if (!isSuitedKind(first)) {
    return;
  }

  const { suit, rank } = parseSuitedKind(first);
  if (rank > 7) {
    return;
  }

  const second = `${suit}-${String(rank + 1)}` as OrdinaryTileKind;
  const third = `${suit}-${String(rank + 2)}` as OrdinaryTileKind;
  if ((counts.get(second) ?? 0) === 0 || (counts.get(third) ?? 0) === 0) {
    return;
  }

  decrement(counts, first, 1);
  decrement(counts, second, 1);
  decrement(counts, third, 1);
  enumerateSets(
    counts,
    setsNeeded - 1,
    [
      ...prefix,
      {
        type: "chow",
        tiles: [first, second, third],
      },
    ],
    output,
  );
  increment(counts, first, 1);
  increment(counts, second, 1);
  increment(counts, third, 1);
}

function standardStructures(
  tiles: readonly Tile[],
  fixedMeldCount: number,
): readonly StandardWinningStructure[] {
  const expectedTileCount = 14 - fixedMeldCount * 3;
  if (fixedMeldCount < 0 || fixedMeldCount > 4 || tiles.length !== expectedTileCount) {
    return [];
  }

  const counts = makeCounts(tiles);
  if (counts === null) {
    return [];
  }

  const structures: StandardWinningStructure[] = [];
  for (const pair of ORDINARY_TILE_KINDS) {
    if ((counts.get(pair) ?? 0) < 2) {
      continue;
    }

    decrement(counts, pair, 2);
    const setOptions: ConcealedSet[][] = [];
    enumerateSets(counts, 4 - fixedMeldCount, [], setOptions);
    increment(counts, pair, 2);

    for (const sets of setOptions) {
      structures.push({ type: "standard", pair, sets });
    }
  }
  return structures;
}

function thirteenOrphans(tiles: readonly Tile[], melds: readonly Meld[]): WinningStructure | null {
  if (melds.length !== 0 || tiles.length !== 14) {
    return null;
  }
  const counts = makeCounts(tiles);
  if (counts === null || counts.size !== 13) {
    return null;
  }

  let pair: OrdinaryTileKind | null = null;
  for (const kind of ORPHAN_KINDS) {
    const count = counts.get(kind) ?? 0;
    if (count === 2 && pair === null) {
      pair = kind;
    } else if (count !== 1) {
      return null;
    }
  }
  if (pair === null) {
    return null;
  }
  return { type: "thirteen-orphans", pair };
}

/**
 * Enumerates structural wins only. Issue #4 supplies faan evaluation, chooses the
 * highest-scoring decomposition, and filters wins below the configured minimum.
 * Enumeration is stable: pairs use canonical tile order and each recursive step
 * tries a pung before a chow.
 */
export function enumerateWinningStructures(
  concealed: readonly Tile[],
  melds: readonly Meld[],
  addedTile: Tile | null = null,
): readonly WinningStructure[] {
  const tiles = addedTile === null ? concealed : [...concealed, addedTile];
  const structures: WinningStructure[] = [];
  const orphans = thirteenOrphans(tiles, melds);
  if (orphans !== null) {
    structures.push(orphans);
  }
  structures.push(...standardStructures(tiles, melds.length));
  return structures;
}

export function canStructurallyWin(
  concealed: readonly Tile[],
  melds: readonly Meld[],
  addedTile: Tile | null = null,
): boolean {
  return enumerateWinningStructures(concealed, melds, addedTile).length > 0;
}
