import {
  createInitialGame,
  legalActionsFor,
  legalSystemActions,
  reduceGame,
} from "../engine/scored-core.js";
import { createSeededRandom, type DeterministicRandom } from "../engine/random.js";
import { projectPublicState } from "../engine/redaction.js";
import { DEFAULT_RULES_PROFILE } from "../engine/types.js";
import type {
  GameAction,
  GameRecord,
  InternalGameState,
  RulesProfile,
  Seat,
  Tile,
  TileKind,
} from "../engine/types.js";
import { reproductionHandle } from "./reproduction.js";

const SEATS: readonly Seat[] = [0, 1, 2, 3];

/**
 * Chooses the next action. Real bots arrive in #6; the gate deliberately uses a
 * uniform choice over legal actions, because a player that plays badly explores
 * far more of the state space than one that plays well.
 */
export type ActionChooser = (
  actions: readonly GameAction[],
  state: InternalGameState,
) => GameAction;

export interface SimulationOptions {
  readonly profile?: RulesProfile;
  /**
   * Seed for the *choices*, kept separate from the deal seed so that changing
   * how the driver plays never changes how the tiles fall. RULE-DET-2
   */
  readonly actionSeed?: string;
  readonly maxSteps?: number;
  readonly chooser?: ActionChooser;
  /** Runs after every action. Used to assert redaction over live games. */
  readonly observer?: (state: InternalGameState, action: GameAction, step: number) => void;
}

export interface SimulationResult {
  readonly seed: string;
  readonly steps: number;
  readonly hands: number;
  readonly wins: number;
  readonly draws: number;
  readonly finished: boolean;
  readonly record: GameRecord;
  readonly finalScores: readonly [number, number, number, number];
}

export class SimulationFailure extends Error {
  public readonly handle: string;

  public constructor(message: string, handle: string, cause?: unknown) {
    super(`${message}\n  ${handle}`, cause === undefined ? undefined : { cause });
    this.name = "SimulationFailure";
    this.handle = handle;
  }
}

function uniformChooser(random: DeterministicRandom): ActionChooser {
  return (actions): GameAction => {
    const choice = actions[random.nextInt(actions.length)];
    if (choice === undefined) {
      throw new Error("A non-empty action list produced no choice");
    }
    return choice;
  };
}

/** Every action any seat may take right now, plus the system's own. */
export function allLegalActions(state: InternalGameState): readonly GameAction[] {
  const actions: GameAction[] = [];
  for (const seat of SEATS) {
    actions.push(...legalActionsFor(state, seat));
  }
  actions.push(...legalSystemActions(state));
  return actions;
}

/**
 * Plays one complete match. The engine asserts its own invariants inside every
 * transition, so this wraps any throw with the seed and action history needed
 * to reproduce it exactly.
 */
export function simulateMatch(seed: string, options: SimulationOptions = {}): SimulationResult {
  const profile = options.profile ?? DEFAULT_RULES_PROFILE;
  const maxSteps = options.maxSteps ?? 20_000;
  const random = createSeededRandom(options.actionSeed ?? `choices:${seed}`);
  const chooser = options.chooser ?? uniformChooser(random);

  let state = createInitialGame(seed, profile);
  let steps = 0;

  while (state.phase.kind !== "match-ended" && steps < maxSteps) {
    const actions = allLegalActions(state);
    if (actions.length === 0) {
      break;
    }
    const action = chooser(actions, state);
    try {
      state = reduceGame(state, action);
    } catch (error) {
      throw new SimulationFailure(
        `step ${String(steps)} failed on ${JSON.stringify(action)}`,
        reproductionHandle(state.record),
        error,
      );
    }
    steps += 1;
    options.observer?.(state, action, steps);
  }

  const finished = state.phase.kind === "match-ended";
  if (!finished) {
    throw new SimulationFailure(
      `match did not finish within ${String(maxSteps)} steps (phase ${state.phase.kind})`,
      reproductionHandle(state.record),
    );
  }

  const hands = state.record.hands;
  return {
    seed,
    steps,
    hands: hands.length,
    wins: hands.filter((hand) => hand.outcome === "win").length,
    draws: hands.filter((hand) => hand.outcome !== "win").length,
    finished,
    record: state.record,
    finalScores: state.players.map((player) => player.score) as unknown as readonly [
      number,
      number,
      number,
      number,
    ],
  };
}

export interface SuiteOptions extends SimulationOptions {
  readonly games: number;
  readonly seedPrefix?: string;
}

export interface SuiteSummary {
  readonly games: number;
  readonly steps: number;
  readonly hands: number;
  readonly wins: number;
  readonly draws: number;
  readonly profile: RulesProfile;
}

/** Runs many matches, failing on the first violation with a reproduction handle. */
export function simulateSuite(options: SuiteOptions): SuiteSummary {
  const prefix = options.seedPrefix ?? "sim";
  const profile = options.profile ?? DEFAULT_RULES_PROFILE;
  let steps = 0;
  let hands = 0;
  let wins = 0;
  let draws = 0;

  for (let index = 0; index < options.games; index += 1) {
    const result = simulateMatch(`${prefix}-${String(index)}`, options);
    steps += result.steps;
    hands += result.hands;
    wins += result.wins;
    draws += result.draws;
  }

  return { games: options.games, steps, hands, wins, draws, profile };
}

/**
 * Asserts that no seat's view ever contains a tile it is not entitled to see.
 * Run as a simulation observer, so redaction is proven over live games rather
 * than only over hand-built fixtures.
 *
 * Two things are legitimately public and are exempted rather than flagged:
 *
 *  - When a hand ends, the winner's hand goes face up. The end-of-hand result
 *    names the winning tile and structure, which §9 requires for the itemised
 *    breakdown. Losers stay hidden and are still checked.
 *  - During a rob window, the promoted kong tile is declared to the table even
 *    though the engine leaves it in the declarer's concealed list until the
 *    kong completes. §4.6
 */
export function assertNoHiddenInformation(state: InternalGameState): void {
  const phase = state.phase;
  const winner =
    (phase.kind === "hand-ended" || phase.kind === "match-ended") && phase.result.outcome === "win"
      ? phase.result.winner
      : null;
  const declaredKongTile = phase.kind === "awaiting-rob" ? phase.tileId : null;

  const wallIds = new Set<string>(state.wall.map((tile) => tile.id));
  for (const viewer of SEATS) {
    const view = projectPublicState(state, viewer);
    const visible = collectTileIds(view);

    for (const id of visible) {
      if (wallIds.has(id)) {
        throw new Error(`Seat ${String(viewer)} can see wall tile ${id}`);
      }
    }

    for (const seat of SEATS) {
      if (seat === viewer || seat === winner) {
        continue;
      }
      const player = state.players[seat];
      for (const tile of player.concealed) {
        if (tile.id === declaredKongTile) {
          continue;
        }
        if (visible.has(tile.id)) {
          throw new Error(
            `Seat ${String(viewer)} can see seat ${String(seat)}'s concealed ${tile.id}`,
          );
        }
      }
      for (const meld of player.melds) {
        if (meld.exposure === "exposed") {
          continue;
        }
        for (const tile of meld.tiles) {
          if (visible.has(tile.id)) {
            throw new Error(
              `Seat ${String(viewer)} can see seat ${String(seat)}'s concealed kong tile ${tile.id}`,
            );
          }
        }
      }
    }
  }
}

function collectTileIds(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTileIds(item, found);
    }
    return found;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const id: unknown = record["id"];
    const kind: unknown = record["kind"];
    if (typeof id === "string" && typeof kind === "string") {
      found.add(id);
    }
    for (const entry of Object.values(record)) {
      collectTileIds(entry, found);
    }
  }
  return found;
}

/**
 * A chooser that reaches completed hands often enough for the gate to exercise
 * win detection, scoring, settlement and dealer continuation.
 *
 * This is coverage infrastructure, not a bot. It knows three things: take a
 * legal win, prefer keeping tiles that connect, and otherwise behave like the
 * uniform chooser. Play strength is issue #6's problem, and the uniform chooser
 * remains the one that explores the state space.
 */
export function winSeekingChooser(random: DeterministicRandom): ActionChooser {
  return (actions, state): GameAction => {
    const win = actions.find((action) => action.type === "win");
    if (win !== undefined) {
      return win;
    }

    const discards = actions.filter((action) => action.type === "discard");
    if (discards.length > 0 && discards.length === actions.length) {
      return leastConnectedDiscard(discards, state, random);
    }

    const choice = actions[random.nextInt(actions.length)];
    if (choice === undefined) {
      throw new Error("A non-empty action list produced no choice");
    }
    return choice;
  };
}

/** Discards the tile with the fewest same-or-adjacent tiles beside it in hand. */
function leastConnectedDiscard(
  discards: readonly GameAction[],
  state: InternalGameState,
  random: DeterministicRandom,
): GameAction {
  const first = discards[0];
  if (first === undefined || first.type !== "discard") {
    throw new Error("A discard list contained no discard");
  }
  const hand = state.players[first.seat].concealed;
  const byId = new Map(hand.map((tile) => [tile.id as string, tile]));

  let best = first;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const action of discards) {
    if (action.type !== "discard") {
      continue;
    }
    const tile = byId.get(action.tileId);
    if (tile === undefined) {
      continue;
    }
    const score = connectionScore(tile, hand);
    if (score < bestScore) {
      best = action;
      bestScore = score;
    }
  }

  // Break ties deterministically so the driver stays reproducible.
  const tied = discards.filter((action) => {
    if (action.type !== "discard") {
      return false;
    }
    const tile = byId.get(action.tileId);
    return tile !== undefined && connectionScore(tile, hand) === bestScore;
  });
  return tied[random.nextInt(tied.length)] ?? best;
}

function connectionScore(tile: Tile, hand: readonly Tile[]): number {
  let score = 0;
  for (const other of hand) {
    if (other.id === tile.id) {
      continue;
    }
    if (other.kind === tile.kind) {
      score += 3;
      continue;
    }
    const gap = neighbourDistance(tile.kind, other.kind);
    if (gap === 1) {
      score += 2;
    } else if (gap === 2) {
      score += 1;
    }
  }
  return score;
}

/** Distance within a numbered suit, or Infinity for honours and cross-suit pairs. */
function neighbourDistance(left: TileKind, right: TileKind): number {
  const a = suitedRank(left);
  const b = suitedRank(right);
  if (a === null || b === null || a.suit !== b.suit) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(a.rank - b.rank);
}

function suitedRank(kind: TileKind): { suit: string; rank: number } | null {
  const match = /^(characters|bamboo|dots)-([1-9])$/.exec(kind);
  if (match === null) {
    return null;
  }
  const suit = match[1];
  const rank = match[2];
  if (suit === undefined || rank === undefined) {
    return null;
  }
  return { suit, rank: Number(rank) };
}
