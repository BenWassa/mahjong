import { describe, expect, it } from "vitest";

import {
  InvariantViolationError,
  assertGameInvariants,
} from "../../src/engine/invariants.js";
import type {
  InternalGameState,
  PlayerState,
  RecordedAction,
  Tile,
} from "../../src/engine/types.js";
import { buildTestState } from "../fixtures/state-builder.js";

function replacePlayer(
  state: InternalGameState,
  index: number,
  player: PlayerState,
): InternalGameState {
  const players = [...state.players];
  players[index] = player;
  return {
    ...state,
    players: players as unknown as InternalGameState["players"],
  };
}

describe("engine invariant corruption corpus", () => {
  it("accepts a canonical fixture before corruption", () => {
    expect(() => {
      assertGameInvariants(buildTestState());
    }).not.toThrow();
  });

  it("detects one physical tile appearing in two zones", () => {
    const state = buildTestState({ concealed: { 0: ["characters-1"] } });
    const tile = state.players[0].concealed[0];
    if (tile === undefined) {
      throw new Error("Fixture did not allocate the expected concealed tile");
    }
    const corrupted = {
      ...state,
      wall: [...state.wall, tile],
    };

    expect(() => {
      assertGameInvariants(corrupted);
    }).toThrow(InvariantViolationError);
    expect(() => {
      assertGameInvariants(corrupted);
    }).toThrow(/appears in both/);
  });

  it("detects a canonical physical ID whose tile kind was forged", () => {
    const state = buildTestState({ concealed: { 0: ["characters-1"] } });
    const original = state.players[0].concealed[0];
    if (original === undefined) {
      throw new Error("Fixture did not allocate the expected concealed tile");
    }
    const forged: Tile = { ...original, kind: "dots-9" };
    const player = {
      ...state.players[0],
      concealed: [forged],
    };
    const corrupted = replacePlayer(state, 0, player);

    expect(() => {
      assertGameInvariants(corrupted);
    }).toThrow(/expected characters-1/);
  });

  it("detects a player tuple whose seat identity no longer matches its index", () => {
    const state = buildTestState();
    const player = { ...state.players[0], seat: 1 as const };
    const corrupted = replacePlayer(state, 0, player);

    expect(() => {
      assertGameInvariants(corrupted);
    }).toThrow(/tuple index 0 contains seat 1/);
  });

  it("detects discard-ledger index drift", () => {
    const state = buildTestState({ discards: [{ seat: 0, kind: "characters-1" }] });
    const discard = state.discards[0];
    if (discard === undefined) {
      throw new Error("Fixture did not allocate the expected discard");
    }
    const corrupted = {
      ...state,
      discards: [{ ...discard, index: 7 }, ...state.discards.slice(1)],
    };

    expect(() => {
      assertGameInvariants(corrupted);
    }).toThrow(/position 0 carries index 7/);
  });

  it("detects a claimed discard that is not backed by a compatible exposed meld", () => {
    const state = buildTestState({
      melds: {
        1: [
          {
            type: "pung",
            exposure: "exposed",
            kinds: ["dragon-red", "dragon-red", "dragon-red"],
            claimedFrom: 0,
          },
        ],
      },
    });
    const claimed = state.discards.find((discard) => discard.claimedBy === 1);
    if (claimed === undefined) {
      throw new Error("Fixture did not create the claimed discard reference");
    }
    const corrupted = {
      ...state,
      discards: state.discards.map((discard) =>
        discard.index === claimed.index ? { ...discard, claimType: "chow" as const } : discard,
      ),
    };

    expect(() => {
      assertGameInvariants(corrupted);
    }).toThrow(/compatible exposed meld/);
  });

  it("detects game-record action index drift", () => {
    const state = buildTestState();
    const recorded: RecordedAction = {
      index: 4,
      handIndex: state.handIndex,
      action: { type: "continue" },
    };
    const corrupted = {
      ...state,
      record: { ...state.record, actions: [recorded] },
    };

    expect(() => {
      assertGameInvariants(corrupted);
    }).toThrow(/action position 0 carries index 4/);
  });

  it("detects a bonus tile moved into a concealed zone", () => {
    const state = buildTestState({
      config: { tileSetSize: 144, minimumFaan: 0, matchLength: "east-round" },
      bonuses: { 0: ["flower-1"] },
    });
    const bonus = state.players[0].bonuses[0];
    if (bonus === undefined) {
      throw new Error("Fixture did not allocate the expected bonus tile");
    }
    const player = {
      ...state.players[0],
      bonuses: [],
      concealed: [...state.players[0].concealed, bonus],
    };
    const corrupted = replacePlayer(state, 0, player);

    expect(() => {
      assertGameInvariants(corrupted);
    }).toThrow(/illegally present/);
  });
});
