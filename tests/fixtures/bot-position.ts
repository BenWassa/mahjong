import { legalActionsFor, reduceGame } from "../../src/engine/scored-core.js";
import { projectPublicState } from "../../src/engine/redaction.js";
import type {
  GameAction,
  InternalGameState,
  PublicGameState,
  Seat,
  TileKind,
} from "../../src/engine/types.js";
import { buildTestState, type TestStateOptions } from "./state-builder.js";

export interface BotPosition {
  readonly internal: InternalGameState;
  readonly publicState: PublicGameState;
  readonly legalActions: readonly GameAction[];
}

/**
 * Packages the two values a bot is permitted to consume while retaining the
 * trusted state only for assertions made by the test harness.
 */
export function botPosition(state: InternalGameState, seat: Seat): BotPosition {
  return {
    internal: state,
    publicState: projectPublicState(state, seat),
    legalActions: legalActionsFor(state, seat),
  };
}

export function buildBotDiscardPosition(
  seat: Seat,
  concealed: readonly TileKind[],
  options: Omit<TestStateOptions, "concealed" | "phase"> = {},
): BotPosition {
  return botPosition(buildTestState({
    ...options,
    concealed: { [seat]: concealed },
    phase: {
      kind: "awaiting-discard",
      seat,
      source: "wall",
      drawnTile: null,
      lastWallTile: false,
    },
  }), seat);
}

/** Builds a genuine claim window by having the engine perform the discard. */
export function buildBotClaimPosition(
  seat: Seat,
  discarder: Seat,
  discardedKind: TileKind,
  concealed: Partial<Record<Seat, readonly TileKind[]>>,
  options: Omit<TestStateOptions, "concealed" | "phase"> = {},
): BotPosition {
  const before = buildTestState({
    ...options,
    concealed,
    phase: {
      kind: "awaiting-discard",
      seat: discarder,
      source: "wall",
      drawnTile: null,
      lastWallTile: false,
    },
  });
  const tile = before.players[discarder].concealed.find(
    (candidate) => candidate.kind === discardedKind,
  );
  if (tile === undefined) {
    throw new Error(`Seat ${String(discarder)} cannot discard missing ${discardedKind}`);
  }
  const claims = reduceGame(before, { type: "discard", seat: discarder, tileId: tile.id });
  return botPosition(claims, seat);
}

