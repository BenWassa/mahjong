/**
 * A driver that plays a whole game by picking uniformly among legal actions.
 *
 * Deliberately stupid: issue #5's gate is about the engine never reaching an
 * impossible state, and a bot that plays well explores fewer states than one
 * that plays at random.
 */

import { MahjongGame, type GameOptions } from '../../src/engine/index.js';
import { makeRng, randInt } from '../../src/engine/rng.js';
import type { Action } from '../../src/engine/types.js';

export interface DriveResult {
  game: MahjongGame;
  steps: number;
  hands: number;
  finished: boolean;
}

export interface DriveOptions extends GameOptions {
  maxSteps?: number;
  /** Called after every action with the action just applied. */
  onStep?: (game: MahjongGame, action: Action, step: number) => void;
}

export function driveRandomGame(seed: string, options: DriveOptions = {}): DriveResult {
  const { maxSteps = 20_000, onStep, ...gameOptions } = options;
  const game = new MahjongGame(seed, {
    ...gameOptions,
    config: { minimumFaan: 'beginner', ...gameOptions.config },
  });
  const rng = makeRng(`drive:${seed}`);
  let steps = 0;

  while (!game.isMatchOver() && steps < maxSteps) {
    const actions = game.legalActions();
    if (actions.length === 0) break;
    const action = actions[randInt(rng, actions.length)]!;
    game.act(action);
    steps++;
    onStep?.(game, action, steps);
  }

  return {
    game,
    steps,
    hands: game.record().hands.length,
    finished: game.isMatchOver(),
  };
}
