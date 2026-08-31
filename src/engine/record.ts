/**
 * The game record. docs/PRD.md §5.
 *
 * Written with the engine, not retrofitted, because everything downstream —
 * resume, stats, replay, bug reproduction — is a read over this log.
 *
 * The engine has no clock, so timestamps are supplied by the caller or absent.
 */

import type { RulesProfile } from './config.js';
import type { Action, HandResult } from './types.js';

export const RECORD_VERSION = 1;

export interface RecordedAction {
  action: Action;
  /** ISO-8601, supplied by the caller. Absent in headless simulation. */
  at?: string;
}

export interface GameRecord {
  version: number;
  seed: string;
  config: RulesProfile;
  /** Every action in the order it was applied. Replaying these rebuilds the game. */
  actions: RecordedAction[];
  /** Completed hands, in order. */
  hands: HandResult[];
  startedAt: string | null;
  completedAt: string | null;
}

export function newRecord(config: RulesProfile, seed: string, startedAt: string | null): GameRecord {
  return {
    version: RECORD_VERSION,
    seed,
    config,
    actions: [],
    hands: [],
    startedAt,
    completedAt: null,
  };
}

/**
 * A one-line reproduction handle for a failure. Anything that fails inside the
 * simulation harness prints this, and pasting it back in reproduces the game
 * exactly.
 */
export function reproductionHandle(record: GameRecord): string {
  const actions = record.actions.map((a) => shortAction(a.action)).join(' ');
  return `seed=${record.seed} profile=${record.config.tileSet}/${record.config.minimumFaan}/${record.config.matchLength} actions=[${actions}]`;
}

function shortAction(action: Action): string {
  switch (action.type) {
    case 'discard':
      return `d${action.seat}:${action.tile}`;
    case 'concealed-kong':
      return `ck${action.seat}:${action.kind}`;
    case 'added-kong':
      return `ak${action.seat}:${action.kind}`;
    case 'win':
      return `w${action.seat}`;
    case 'chow':
      return `c${action.seat}:${action.low}`;
    case 'pung':
      return `p${action.seat}`;
    case 'kong':
      return `k${action.seat}`;
    case 'pass':
      return `-${action.seat}`;
    case 'next-hand':
      return 'n';
  }
}
