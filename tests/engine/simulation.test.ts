import { describe, expect, it } from 'vitest';
import { reproductionHandle } from '../../src/engine/index.js';
import { driveRandomGame } from '../helpers/drive.js';

/**
 * A smoke-sized version of the issue #5 gate: enough seeded games to catch a
 * structural mistake in this PR, not the full corpus.
 */
describe('seeded simulation (smoke)', () => {
  it('plays 200 seeded matches with no invariant violation', () => {
    for (let i = 0; i < 200; i++) {
      const seed = `smoke-${i}`;
      const { game, finished } = driveRandomGame(seed, {
        config: { matchLength: 'east-round' },
        onStep: (g, action, step) => {
          const problems = g.invariantViolations();
          if (problems.length > 0) {
            throw new Error(
              `invariant broken at step ${step} after ${JSON.stringify(action)}\n` +
                problems.map((p) => `  ${p.rule}: ${p.detail}`).join('\n') +
                `\n  ${reproductionHandle(g.record())}`,
            );
          }
        },
      });
      expect(finished, `match ${seed} did not finish`).toBe(true);
      expect(game.invariantViolations()).toEqual([]);
    }
  });

  it('plays the 136-tile profile too', () => {
    for (let i = 0; i < 50; i++) {
      const { game, finished } = driveRandomGame(`smoke136-${i}`, {
        config: { tileSet: 136, matchLength: 'east-round' },
      });
      expect(finished).toBe(true);
      expect(game.invariantViolations()).toEqual([]);
    }
  });

  it('an East round always ends, and ends with four dealerships', () => {
    for (let i = 0; i < 30; i++) {
      const { game } = driveRandomGame(`round-${i}`, { config: { matchLength: 'east-round' } });
      const state = game.debugState();
      expect(state.phase.t).toBe('match-over');
      expect(game.record().hands.length).toBeGreaterThanOrEqual(4);
      expect(state.roundWind).toBe('east');
    }
  });

  it('scores always sum to zero across a whole match', () => {
    for (let i = 0; i < 30; i++) {
      const { game } = driveRandomGame(`zero-${i}`);
      const state = game.debugState();
      expect(state.seats.reduce((sum, s) => sum + s.score, 0)).toBe(0);
    }
  });
});
