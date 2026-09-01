import {
  createInitialGame,
  legalActionsFor,
  legalSystemActions,
  reduceGame,
} from "./scored-core.js";
import { isStructurallyComplete, waitingTiles } from "./learning.js";
import { projectPublicState } from "./redaction.js";
import type {
  FaanBreakdown,
  GameAction,
  GameRecord,
  InternalGameState,
  OrdinaryTileKind,
  PublicGameState,
  RulesProfile,
  Seat,
} from "./types.js";

export class ReplayMismatchError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ReplayMismatchError";
  }
}

function cloneRecord(record: GameRecord): GameRecord {
  // Records contain JSON data only. Keeping the clone here avoids exposing the
  // adapter's immutable snapshot to accidental consumer mutation without adding
  // DOM or Node globals to the headless engine build.
  const parsed: unknown = JSON.parse(JSON.stringify(record));
  return parsed as GameRecord;
}

/**
 * Immutable UI boundary over the pure reducer. Calling act returns a new adapter;
 * the prior instance remains a valid snapshot.
 */
export class MahjongGame {
  readonly #internal: InternalGameState;

  public constructor(internal: InternalGameState) {
    this.#internal = internal;
  }

  public state(viewer: Seat = 0): PublicGameState {
    return projectPublicState(this.#internal, viewer);
  }

  public legalActions(seat: Seat = 0): readonly GameAction[] {
    const playerActions = legalActionsFor(this.#internal, seat);
    return seat === 0 ? [...playerActions, ...legalSystemActions(this.#internal)] : playerActions;
  }

  public act(action: GameAction): MahjongGame {
    return new MahjongGame(reduceGame(this.#internal, action));
  }

  public scoreBreakdown(): FaanBreakdown | null {
    return this.#internal.phase.kind === "hand-ended" ||
      this.#internal.phase.kind === "match-ended"
      ? this.#internal.phase.result.scoring
      : null;
  }

  /** Trusted persistence/debug record. Never pass this hidden-information log to a bot. */
  public gameRecord(): GameRecord {
    return cloneRecord(this.#internal.record);
  }

  /**
   * Assist-layer hint (#9): tile kinds that would complete the seat's own
   * hand right now. Empty whenever the hand is not at a resting count, i.e.
   * mid-turn holding an extra drawn tile. Reads only the seat's own tiles.
   */
  public waitingTiles(seat: Seat = 0): readonly OrdinaryTileKind[] {
    return waitingTiles(this.#internal, seat);
  }

  /**
   * Assist-layer hint (#9): whether the seat's tiles, exactly as held right
   * now, already form a legal winning shape structurally, independent of the
   * minimum-faan floor. Reads only the seat's own tiles.
   */
  public isStructurallyComplete(seat: Seat = 0): boolean {
    return isStructurallyComplete(this.#internal, seat);
  }
}

export function newGame(config: RulesProfile, seed: string): MahjongGame {
  return new MahjongGame(createInitialGame(seed, config));
}

export function replayGame(record: GameRecord): MahjongGame {
  // Keep the runtime guard for records entering through JavaScript or decoded persistence.
  const version: unknown = record.version;
  if (version !== 1) {
    throw new ReplayMismatchError(`Unsupported game-record version ${String(version)}`);
  }
  let game = newGame(record.config, record.seed);
  for (const [position, recorded] of record.actions.entries()) {
    if (recorded.index !== position) {
      throw new ReplayMismatchError(
        `Action index ${String(recorded.index)} does not match record position ${String(position)}`,
      );
    }
    game = game.act(recorded.action);
  }
  const replayed = game.gameRecord();
  if (JSON.stringify(replayed) !== JSON.stringify(record)) {
    throw new ReplayMismatchError("Seed plus action sequence did not reproduce the supplied record");
  }
  return game;
}
