import { describe, expect, it } from "vitest";

import { createHeuristicBot } from "../../src/bots/index.js";
import type { GameAction, TileKind } from "../../src/engine/types.js";
import {
  buildBotClaimPosition,
  buildBotDiscardPosition,
  type BotPosition,
} from "../fixtures/bot-position.js";

function choose(position: BotPosition, seed = "fixture-seed"): GameAction {
  return createHeuristicBot({ seat: position.publicState.viewer, seed }).chooseAction(
    position.publicState,
    position.legalActions,
  );
}

function chosenDiscardKind(position: BotPosition, seed?: string): TileKind {
  const action = choose(position, seed);
  expect(action.type).toBe("discard");
  if (action.type !== "discard") {
    throw new Error(`Expected discard, received ${action.type}`);
  }
  const tile = position.publicState.players[position.publicState.viewer].concealed?.find(
    (candidate) => candidate.id === action.tileId,
  );
  if (tile === undefined) {
    throw new Error(`Bot selected a tile absent from its public hand: ${action.tileId}`);
  }
  return tile.kind;
}

describe("heuristic bot benchmark positions", () => {
  it("always takes a legal self-drawn win", () => {
    const position = buildBotDiscardPosition(0, [
      "characters-2", "characters-2", "characters-2",
      "bamboo-3", "bamboo-3", "bamboo-3",
      "dots-4", "dots-4", "dots-4",
      "characters-7", "characters-7", "characters-7",
      "dragon-red", "dragon-red",
    ]);

    expect(position.legalActions.some((action) => action.type === "win")).toBe(true);
    expect(choose(position)).toEqual({ type: "win", seat: 0 });
  });

  it("always takes a legal discard win", () => {
    const waiting = [
      "characters-2", "characters-2", "characters-2",
      "bamboo-3", "bamboo-3", "bamboo-3",
      "dots-4", "dots-4", "dots-4",
      "characters-7", "characters-7", "characters-7",
      "dragon-red",
    ] as const;
    const position = buildBotClaimPosition(
      1,
      0,
      "dragon-red",
      { 0: ["dragon-red"], 1: waiting },
      { wallCount: 40 },
    );

    expect(position.legalActions.some((action) => action.type === "win")).toBe(true);
    expect(choose(position)).toEqual({ type: "win", seat: 1 });
  });

  it("discards an isolated honor instead of breaking four useful groups and a pair", () => {
    const position = buildBotDiscardPosition(0, [
      "characters-1", "characters-2", "characters-3",
      "characters-4", "characters-5", "characters-6",
      "characters-7", "characters-8", "characters-9",
      "bamboo-2", "bamboo-2",
      "dots-4", "dots-5",
      "dragon-white",
    ]);

    expect(chosenDiscardKind(position)).toBe("dragon-white");
  });

  it("claims a Chow when it materially advances a fragmented hand", () => {
    const position = buildBotClaimPosition(1, 0, "dots-6", {
      0: ["dots-6"],
      1: [
        "characters-1", "characters-2", "characters-3",
        "bamboo-4", "bamboo-5", "bamboo-6",
        "dots-4", "dots-5",
        "characters-8", "characters-8",
        "wind-east", "wind-south", "dragon-white",
      ],
    });

    expect(position.legalActions.some((action) => action.type === "claim-chow")).toBe(true);
    expect(choose(position).type).toBe("claim-chow");
  });

  it("uses the supplied seed deterministically for equivalent choices", () => {
    const position = buildBotDiscardPosition(2, [
      "characters-1", "characters-2", "characters-3",
      "bamboo-1", "bamboo-2", "bamboo-3",
      "dots-1", "dots-2", "dots-3",
      "characters-7", "characters-8",
      "wind-east", "wind-south", "dragon-white",
    ]);

    const first = choose(position, "stable-bot-seed");
    const second = choose(position, "stable-bot-seed");
    expect(second).toEqual(first);
    expect(position.legalActions).toContainEqual(first);
  });

  it("late in a hand prefers a previously discarded safe tile over a live isolated honor", () => {
    const base = buildBotDiscardPosition(
      3,
      [
        "characters-1", "characters-2", "characters-3",
        "bamboo-1", "bamboo-2", "bamboo-3",
        "dots-1", "dots-2", "dots-3",
        "characters-7", "characters-8",
        "wind-east", "wind-south", "dragon-white",
      ],
      {
        discards: [
          { seat: 0, kind: "wind-east" },
          { seat: 1, kind: "wind-east" },
          { seat: 2, kind: "wind-east" },
        ],
      },
    );
    // The trusted fixture remains conservation-valid; the benchmark view
    // places that same visible table in a late-hand decision window.
    const position: BotPosition = {
      ...base,
      publicState: { ...base.publicState, wallCount: 16 },
    };

    expect(chosenDiscardKind(position)).toBe("wind-east");
  });
});
