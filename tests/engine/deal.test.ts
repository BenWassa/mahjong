import { describe, expect, it } from 'vitest';
import { MahjongGame, isBonusId, kindOf, isBonus } from '../../src/engine/index.js';
import { tilesLeft } from '../../src/engine/types.js';

function freshGame(seed: string, tileSet: 144 | 136 = 144): MahjongGame {
  return new MahjongGame(seed, { config: { minimumFaan: 'beginner', tileSet } });
}

describe('the deal', () => {
  it('RULE-DEAL-2: the dealer holds 14 tiles and everyone else 13', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const state = freshGame(seed).debugState();
      for (const seat of [0, 1, 2, 3] as const) {
        const slots = state.seats[seat].concealed.length + 3 * state.seats[seat].melds.length;
        expect(slots).toBe(seat === state.dealer ? 14 : 13);
      }
    }
  });

  it('RULE-DEAL-3: 91 tiles remain, less one per bonus tile replaced', () => {
    // 144 - (4 x 13) - 1 = 91 after the deal proper. Each bonus replacement is
    // taken from the tail, so it costs the table exactly one future draw.
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const state = freshGame(seed).debugState();
      const revealed = state.seats.reduce((n, seat) => n + seat.bonus.length, 0);
      expect(tilesLeft(state)).toBe(91 - revealed);
    }
  });

  it('RULE-DEAL-3: the 136 set leaves 83, and never replaces anything', () => {
    expect(tilesLeft(freshGame('a', 136).debugState())).toBe(83);
  });

  it('RULE-FLOWER-2: no seat still holds a bonus tile after the deal', () => {
    for (let i = 0; i < 40; i++) {
      const state = freshGame(`flower-${i}`).debugState();
      for (const seat of [0, 1, 2, 3] as const) {
        expect(state.seats[seat].concealed.some(isBonusId)).toBe(false);
      }
    }
  });

  it('RULE-FLOWER-1: revealed bonus tiles are all genuine bonus tiles', () => {
    let revealed = 0;
    for (let i = 0; i < 40; i++) {
      const state = freshGame(`bonus-${i}`).debugState();
      for (const seat of [0, 1, 2, 3] as const) {
        for (const id of state.seats[seat].bonus) {
          expect(isBonus(kindOf(id))).toBe(true);
          revealed++;
        }
      }
    }
    // Across 40 deals someone must have drawn a flower.
    expect(revealed).toBeGreaterThan(0);
  });

  it('RULE-TILES-1: the 136 profile never reveals a bonus tile', () => {
    for (let i = 0; i < 20; i++) {
      const state = freshGame(`no-bonus-${i}`, 136).debugState();
      for (const seat of [0, 1, 2, 3] as const) expect(state.seats[seat].bonus).toHaveLength(0);
    }
  });

  it('the dealt state is sound and the dealer is on turn', () => {
    const game = freshGame('sound');
    expect(game.invariantViolations()).toEqual([]);
    const state = game.debugState();
    expect(state.phase).toEqual({ t: 'action', seat: state.dealer });
  });

  it('RULE-DET-1: the same seed deals the same hand', () => {
    const a = freshGame('same').debugState();
    const b = freshGame('same').debugState();
    expect(a.seats.map((s) => s.concealed)).toEqual(b.seats.map((s) => s.concealed));
    expect(a.wall).toEqual(b.wall);
  });

  it('different seeds deal different hands', () => {
    const a = freshGame('one').debugState();
    const b = freshGame('two').debugState();
    expect(a.seats[0].concealed).not.toEqual(b.seats[0].concealed);
  });
});
