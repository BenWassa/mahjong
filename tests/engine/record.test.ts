import { describe, expect, it } from 'vitest';
import { MahjongGame, replay, reproductionHandle } from '../../src/engine/index.js';
import { driveRandomGame } from '../helpers/drive.js';

/** Everything that defines a game, minus the derived event buffer. */
function snapshot(game: MahjongGame): string {
  const state = game.debugState();
  return JSON.stringify({
    wall: state.wall,
    head: state.head,
    tail: state.tail,
    seats: state.seats,
    dealer: state.dealer,
    roundWind: state.roundWind,
    dealsThisRound: state.dealsThisRound,
    handNumber: state.handNumber,
    phase: state.phase,
    live: state.live,
    discardPile: state.discardPile,
    discardCount: state.discardCount,
    results: state.results,
  });
}

describe('the game record', () => {
  it('RULE-DET-1: replaying a record reproduces the game exactly', () => {
    for (const seed of ['replay-a', 'replay-b', 'replay-c', 'replay-d']) {
      const { game } = driveRandomGame(seed);
      const rebuilt = replay(game.record());
      expect(snapshot(rebuilt)).toBe(snapshot(game));
      expect(rebuilt.record().hands).toEqual(game.record().hands);
    }
  });

  it('records every action in order', () => {
    const { game, steps } = driveRandomGame('record-order');
    expect(game.record().actions).toHaveLength(steps);
    // The record replays without a single illegal action, which is the real
    // assertion: an out-of-order or missing action would throw.
    expect(() => replay(game.record())).not.toThrow();
  });

  it('carries the seed and profile needed to rebuild from nothing', () => {
    const { game } = driveRandomGame('handle', { config: { tileSet: 136 } });
    const record = game.record();
    expect(record.seed).toBe('handle');
    expect(record.config.tileSet).toBe(136);
    expect(record.version).toBe(1);
  });

  it('a failure handle names the seed and the whole action history', () => {
    const { game } = driveRandomGame('repro');
    const handle = reproductionHandle(game.record());
    expect(handle).toContain('seed=repro');
    expect(handle).toContain('actions=[');
    expect(handle.length).toBeGreaterThan(40);
  });

  it('collects one HandResult per completed hand', () => {
    const { game, hands } = driveRandomGame('hands');
    const record = game.record();
    expect(record.hands).toHaveLength(hands);
    for (const hand of record.hands) {
      expect(hand.payments.reduce((a, b) => a + b, 0)).toBe(0);
      expect(['win', 'exhaustive-draw']).toContain(hand.outcome);
    }
  });

  it('the engine never reads a clock: timestamps only appear when supplied', () => {
    const game = new MahjongGame('clock', { config: { minimumFaan: 'beginner' } });
    const first = game.legalActions()[0]!;
    game.act(first);
    expect(game.record().actions[0]).toEqual({ action: first });
    expect(game.record().startedAt).toBeNull();

    const stamped = new MahjongGame('clock2', {
      config: { minimumFaan: 'beginner' },
      startedAt: '2026-01-01T00:00:00.000Z',
    });
    const action = stamped.legalActions()[0]!;
    stamped.act(action, '2026-01-01T00:00:01.000Z');
    expect(stamped.record().actions[0]!.at).toBe('2026-01-01T00:00:01.000Z');
  });
});
