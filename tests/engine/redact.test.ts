import { describe, expect, it } from 'vitest';
import { MahjongGame, idsOfKind, type PublicState } from '../../src/engine/index.js';
import { position } from '../helpers/position.js';
import { EAST, GREEN, m, p, pair, run, s, SOUTH, trip, WEST } from '../helpers/kinds.js';

const id = (kind: number, copy = 0): number => idsOfKind(kind)[copy]!;

/** Every tile id mentioned anywhere in a public view, however deeply nested. */
function tilesMentioned(view: PublicState): Set<number> {
  const found = new Set<number>();
  const walk = (value: unknown, key: string): void => {
    if (typeof value === 'number') {
      if (key === 'tile' || key === 'tiles' || key === 'hand' || key === 'bonus') found.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, key);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  walk(view, 'root');
  return found;
}

describe('information redaction', () => {
  const FOUR_5M = [...trip(m(5)), m(5), ...run(p, 1), ...run(s, 5), ...pair(EAST), s(8), s(9)];
  const HAND_1 = [m(3), m(4), ...run(s, 1), ...run(p, 4), ...run(p, 7), ...pair(WEST)];
  const HAND_2 = [...run(m, 7), ...run(s, 3), ...run(p, 4), ...run(p, 7), GREEN];
  const HAND_3 = [...run(m, 6), ...run(s, 4), ...run(p, 2), ...run(p, 5), SOUTH];

  it('RULE-REDACT-1: another seat never sees your concealed tiles', () => {
    const game = position({ hands: [FOUR_5M, HAND_1, HAND_2, HAND_3], live: { tile: id(m(5), 3) } });
    const truth = game.debugState();
    for (const viewer of [0, 1, 2, 3] as const) {
      const view = game.state(viewer);
      const mentioned = tilesMentioned(view);
      for (const other of [0, 1, 2, 3] as const) {
        if (other === viewer) continue;
        for (const hidden of truth.seats[other].concealed) {
          expect(mentioned.has(hidden)).toBe(false);
        }
      }
      // Your own hand is fully visible to you.
      expect(view.hand).toEqual(truth.seats[viewer].concealed);
    }
  });

  it('RULE-REDACT-2: the wall never appears, only its count', () => {
    const game = position({ hands: [FOUR_5M, HAND_1, HAND_2, HAND_3], live: { tile: id(m(5), 3) } });
    const truth = game.debugState();
    const view = game.state(0);
    const mentioned = tilesMentioned(view);
    for (let i = truth.head; i < truth.tail; i++) {
      expect(mentioned.has(truth.wall[i]!)).toBe(false);
    }
    expect(view.wallRemaining).toBe(truth.tail - truth.head);
    expect(JSON.stringify(view)).not.toContain('"wall"');
  });

  it('RULE-REDACT-3: a concealed kong shows as an anonymous kong to everyone else', () => {
    const game = position({
      hands: [FOUR_5M, HAND_1, HAND_2, HAND_3],
      wallTail: [p(3)],
      live: { tile: id(m(5), 3) },
    });
    game.act({ type: 'concealed-kong', seat: 0, kind: m(5) });

    const own = game.state(0).seats[0]!.melds[0]!;
    expect(own.tiles).not.toBeNull();

    for (const viewer of [1, 2, 3] as const) {
      const meld = game.state(viewer).seats[0]!.melds[0]!;
      expect(meld.kind).toBe('kong-concealed');
      expect(meld.tiles).toBeNull();
      expect(meld.low).toBeNull();
    }
  });

  it('a pending claim by one seat is invisible to the others', () => {
    const DEALER = [m(3), ...run(p, 1), ...run(p, 4), ...run(s, 5), ...run(s, 7), EAST];
    const WAITER = [m(1), m(2), ...run(m, 4), ...run(s, 2), ...run(p, 7), ...pair(WEST)];
    const game = position({ hands: [DEALER, WAITER, HAND_2, HAND_3], live: { tile: id(m(3)) } });
    game.act({ type: 'discard', seat: 0, tile: id(m(3)) });

    const claimer = game.state(1).phase;
    const bystander = game.state(2).phase;
    expect(claimer).toMatchObject({ t: 'claims', youMayClaim: true });
    expect(bystander).toMatchObject({ t: 'claims', youMayClaim: false });
    // The eligible list itself never leaves the engine.
    expect(JSON.stringify(game.state(2))).not.toContain('eligible');
  });

  it('exposed melds, bonus tiles, discards and scores are shared information', () => {
    const game = new MahjongGame('shared', { config: { minimumFaan: 'beginner' } });
    const truth = game.debugState();
    for (const viewer of [0, 1, 2, 3] as const) {
      const view = game.state(viewer);
      for (const seat of [0, 1, 2, 3] as const) {
        expect(view.seats[seat]!.bonus).toEqual(truth.seats[seat].bonus);
        expect(view.seats[seat]!.concealedCount).toBe(truth.seats[seat].concealed.length);
        expect(view.seats[seat]!.score).toBe(truth.seats[seat].score);
      }
      expect(view.dealer).toBe(truth.dealer);
      expect(view.roundWind).toBe(truth.roundWind);
    }
  });

  it('seat winds follow the dealership', () => {
    const game = position({ dealer: 2, hands: [HAND_2, HAND_3, [...FOUR_5M], HAND_1], live: { tile: id(m(5), 3) } });
    expect(game.state(2).yourWind).toBe('east');
    expect(game.state(3).yourWind).toBe('south');
    expect(game.state(0).yourWind).toBe('west');
    expect(game.state(1).yourWind).toBe('north');
  });
});
