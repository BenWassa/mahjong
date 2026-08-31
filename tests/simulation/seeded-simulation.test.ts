import { describe, expect, it } from "vitest";

import { MahjongGame, replayGame } from "../../src/engine/adapter.js";
import { assertGameInvariants } from "../../src/engine/invariants.js";
import {
  createSeededRandom,
  type DeterministicRandom,
} from "../../src/engine/random.js";
import {
  createInitialGame,
  legalActionsFor,
  legalSystemActions,
  reduceGame,
} from "../../src/engine/scored-core.js";
import type {
  GameAction,
  InternalGameState,
  RulesProfile,
  Seat,
} from "../../src/engine/types.js";

const SEATS: readonly Seat[] = [0, 1, 2, 3];
const MINIMUM_FAAN_PROFILES = [0, 1, 3] as const;
const MAX_ACTIONS_PER_GAME = 10_000;
const SIMULATION_TIMEOUT_MS = 180_000;

function randomChoice<T>(values: readonly T[], random: DeterministicRandom): T {
  const value = values[random.nextInt(values.length)];
  if (value === undefined) {
    throw new Error("Cannot choose from an empty action list");
  }
  return value;
}

function choosePlayerAction(
  actions: readonly GameAction[],
  random: DeterministicRandom,
): GameAction {
  const win = actions.find((action) => action.type === "win");
  if (win !== undefined) {
    return win;
  }

  const claims = actions.filter(
    (action) =>
      action.type === "claim-chow" ||
      action.type === "claim-pung" ||
      action.type === "claim-kong",
  );
  if (claims.length > 0 && random.nextInt(4) !== 0) {
    return randomChoice(claims, random);
  }

  const kongs = actions.filter(
    (action) =>
      action.type === "declare-concealed-kong" || action.type === "declare-added-kong",
  );
  if (kongs.length > 0 && random.nextInt(4) === 0) {
    return randomChoice(kongs, random);
  }

  const pass = actions.find((action) => action.type === "pass");
  if (pass !== undefined) {
    return pass;
  }

  const discards = actions.filter((action) => action.type === "discard");
  if (discards.length > 0) {
    return randomChoice(discards, random);
  }

  return randomChoice(actions, random);
}

function nextAction(
  state: InternalGameState,
  random: DeterministicRandom,
): GameAction | null {
  switch (state.phase.kind) {
    case "awaiting-discard":
      return choosePlayerAction(legalActionsFor(state, state.phase.seat), random);
    case "awaiting-claims":
    case "awaiting-rob": {
      const phase = state.phase;
      const responder = phase.responders.find(
        (seat) => !phase.responses.some((response) => response.seat === seat),
      );
      if (responder === undefined) {
        throw new Error("A response phase has no pending responder");
      }
      return choosePlayerAction(legalActionsFor(state, responder), random);
    }
    case "hand-ended": {
      const [continuation] = legalSystemActions(state);
      if (continuation === undefined) {
        throw new Error("A non-terminal hand has no continuation action");
      }
      return continuation;
    }
    case "match-ended":
      return null;
  }
}

function formatFailure(
  error: unknown,
  seed: string,
  botSeed: string,
  state: InternalGameState,
  history: readonly GameAction[],
): Error {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return new Error(
    [
      `Seeded simulation failure: ${message}`,
      `seed=${seed}`,
      `botSeed=${botSeed}`,
      `profile=${JSON.stringify(state.config)}`,
      `handIndex=${String(state.handIndex)}`,
      `phase=${state.phase.kind}`,
      `actionCount=${String(history.length)}`,
      "actionHistory=",
      JSON.stringify(history, null, 2),
    ].join("\n"),
    { cause: error },
  );
}

function runCompleteGame(seed: string, profile: RulesProfile): InternalGameState {
  // RULE-DET-2: action selection uses its own seed and therefore cannot alter the wall seed.
  const botSeed = `${seed}::bot`;
  const random = createSeededRandom(botSeed);
  let state = createInitialGame(seed, profile);
  const history: GameAction[] = [];

  try {
    assertGameInvariants(state);
    while (state.phase.kind !== "match-ended") {
      if (history.length >= MAX_ACTIONS_PER_GAME) {
        throw new Error(
          `Exceeded ${String(MAX_ACTIONS_PER_GAME)} actions without completing the game`,
        );
      }
      const action = nextAction(state, random);
      if (action === null) {
        throw new Error("Simulation reached a non-terminal state without a legal action");
      }
      history.push(action);
      state = reduceGame(state, action);
      assertGameInvariants(state);
    }

    // RULE-DET-1: every complete simulation must replay exactly from seed + action log.
    const replayed = replayGame(state.record);
    if (JSON.stringify(replayed.gameRecord()) !== JSON.stringify(state.record)) {
      throw new Error("Complete-game replay record differs from the simulated record");
    }
    const expected = new MahjongGame(state);
    for (const seat of SEATS) {
      if (JSON.stringify(replayed.state(seat)) !== JSON.stringify(expected.state(seat))) {
        throw new Error(
          `Complete-game replay public state differs for seat ${String(seat)}`,
        );
      }
    }
  } catch (error) {
    throw formatFailure(error, seed, botSeed, state, history);
  }

  return state;
}

function simulationCount(): number {
  const raw = process.env.MAHJONG_SIMULATION_GAMES ?? "1000";
  const count = Number(raw);
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new RangeError(
      `MAHJONG_SIMULATION_GAMES must be a positive integer, received ${raw}`,
    );
  }
  return count;
}

describe("seeded complete-game simulation gate", () => {
  it(
    "RULE-DET-1 RULE-DET-2 completes and exactly replays every seeded scored game",
    () => {
      const count = simulationCount();

      for (let index = 0; index < count; index += 1) {
        const minimumFaan = MINIMUM_FAAN_PROFILES[index % MINIMUM_FAAN_PROFILES.length];
        if (minimumFaan === undefined) {
          throw new Error("Simulation profile rotation produced no minimum-faan value");
        }
        const profile: RulesProfile = {
          tileSetSize: index % 2 === 0 ? 136 : 144,
          minimumFaan,
          matchLength: "single-hand",
        };
        const seed = `issue-5-simulation-${String(index)}`;
        const finalState = runCompleteGame(seed, profile);

        expect(finalState.phase.kind, `seed=${seed}`).toBe("match-ended");
        expect(finalState.record.completed, `seed=${seed}`).toBe(true);
      }
    },
    SIMULATION_TIMEOUT_MS,
  );
});
