import { describe, expect, it } from 'vitest';
import {
  FIRST_BONUS_ID,
  KIND_COUNT,
  TILE_COUNT,
  idsOfKind,
  isBonus,
  isDragon,
  isHonour,
  isTerminal,
  isTerminalOrHonour,
  isWind,
  kindOf,
  rankOf,
  seatDistance,
  suitOf,
  Suit,
  THIRTEEN_ORPHAN_KINDS,
} from '../../src/engine/index.js';
import { tileSetFor } from '../../src/engine/wall.js';
import { DEFAULT_PROFILE } from '../../src/engine/config.js';
import { EAST, GREEN, m, p, s, WHITE } from '../helpers/kinds.js';

describe('tile identity', () => {
  it('RULE-TILES-1: the 144 set has four copies of 34 kinds and one each of 8 bonus tiles', () => {
    const set = tileSetFor(DEFAULT_PROFILE);
    expect(set).toHaveLength(TILE_COUNT);
    const perKind = new Array<number>(KIND_COUNT).fill(0);
    for (const id of set) perKind[kindOf(id)]!++;
    for (let kind = 0; kind < KIND_COUNT; kind++) {
      expect(perKind[kind]).toBe(isBonus(kind) ? 1 : 4);
    }
  });

  it('RULE-TILES-1: the 136 set drops every bonus tile', () => {
    const set = tileSetFor({ ...DEFAULT_PROFILE, tileSet: 136 });
    expect(set).toHaveLength(136);
    expect(set.some((id) => isBonus(kindOf(id)))).toBe(false);
  });

  it('kindOf and idsOfKind are inverses across the whole set', () => {
    for (let id = 0; id < TILE_COUNT; id++) {
      expect(idsOfKind(kindOf(id))).toContain(id);
    }
    for (let kind = 0; kind < KIND_COUNT; kind++) {
      for (const id of idsOfKind(kind)) expect(kindOf(id)).toBe(kind);
    }
  });

  it('classifies suits, honours, terminals and bonus tiles', () => {
    expect(suitOf(m(1))).toBe(Suit.Characters);
    expect(suitOf(s(5))).toBe(Suit.Bamboo);
    expect(suitOf(p(9))).toBe(Suit.Dots);
    expect(rankOf(p(9))).toBe(9);
    expect(rankOf(EAST)).toBe(0);
    expect(isHonour(EAST)).toBe(true);
    expect(isWind(EAST)).toBe(true);
    expect(isDragon(GREEN)).toBe(true);
    expect(isWind(WHITE)).toBe(false);
    expect(isTerminal(m(1))).toBe(true);
    expect(isTerminal(m(2))).toBe(false);
    expect(isTerminalOrHonour(WHITE)).toBe(true);
    expect(isBonus(kindOf(FIRST_BONUS_ID))).toBe(true);
  });

  it('the thirteen orphan kinds are exactly the 13 terminals and honours', () => {
    expect(new Set(THIRTEEN_ORPHAN_KINDS).size).toBe(13);
    for (let kind = 0; kind < 34; kind++) {
      expect(THIRTEEN_ORPHAN_KINDS.includes(kind)).toBe(isTerminalOrHonour(kind));
    }
  });

  it('seat distance runs forward around the table', () => {
    expect(seatDistance(0, 1)).toBe(1);
    expect(seatDistance(3, 0)).toBe(1);
    expect(seatDistance(0, 3)).toBe(3);
    expect(seatDistance(2, 2)).toBe(0);
  });
});
