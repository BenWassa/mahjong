/**
 * Melds and the set-decomposition of a hand.
 *
 * Contract: docs/HKOS_RULES.md §4.5 (kong kinds), §6.1–6.2 (structures and
 * ambiguity).
 */

import {
  KIND_COUNT,
  SUITED_KIND_COUNT,
  THIRTEEN_ORPHAN_KINDS,
  canStartRun,
  isTerminalOrHonour,
  type Seat,
  type TileId,
  type TileKind,
} from './tiles.js';

export type MeldKind = 'chow' | 'pung' | 'kong-exposed' | 'kong-concealed' | 'kong-added';

export interface Meld {
  kind: MeldKind;
  /** Physical tiles, ascending. A kong holds four. */
  tiles: TileId[];
  /** Lowest TileKind in the meld. For a chow this is the start of the run. */
  low: TileKind;
  /** Seat the claimed tile came from, or null for a concealed kong. */
  claimedFrom: Seat | null;
  /** The claimed/promoted tile, or null for a concealed kong. */
  claimedTile: TileId | null;
}

export function isKong(meld: Meld): boolean {
  return meld.kind === 'kong-exposed' || meld.kind === 'kong-concealed' || meld.kind === 'kong-added';
}

/** A meld is exposed if the other seats can see its tiles. §5.C2 */
export function isExposed(meld: Meld): boolean {
  return meld.kind !== 'kong-concealed';
}

/** Pung, kong and concealed kong all score as a triplet of `low`. */
export function isTripletLike(meld: Meld): boolean {
  return meld.kind !== 'chow';
}

/**
 * One reading of a hand as sets and a pair. Both the melded and the concealed
 * parts appear here, so scoring never has to join two lists.
 */
export interface Decomposition {
  /** Four sets, each identified by its lowest kind. */
  sets: DecomposedSet[];
  pair: TileKind;
}

export interface DecomposedSet {
  type: 'chow' | 'pung';
  low: TileKind;
  /** True when the set came from an exposed meld. Drives 門前清 and 平糊 display. */
  fromMeld: boolean;
  /** True when the set is a kong of any kind. */
  kong: boolean;
  /** True when the set is a concealed kong. */
  concealedKong: boolean;
}

const MAX_DECOMPOSITIONS = 64;

/**
 * Every distinct way to read `counts` as `setsNeeded` sets plus one pair.
 *
 * Bounded by MAX_DECOMPOSITIONS: a legal 14-tile hand has at most a handful of
 * readings, and the bound keeps a malformed count array from running away.
 */
export function decomposeConcealed(counts: Int8Array, setsNeeded: number): Decomposition[] {
  const results: Decomposition[] = [];
  const work = Int8Array.from(counts);
  const seen = new Set<string>();

  for (let pair = 0; pair < SUITED_KIND_COUNT; pair++) {
    if (work[pair]! < 2) continue;
    work[pair]! -= 2;
    const sets: DecomposedSet[] = [];
    collectSets(work, 0, setsNeeded, sets, (found) => {
      const key = `${pair}|${found.map((s) => `${s.type}${s.low}`).join(',')}`;
      if (seen.has(key)) return;
      seen.add(key);
      results.push({ pair, sets: found.map((s) => ({ ...s })) });
    });
    work[pair]! += 2;
    if (results.length >= MAX_DECOMPOSITIONS) break;
  }
  return results;
}

/**
 * Depth-first set extraction. `from` only ever increases, so each combination
 * of sets is produced once in ascending order.
 */
function collectSets(
  counts: Int8Array,
  from: TileKind,
  remaining: number,
  acc: DecomposedSet[],
  emit: (sets: DecomposedSet[]) => void,
): void {
  if (remaining === 0) {
    for (let k = from; k < SUITED_KIND_COUNT; k++) {
      if (counts[k]! > 0) return; // leftover tiles: not a valid reading
    }
    emit(acc);
    return;
  }

  let start = from;
  while (start < SUITED_KIND_COUNT && counts[start] === 0) start++;
  if (start >= SUITED_KIND_COUNT) return;

  // The lowest remaining tile must be consumed by the next set, otherwise it
  // can never be consumed at all. That makes the search exhaustive but small.
  if (counts[start]! >= 3) {
    counts[start]! -= 3;
    acc.push({ type: 'pung', low: start, fromMeld: false, kong: false, concealedKong: false });
    collectSets(counts, start, remaining - 1, acc, emit);
    acc.pop();
    counts[start]! += 3;
  }

  if (canStartRun(start) && counts[start + 1]! > 0 && counts[start + 2]! > 0) {
    counts[start]!--;
    counts[start + 1]!--;
    counts[start + 2]!--;
    acc.push({ type: 'chow', low: start, fromMeld: false, kong: false, concealedKong: false });
    collectSets(counts, start, remaining - 1, acc, emit);
    acc.pop();
    counts[start]!++;
    counts[start + 1]!++;
    counts[start + 2]!++;
  }
}

/** Turn declared melds into decomposition sets. */
export function meldsToSets(melds: readonly Meld[]): DecomposedSet[] {
  return melds.map((m) => ({
    type: m.kind === 'chow' ? ('chow' as const) : ('pung' as const),
    low: m.low,
    fromMeld: true,
    kong: isKong(m),
    concealedKong: m.kind === 'kong-concealed',
  }));
}

/**
 * All readings of a complete hand: the concealed tiles plus the declared melds.
 *
 * `concealedCounts` must exclude tiles already inside melds.
 */
export function decomposeHand(concealedCounts: Int8Array, melds: readonly Meld[]): Decomposition[] {
  const meldSets = meldsToSets(melds);
  const setsNeeded = 4 - melds.length;
  if (setsNeeded < 0) return [];
  return decomposeConcealed(concealedCounts, setsNeeded).map((d) => ({
    pair: d.pair,
    sets: [...meldSets, ...d.sets],
  }));
}

/** §6.1 structure 2. Requires a fully concealed hand with no melds. */
export function isThirteenOrphans(concealedCounts: Int8Array, melds: readonly Meld[]): boolean {
  if (melds.length > 0) return false;
  let total = 0;
  let pairs = 0;
  for (let k = 0; k < KIND_COUNT; k++) {
    const c = concealedCounts[k]!;
    if (c === 0) continue;
    if (!isTerminalOrHonour(k)) return false;
    total += c;
    if (c === 2) pairs++;
    else if (c !== 1) return false;
  }
  if (total !== 14 || pairs !== 1) return false;
  for (const k of THIRTEEN_ORPHAN_KINDS) {
    if (concealedCounts[k]! < 1) return false;
  }
  return true;
}

/** Does adding one tile of `kind` complete Thirteen Orphans? */
export function completesThirteenOrphans(
  concealedCounts: Int8Array,
  melds: readonly Meld[],
  kind: TileKind,
): boolean {
  if (melds.length > 0 || !isTerminalOrHonour(kind)) return false;
  const trial = Int8Array.from(concealedCounts);
  trial[kind]!++;
  return isThirteenOrphans(trial, melds);
}

/**
 * Is this a complete hand at all? Cheap structural test used by legality
 * checks before the (more expensive) scorer runs.
 */
export function isCompleteHand(concealedCounts: Int8Array, melds: readonly Meld[]): boolean {
  if (isThirteenOrphans(concealedCounts, melds)) return true;
  return decomposeHand(concealedCounts, melds).length > 0;
}

/** The three possible chow shapes that a claimed tile of `kind` can complete. */
export function chowShapesFor(kind: TileKind): Array<[TileKind, TileKind, TileKind]> {
  const shapes: Array<[TileKind, TileKind, TileKind]> = [];
  for (let low = kind - 2; low <= kind; low++) {
    if (low < 0 || !canStartRun(low)) continue;
    if (kind > low + 2) continue;
    shapes.push([low, low + 1, low + 2]);
  }
  return shapes;
}
