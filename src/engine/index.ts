/**
 * The engine adapter. This is the ONLY surface the UI and the bots may touch.
 *
 * docs/PRD.md §4:
 *   newGame(config, seed) · state() · legalActions() · act(action) · scoreBreakdown()
 *
 * Nothing outside this module may reach into engine internals. `debugState` is
 * named to make a violation obvious in review; it exists for tests and the
 * simulation harness, which legitimately need the unredacted state to assert
 * invariants.
 */

import { minimumFaanOf, normaliseProfile, type RulesProfile } from './config.js';
import { act as applyAct, legalActions as computeLegal, newGame, type EngineDeps } from './game.js';
import { checkInvariants, type Violation } from './invariants.js';
import { newRecord, reproductionHandle, type GameRecord, type RecordedAction } from './record.js';
import { redact, type PublicState } from './redact.js';
import { PLACEHOLDER_SCORER, structuralScorer, type Scorer } from './scoring/index.js';
import type { Seat } from './tiles.js';
import type { Action, FaanBreakdown, GameEvent, GameState, HandResult } from './types.js';

export interface GameOptions {
  config?: Partial<RulesProfile>;
  /** Defaults to the placeholder scorer until issue #4 lands its own. */
  scorer?: Scorer;
  /** ISO-8601 start time for the record. The engine never reads a clock. */
  startedAt?: string | null;
}

export class MahjongGame {
  readonly #deps: EngineDeps;
  #state: GameState;
  #record: GameRecord;
  #events: GameEvent[];

  constructor(seed: string, options: GameOptions = {}) {
    const config = normaliseProfile(options.config);
    const scorer = options.scorer ?? structuralScorer;
    if (scorer === PLACEHOLDER_SCORER && minimumFaanOf(config) > 0) {
      // The placeholder scores every hand at zero faan, so a non-zero minimum
      // would make winning impossible rather than merely wrong. Refusing here
      // means the product cannot ship on the placeholder by accident.
      throw new Error(
        'the placeholder scorer only supports the 0-faan minimum; supply a real scorer (issue #4)',
      );
    }
    this.#deps = { scorer };
    this.#state = newGame(config, seed, this.#deps);
    this.#record = newRecord(config, seed, options.startedAt ?? null);
    this.#events = [...this.#state.lastEvents];
  }

  /** The redacted view for a seat. Defaults to the human seat. §11 */
  state(seat: Seat = 0): PublicState {
    return redact(this.#state, seat);
  }

  /** Legal actions, optionally filtered to one seat. */
  legalActions(seat?: Seat): Action[] {
    return computeLegal(this.#state, this.#deps, seat);
  }

  /** Apply an action. Throws `IllegalActionError` if it is not legal. */
  act(action: Action, at?: string): PublicState {
    const entry: RecordedAction = at === undefined ? { action } : { action, at };
    this.#record.actions.push(entry);
    this.#state = applyAct(this.#state, action, this.#deps);
    this.#events.push(...this.#state.lastEvents);
    this.#syncHands();
    return this.state(action.type === 'next-hand' ? 0 : action.seat);
  }

  /** The itemised faan for the hand that just ended, or null. */
  scoreBreakdown(): FaanBreakdown | null {
    return this.#state.handResult?.breakdown ?? null;
  }

  /** Result of the hand that just ended, or null. */
  handResult(): HandResult | null {
    return this.#state.handResult;
  }

  /** Events produced since the last call. Drives animation and explanations. */
  drainEvents(): GameEvent[] {
    const events = this.#events;
    this.#events = [];
    return events;
  }

  /** The full, serialisable game record. */
  record(): GameRecord {
    return this.#record;
  }

  /** A copy-pasteable handle that reproduces this game exactly. */
  reproduction(): string {
    return reproductionHandle(this.#record);
  }

  isMatchOver(): boolean {
    return this.#state.phase.t === 'match-over';
  }

  /** Structural invariants over the true state. Empty when sound. */
  invariantViolations(): Violation[] {
    return checkInvariants(this.#state);
  }

  /**
   * The unredacted state. For tests and the simulation harness only — using it
   * from UI or bot code defeats §11 and will fail review.
   */
  debugState(): GameState {
    return this.#state;
  }

  #syncHands(): void {
    while (this.#record.hands.length < this.#state.results.length) {
      this.#record.hands.push(this.#state.results[this.#record.hands.length]!);
    }
    if (this.isMatchOver() && this.#record.completedAt === null) {
      const last = this.#record.actions.at(-1);
      this.#record.completedAt = last?.at ?? null;
    }
  }
}

/** PRD-shaped entry point. */
export function createGame(seed: string, options: GameOptions = {}): MahjongGame {
  return new MahjongGame(seed, options);
}

/**
 * Rebuild a game from its record by replaying every action. The result is
 * byte-identical to the original. RULE-DET-1
 */
export function replay(record: GameRecord, options: Omit<GameOptions, 'config'> = {}): MahjongGame {
  const game = new MahjongGame(record.seed, {
    ...options,
    config: record.config,
    startedAt: record.startedAt,
  });
  for (const entry of record.actions) game.act(entry.action, entry.at);
  return game;
}

export { IllegalActionError } from './game.js';
export { checkInvariants, assertSound } from './invariants.js';
export { reproductionHandle } from './record.js';
export type { GameRecord, RecordedAction } from './record.js';
export type { PublicState, PublicSeat, PublicMeld, PublicPhase } from './redact.js';
export type { Scorer, ScoreInput } from './scoring/index.js';
export type {
  Action,
  ClaimDeclaration,
  DiscardEntry,
  FaanBreakdown,
  FaanLine,
  GameEvent,
  GameState,
  HandResult,
  SeatState,
  WinContext,
} from './types.js';
export type { RulesProfile, MinimumFaanProfile, MatchLength } from './config.js';
export { DEFAULT_PROFILE, MINIMUM_FAAN, FAAN_CEILING, minimumFaanOf, normaliseProfile } from './config.js';
export * from './tiles.js';
export type { Meld, MeldKind, Decomposition, DecomposedSet } from './melds.js';
export {
  decomposeHand,
  decomposeConcealed,
  isCompleteHand,
  isThirteenOrphans,
  chowShapesFor,
  isKong,
  isExposed,
} from './melds.js';
export { seatWindOf } from './game.js';
export { settle } from './settle.js';
