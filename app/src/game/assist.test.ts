import { describe, expect, it } from "vitest";

import { DEFAULT_RULES_PROFILE } from "@engine";
import type { GameAction, PublicGameState, PublicPlayerState, Seat, Tile, TileId } from "@engine";

import { describeWaitingTiles, isBelowMinimumFaanWin, suggestDiscard } from "./assist";
import type { SessionSnapshot } from "./session";

/**
 * assist.ts is pure, presentation-layer logic that decorates already-legal
 * options; it never decides legality itself. These fixtures build the
 * smallest valid-shaped public state and legal-action lists by hand, in the
 * same spirit as game/interaction.test.ts, rather than driving a real match.
 */

function tile(kind: Tile["kind"], n: number): Tile {
  return { id: `${kind}-${String(n)}` as TileId, kind };
}

function player(seat: Seat, concealed: readonly Tile[] | null): PublicPlayerState {
  return {
    seat,
    seatWind: (["east", "south", "west", "north"] as const)[seat],
    concealedCount: concealed?.length ?? 0,
    concealed,
    melds: [],
    bonuses: [],
    score: 0,
  };
}

function makeView(overrides: {
  readonly hand: readonly Tile[];
  readonly phase: PublicGameState["phase"];
}): PublicGameState {
  return {
    version: 1,
    viewer: 0,
    config: DEFAULT_RULES_PROFILE,
    handIndex: 0,
    dealer: 0,
    roundWind: "east",
    currentSeat: 0,
    players: [
      player(0, overrides.hand),
      player(1, null),
      player(2, null),
      player(3, null),
    ],
    wallCount: 60,
    discards: [],
    phase: overrides.phase,
  };
}

// Three complete runs, a pair, a partial run (taatsu), and one true isolate
// (dragon-red, which shares neither kind nor suit with anything else here).
// Discarding the isolate is the unique shanten-optimal move: every other
// candidate breaks a run, the pair, or the taatsu and makes the hand worse.
const HAND = [
  tile("characters-1", 1), tile("characters-2", 1), tile("characters-3", 1),
  tile("bamboo-2", 1), tile("bamboo-3", 1), tile("bamboo-4", 1),
  tile("dots-7", 1), tile("dots-8", 1), tile("dots-9", 1),
  tile("wind-east", 1), tile("wind-east", 2),
  tile("dots-1", 1), tile("dots-2", 1),
  tile("dragon-red", 1),
];

function discardTurnSnapshot(hand: readonly Tile[]): SessionSnapshot {
  const view = makeView({
    hand,
    phase: { kind: "awaiting-discard", seat: 0, source: "wall" },
  });
  const legalActions: GameAction[] = hand.map((candidate) => ({
    type: "discard",
    seat: 0,
    tileId: candidate.id,
  }));
  return {
    view,
    legalActions,
    waitingOn: null,
    lastAction: null,
    waitingTiles: [],
    structurallyComplete: false,
  };
}

describe("suggestDiscard", () => {
  it("returns null when the player owes no discard", () => {
    const snapshot = discardTurnSnapshot(HAND);
    const noDiscard: SessionSnapshot = {
      ...snapshot,
      legalActions: [{ type: "pass", seat: 0 }],
    };
    expect(suggestDiscard(noDiscard, "seed")).toBeNull();
  });

  it("suggests one of the legal discards, with a non-empty reason", () => {
    const snapshot = discardTurnSnapshot(HAND);
    const suggestion = suggestDiscard(snapshot, "seed-a");
    expect(suggestion).not.toBeNull();
    expect(HAND.some((candidate) => candidate.id === suggestion?.tileId)).toBe(true);
    expect(suggestion?.tileName.length ?? 0).toBeGreaterThan(0);
    expect(suggestion?.reason.length ?? 0).toBeGreaterThan(0);
  });

  it("is deterministic for the same seed and hand index", () => {
    const snapshot = discardTurnSnapshot(HAND);
    const first = suggestDiscard(snapshot, "same-seed");
    const second = suggestDiscard(snapshot, "same-seed");
    expect(first).toEqual(second);
  });

  it("suggests the one true isolate over a tile that still builds toward a set", () => {
    const suggestion = suggestDiscard(discardTurnSnapshot(HAND), "isolated-check");
    expect(suggestion?.tileId).toBe("dragon-red-1");
    expect(suggestion?.reason).toMatch(/isolated/);
  });
});

describe("describeWaitingTiles", () => {
  it("names each kind when the list is short", () => {
    expect(describeWaitingTiles(["dragon-red", "wind-east"])).toBe("Red Dragon, East Wind");
  });

  it("caps a long list and counts the rest", () => {
    const kinds = [
      "characters-1", "characters-2", "characters-3", "characters-4",
      "characters-5", "characters-6", "characters-7",
    ] as const;
    const description = describeWaitingTiles(kinds);
    expect(description).toContain("+2 more");
    expect(description.split(",").length).toBe(6); // 5 named + the "+2 more" tail
  });
});

describe("isBelowMinimumFaanWin", () => {
  const winAction: GameAction = { type: "win", seat: 0 };

  it("is false when the hand is not structurally complete", () => {
    const snapshot = discardTurnSnapshot(HAND);
    expect(isBelowMinimumFaanWin({ ...snapshot, structurallyComplete: false })).toBe(false);
  });

  it("is false when a legal win is already on offer", () => {
    const snapshot = discardTurnSnapshot(HAND);
    expect(
      isBelowMinimumFaanWin({
        ...snapshot,
        structurallyComplete: true,
        legalActions: [...snapshot.legalActions, winAction],
      }),
    ).toBe(false);
  });

  it("is false outside the player's own discard turn", () => {
    const snapshot = discardTurnSnapshot(HAND);
    expect(
      isBelowMinimumFaanWin({
        ...snapshot,
        structurallyComplete: true,
        view: {
          ...snapshot.view,
          phase: {
            kind: "awaiting-claims",
            discarder: 1,
            pendingTile: tile("dots-1", 99),
            youMayRespond: true,
          },
        },
      }),
    ).toBe(false);
  });

  it("is false right after the player's own claim, which can never win directly", () => {
    const snapshot = discardTurnSnapshot(HAND);
    expect(
      isBelowMinimumFaanWin({
        ...snapshot,
        structurallyComplete: true,
        view: { ...snapshot.view, phase: { kind: "awaiting-discard", seat: 0, source: "claim" } },
      }),
    ).toBe(false);
  });

  it("is true when the hand is complete, it is the player's own turn, and no win is offered", () => {
    const snapshot = discardTurnSnapshot(HAND);
    expect(isBelowMinimumFaanWin({ ...snapshot, structurallyComplete: true })).toBe(true);
  });
});
