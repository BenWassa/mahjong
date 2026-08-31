import { describe, expect, it } from "vitest";

import {
  IllegalActionError,
  type GameAction,
  type MahjongGame,
  type PublicGameState,
  type RulesProfile,
  type Seat,
  type Tile,
  type TileId,
  newGame,
  replayGame,
} from "../../src/engine/index.js";

const TEST_RULES: RulesProfile = {
  tileSetSize: 136,
  minimumFaan: 1,
  matchLength: "east-round",
};

const SEATS: readonly Seat[] = [0, 1, 2, 3];

function firstDiscard(game: MahjongGame, seat: Seat): GameAction {
  const action = game.legalActions(seat).find((candidate) => candidate.type === "discard");
  if (action === undefined) {
    throw new Error(`Expected seat ${String(seat)} to have a legal discard`);
  }
  return action;
}

function nextReplayAction(game: MahjongGame): GameAction {
  const actions = SEATS.flatMap((seat) => game.legalActions(seat));
  const action =
    actions.find((candidate) => candidate.type === "pass") ??
    actions.find((candidate) => candidate.type === "discard") ??
    actions.find((candidate) => candidate.type === "continue") ??
    actions[0];
  if (action === undefined) {
    throw new Error("Expected the non-terminal test game to have a legal action");
  }
  return action;
}

function playDeterministically(game: MahjongGame, actionCount: number): MahjongGame {
  let current = game;
  for (let index = 0; index < actionCount; index += 1) {
    current = current.act(nextReplayAction(current));
  }
  return current;
}

function tileObjects(value: unknown): Tile[] {
  const found: Tile[] = [];

  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        visit(entry);
      }
      return;
    }
    if (candidate === null || typeof candidate !== "object") {
      return;
    }

    const object = candidate as Record<string, unknown>;
    if (typeof object.id === "string" && typeof object.kind === "string") {
      found.push(object as unknown as Tile);
      return;
    }
    for (const entry of Object.values(object)) {
      visit(entry);
    }
  };

  visit(value);
  return found;
}

function topLevelKeys(state: PublicGameState): string[] {
  return Object.keys(state).sort();
}

function stateFor(
  states: readonly PublicGameState[],
  seat: Seat,
): PublicGameState {
  const state = states[seat];
  if (state === undefined) {
    throw new Error(`Public state for seat ${String(seat)} is missing`);
  }
  return state;
}

describe("public adapter determinism and replay", () => {
  it("RULE-DET-1: reproduces byte-identical views, legal actions, and records from one seed", () => {
    let first = newGame(TEST_RULES, "adapter-determinism");
    let second = newGame(TEST_RULES, "adapter-determinism");

    for (let step = 0; step < 12; step += 1) {
      for (const seat of SEATS) {
        expect(JSON.stringify(first.state(seat))).toBe(JSON.stringify(second.state(seat)));
        expect(JSON.stringify(first.legalActions(seat))).toBe(
          JSON.stringify(second.legalActions(seat)),
        );
      }
      expect(JSON.stringify(first.gameRecord())).toBe(JSON.stringify(second.gameRecord()));

      const action = nextReplayAction(first);
      expect(second.legalActions(action.type === "continue" ? 0 : action.seat)).toContainEqual(
        action,
      );
      first = first.act(action);
      second = second.act(action);
    }

    expect(JSON.stringify(first.gameRecord())).toBe(JSON.stringify(second.gameRecord()));
  });

  it("keeps prior adapters as immutable snapshots when act returns the next game", () => {
    const before = newGame(TEST_RULES, "adapter-snapshot");
    const beforeViews = SEATS.map((seat) => before.state(seat));
    const beforeRecord = before.gameRecord();
    const action = firstDiscard(before, 0);

    const after = before.act(action);

    expect(after).not.toBe(before);
    expect(SEATS.map((seat) => before.state(seat))).toEqual(beforeViews);
    expect(before.gameRecord()).toEqual(beforeRecord);
    expect(before.gameRecord().actions).toHaveLength(0);
    expect(after.gameRecord().actions).toEqual([
      { index: 0, handIndex: 0, action },
    ]);
    expect(after.state(0)).not.toEqual(beforeViews[0]);
  });

  it("returns defensive game-record copies rather than exposing adapter state", () => {
    const game = playDeterministically(newGame(TEST_RULES, "record-copy"), 3);
    const expected = game.gameRecord();
    const untrusted = game.gameRecord() as unknown as {
      seed: string;
      actions: GameAction[];
    };

    untrusted.seed = "tampered";
    untrusted.actions.length = 0;

    expect(game.gameRecord()).toEqual(expected);
    expect(game.gameRecord()).not.toBe(expected);
  });

  it("replays a game record to the exact state, legal actions, and record", () => {
    const played = playDeterministically(newGame(TEST_RULES, "exact-replay"), 24);
    const record = played.gameRecord();

    const replayed = replayGame(record);

    expect(replayed).not.toBe(played);
    expect(replayed.gameRecord()).toEqual(record);
    for (const seat of SEATS) {
      expect(replayed.state(seat)).toEqual(played.state(seat));
      expect(replayed.legalActions(seat)).toEqual(played.legalActions(seat));
    }
  });

  it("rejects a forged action without mutating the adapter snapshot or record", () => {
    const game = newGame(TEST_RULES, "forged-action");
    const beforeViews = SEATS.map((seat) => game.state(seat));
    const beforeRecord = game.gameRecord();
    const forged: GameAction = {
      type: "discard",
      seat: 0,
      tileId: "characters-1-999" as TileId,
    };

    expect(() => game.act(forged)).toThrow(IllegalActionError);
    expect(SEATS.map((seat) => game.state(seat))).toEqual(beforeViews);
    expect(game.gameRecord()).toEqual(beforeRecord);
  });
});

describe("public-state information boundary", () => {
  it("RULE-REDACT-1: reveals each viewer's concealed hand and redacts every opponent", () => {
    const game = newGame(TEST_RULES, "concealed-redaction");

    for (const viewer of SEATS) {
      const state = game.state(viewer);
      for (const player of state.players) {
        if (player.seat === viewer) {
          expect(player.concealed).not.toBeNull();
          expect(player.concealed).toHaveLength(player.concealedCount);
          expect(player.concealedCount).toBe(viewer === 0 ? 14 : 13);
        } else {
          expect(player.concealed).toBeNull();
          expect(player.concealedCount).toBe(player.seat === 0 ? 14 : 13);
        }
      }
    }
  });

  it("RULE-REDACT-2: exposes only the wall count, never wall contents or order", () => {
    const game = newGame(TEST_RULES, "wall-redaction");

    for (const viewer of SEATS) {
      const state = game.state(viewer);
      expect(state.wallCount).toBe(83);
      expect(state).not.toHaveProperty("wall");

      const ownConcealed = state.players[viewer].concealed;
      if (ownConcealed === null) {
        throw new Error(`Viewer ${String(viewer)} is missing its own concealed tiles`);
      }
      expect(tileObjects(state).map((tile) => tile.id).sort()).toEqual(
        ownConcealed.map((tile) => tile.id).sort(),
      );
    }
  });

  it("RULE-REDACT-3: excludes trusted records and hidden event data from PublicGameState", () => {
    const game = newGame(TEST_RULES, "record-redaction");
    const expectedKeys = [
      "config",
      "currentSeat",
      "dealer",
      "discards",
      "handIndex",
      "phase",
      "players",
      "roundWind",
      "version",
      "viewer",
      "wallCount",
    ].sort();

    expect(game.gameRecord().events.some((event) => event.type === "tile-drawn")).toBe(true);
    for (const viewer of SEATS) {
      const state = game.state(viewer);
      expect(topLevelKeys(state)).toEqual(expectedKeys);
      expect(state).not.toHaveProperty("record");
      expect(state).not.toHaveProperty("events");
      expect(state).not.toHaveProperty("seed");
    }
  });

  it("RULE-REDACT-4: supplies every seat the same public schema with only its perspective changed", () => {
    const game = newGame(TEST_RULES, "consumer-boundary");
    const states = SEATS.map((seat) => game.state(seat));
    const expectedKeys = topLevelKeys(stateFor(states, 0));

    for (const [viewer, state] of states.entries()) {
      expect(state.viewer).toBe(viewer);
      expect(topLevelKeys(state)).toEqual(expectedKeys);
      expect(state.config).toEqual(TEST_RULES);
      expect(state.players.map((player) => player.concealed !== null)).toEqual(
        SEATS.map((seat) => seat === viewer),
      );
    }

    for (const viewer of SEATS) {
      const publicJson = JSON.stringify(stateFor(states, viewer));
      for (const opponent of SEATS.filter((seat) => seat !== viewer)) {
        const opponentTiles = stateFor(states, opponent).players[opponent].concealed;
        if (opponentTiles === null) {
          throw new Error(`Seat ${String(opponent)} is missing its own concealed tiles`);
        }
        for (const tile of opponentTiles) {
          expect(publicJson).not.toContain(tile.id);
        }
      }
    }
  });
});
