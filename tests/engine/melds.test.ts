import { describe, expect, it } from 'vitest';
import {
  chowShapesFor,
  countsOf,
  decomposeConcealed,
  decomposeHand,
  idsOfKind,
  isCompleteHand,
  isThirteenOrphans,
  type Meld,
} from '../../src/engine/index.js';
import { EAST, GREEN, m, NORTH, p, pair, RED, run, s, SOUTH, trip, WEST, WHITE } from '../helpers/kinds.js';

/** Turn kinds into a count array the way the engine does. */
function counts(kinds: number[]): Int8Array {
  return countsOf(kinds.map((k) => idsOfKind(k)[0]!));
}

/** Distinct ids for repeated kinds, so a 14-tile hand is representable. */
function countsMulti(kinds: number[]): Int8Array {
  const used = new Map<number, number>();
  const ids = kinds.map((k) => {
    const n = used.get(k) ?? 0;
    used.set(k, n + 1);
    return idsOfKind(k)[n]!;
  });
  return countsOf(ids);
}

describe('hand decomposition', () => {
  it('reads a plain four-chow hand', () => {
    const hand = [...run(m, 1), ...run(m, 4), ...run(s, 2), ...run(p, 7), ...pair(EAST)];
    const readings = decomposeConcealed(countsMulti(hand), 4);
    expect(readings.length).toBeGreaterThan(0);
    const first = readings[0]!;
    expect(first.pair).toBe(EAST);
    expect(first.sets.every((set) => set.type === 'chow')).toBe(true);
  });

  it('RULE-WIN-4: an ambiguous hand produces both readings', () => {
    // 111 222 333 of one suit reads as three pungs or three identical chows.
    const hand = [
      ...trip(m(1)),
      ...trip(m(2)),
      ...trip(m(3)),
      ...run(s, 5),
      ...pair(WHITE),
    ];
    const readings = decomposeConcealed(countsMulti(hand), 4);
    const shapes = readings.map((r) =>
      r.sets
        .map((set) => `${set.type}${set.low}`)
        .sort()
        .join('|'),
    );
    const allPungs = shapes.some((sh) => sh.split('|').filter((x) => x.startsWith('pung')).length === 3);
    const allChows = shapes.some((sh) => sh.split('|').filter((x) => x.startsWith('chow')).length === 4);
    expect(allPungs).toBe(true);
    expect(allChows).toBe(true);
  });

  it('rejects a hand with a floating tile', () => {
    const hand = [...run(m, 1), ...run(m, 4), ...run(s, 2), ...run(p, 7), EAST, SOUTH];
    expect(decomposeConcealed(countsMulti(hand), 4)).toHaveLength(0);
  });

  it('counts exposed melds toward the four sets', () => {
    const melds: Meld[] = [
      { kind: 'pung', tiles: idsOfKind(RED).slice(0, 3), low: RED, claimedFrom: 1, claimedTile: idsOfKind(RED)[0]! },
      { kind: 'chow', tiles: [idsOfKind(m(1))[0]!, idsOfKind(m(2))[0]!, idsOfKind(m(3))[0]!], low: m(1), claimedFrom: 1, claimedTile: idsOfKind(m(1))[0]! },
    ];
    const concealed = [...run(s, 2), ...run(p, 7), ...pair(EAST)];
    const readings = decomposeHand(countsMulti(concealed), melds);
    expect(readings).toHaveLength(1);
    expect(readings[0]!.sets).toHaveLength(4);
    expect(readings[0]!.sets.filter((set) => set.fromMeld)).toHaveLength(2);
  });

  it('RULE-WIN-1: thirteen orphans is recognised, and near misses are not', () => {
    const orphans = [m(1), m(9), s(1), s(9), p(1), p(9), EAST, SOUTH, WEST, NORTH, RED, GREEN, WHITE];
    expect(isThirteenOrphans(countsMulti([...orphans, RED]), [])).toBe(true);
    // Two pairs instead of one.
    expect(isThirteenOrphans(countsMulti([...orphans.slice(0, 12), RED, RED, GREEN]), [])).toBe(false);
    // A simple tile spoils it.
    expect(isThirteenOrphans(countsMulti([...orphans.slice(0, 12), m(5), RED]), [])).toBe(false);
  });

  it('RULE-WIN-2: seven pairs is not a winning structure', () => {
    const sevenPairs = [
      ...pair(m(1)), ...pair(m(3)), ...pair(m(5)), ...pair(s(2)),
      ...pair(s(7)), ...pair(p(4)), ...pair(EAST),
    ];
    expect(isCompleteHand(countsMulti(sevenPairs), [])).toBe(false);
  });

  it('chow shapes cover the three ways a tile completes a run', () => {
    expect(chowShapesFor(m(5))).toEqual([
      [m(3), m(4), m(5)],
      [m(4), m(5), m(6)],
      [m(5), m(6), m(7)],
    ]);
    expect(chowShapesFor(m(1))).toEqual([[m(1), m(2), m(3)]]);
    expect(chowShapesFor(m(9))).toEqual([[m(7), m(8), m(9)]]);
    // Honours never form runs.
    expect(chowShapesFor(EAST)).toEqual([]);
    // Runs never cross a suit boundary.
    expect(chowShapesFor(m(8)).every((shape) => shape.every((k) => k <= m(9)))).toBe(true);
    expect(counts([m(1)])[m(1)]).toBe(1);
  });
});
