import { describe, expect, it } from "vitest";

import {
  createInitialGame,
  legalActionsFor,
  reduceGame,
} from "../../src/engine/core.js";
import { assertGameInvariants } from "../../src/engine/invariants.js";
import { ORDINARY_TILE_KINDS } from "../../src/engine/tiles.js";
import type {
  DrawHandResult,
  GameAction,
  InternalGameState,
  OrdinaryTileKind,
  RulesProfile,
  Seat,
  WinHandResult,
} from "../../src/engine/types.js";
import { buildTestState } from "../fixtures/state-builder.js";

const CHARACTER_KINDS = ORDINARY_TILE_KINDS.filter((kind) =>
  kind.startsWith("characters-"),
);

function fillTo(
  prefix: readonly OrdinaryTileKind[],
  count: number,
  excluded: readonly OrdinaryTileKind[] = [],
): OrdinaryTileKind[] {
  const blocked = new Set([...prefix, ...excluded]);
  const fillers = ORDINARY_TILE_KINDS.filter((kind) => !blocked.has(kind));
  if (prefix.length > count || fillers.length < count - prefix.length) {
    throw new Error(`Cannot fill ${String(prefix.length)} tiles to ${String(count)}`);
  }
  return [...prefix, ...fillers.slice(0, count - prefix.length)];
}

function legalAction<T extends GameAction["type"]>(
  state: InternalGameState,
  seat: Seat,
  type: T,
): Extract<GameAction, { readonly type: T }> {
  const action = legalActionsFor(state, seat).find((candidate) => candidate.type === type);
  if (action === undefined) {
    throw new Error(`Expected ${type} to be legal for seat ${String(seat)}`);
  }
  return action as Extract<GameAction, { readonly type: T }>;
}

function discardKind(
  state: InternalGameState,
  seat: Seat,
  kind: OrdinaryTileKind,
): InternalGameState {
  const tile = state.players[seat].concealed.find((candidate) => candidate.kind === kind);
  if (tile === undefined) {
    throw new Error(`Seat ${String(seat)} does not hold ${kind}`);
  }
  return reduceGame(state, { type: "discard", seat, tileId: tile.id });
}

function physicalZoneCount(state: InternalGameState): number {
  return (
    state.wall.length +
    state.players.reduce(
      (total, player) =>
        total +
        player.concealed.length +
        player.bonuses.length +
        player.melds.reduce((meldTotal, meld) => meldTotal + meld.tiles.length, 0),
      0,
    ) +
    state.discards.filter((discard) => discard.claimedBy === null).length
  );
}

describe("deal and ordinary turn transitions", () => {
  it.each([
    { tileSetSize: 136 as const, expectedWallPlusBonuses: 83 },
    { tileSetSize: 144 as const, expectedWallPlusBonuses: 91 },
  ])(
    "RULE-DEAL-1 RULE-DEAL-2 RULE-DEAL-3 conserves the $tileSetSize-tile deal",
    ({ tileSetSize, expectedWallPlusBonuses }) => {
      const state = createInitialGame(`deal-${String(tileSetSize)}`, {
        tileSetSize,
        minimumFaan: 1,
        matchLength: "east-round",
      });
      const dealDraws = state.record.events.filter(
        (event) => event.type === "tile-drawn" && event.source === "deal",
      );
      const bonusCount = state.players.reduce(
        (total, player) => total + player.bonuses.length,
        0,
      );

      expect(dealDraws).toHaveLength(53);
      expect(state.players.map((player) => player.concealed.length)).toEqual([14, 13, 13, 13]);
      expect(state.wall.length + bonusCount).toBe(expectedWallPlusBonuses);
      expect(physicalZoneCount(state)).toBe(tileSetSize);
      expect(() => {
        assertGameInvariants(state);
      }).not.toThrow();
    },
  );

  it("RULE-TURN-1 RULE-CLAIM-5 automatically draws for the next seat when nothing is claimable", () => {
    const concealed = {
      0: fillTo(["characters-5"], 14, CHARACTER_KINDS),
      1: fillTo([], 13, CHARACTER_KINDS),
      2: fillTo([], 13, CHARACTER_KINDS),
      3: fillTo([], 13, CHARACTER_KINDS),
    };
    const before = buildTestState({ concealed, wallHead: ["characters-1"] });
    const after = discardKind(before, 0, "characters-5");

    expect(after.phase).toMatchObject({
      kind: "awaiting-discard",
      seat: 1,
      source: "wall",
    });
    expect(after.players[1].concealed).toHaveLength(14);
    expect(after.players[1].concealed.at(-1)?.kind).toBe("characters-1");
    expect(after.wall).toHaveLength(before.wall.length - 1);
    expect(after.discards.at(-1)).toMatchObject({
      seat: 0,
      claimedBy: null,
      claimType: null,
      tile: { kind: "characters-5" },
    });
  });

  it("RULE-CLAIM-1 offers Chow only to the next seat and forms the exposed run", () => {
    const concealed = {
      0: fillTo(["characters-5"], 14, CHARACTER_KINDS),
      1: fillTo(["characters-4", "characters-6"], 13, CHARACTER_KINDS),
      2: fillTo(["characters-4", "characters-6"], 13, CHARACTER_KINDS),
      3: fillTo([], 13, CHARACTER_KINDS),
    };
    const awaitingClaims = discardKind(buildTestState({ concealed }), 0, "characters-5");

    expect(awaitingClaims.phase).toMatchObject({ kind: "awaiting-claims", responders: [1] });
    expect(legalActionsFor(awaitingClaims, 1).map((action) => action.type)).toContain("claim-chow");
    expect(legalActionsFor(awaitingClaims, 2)).toEqual([]);

    const claimed = reduceGame(awaitingClaims, legalAction(awaitingClaims, 1, "claim-chow"));
    expect(claimed.phase).toMatchObject({
      kind: "awaiting-discard",
      seat: 1,
      source: "claim",
    });
    expect(claimed.players[1].melds.at(-1)).toMatchObject({
      type: "chow",
      exposure: "exposed",
      claimedFrom: 0,
    });
    expect(claimed.players[1].melds.at(-1)?.tiles.map((tile) => tile.kind)).toEqual([
      "characters-4",
      "characters-5",
      "characters-6",
    ]);
    expect(claimed.discards.at(-1)).toMatchObject({ claimedBy: 1, claimType: "chow" });
  });
});

describe("claim arbitration", () => {
  it.each([
    { higherType: "claim-pung" as const, responseOrder: ["lower", "higher"] as const },
    { higherType: "claim-pung" as const, responseOrder: ["higher", "lower"] as const },
    { higherType: "claim-kong" as const, responseOrder: ["lower", "higher"] as const },
    { higherType: "claim-kong" as const, responseOrder: ["higher", "lower"] as const },
  ])(
    "RULE-CLAIM-2 resolves $higherType over Chow for $responseOrder response order",
    ({ higherType, responseOrder }) => {
      const matchingCount = higherType === "claim-kong" ? 3 : 2;
      const concealed = {
        0: fillTo(["characters-5"], 14, CHARACTER_KINDS),
        1: fillTo(["characters-4", "characters-6"], 13, CHARACTER_KINDS),
        2: fillTo(
          Array.from({ length: matchingCount }, () => "characters-5" as const),
          13,
          CHARACTER_KINDS,
        ),
        3: fillTo([], 13, CHARACTER_KINDS),
      };
      let state = discardKind(buildTestState({ concealed }), 0, "characters-5");
      const lower = legalAction(state, 1, "claim-chow");
      const higher = legalAction(state, 2, higherType);

      for (const response of responseOrder) {
        state = reduceGame(state, response === "lower" ? lower : higher);
      }

      expect(state.players[2].melds.at(-1)?.type).toBe(
        higherType === "claim-kong" ? "kong" : "pung",
      );
      expect(state.discards.at(-1)).toMatchObject({
        claimedBy: 2,
        claimType: higherType === "claim-kong" ? "kong" : "pung",
      });
      expect(state.phase).toMatchObject({
        kind: "awaiting-discard",
        seat: 2,
        source: higherType === "claim-kong" ? "kong-replacement" : "claim",
      });
    },
  );

  it("RULE-CLAIM-2 gives a structural Win priority over Pung when minimumFaan is 0", () => {
    const config: RulesProfile = {
      tileSetSize: 136,
      minimumFaan: 0,
      matchLength: "east-round",
    };
    const winningWait: OrdinaryTileKind[] = [
      "characters-1",
      "characters-2",
      "characters-3",
      "characters-4",
      "characters-5",
      "characters-6",
      "bamboo-1",
      "bamboo-2",
      "bamboo-3",
      "dots-1",
      "dots-2",
      "dots-3",
      "dragon-red",
    ];
    const concealed = {
      0: fillTo(["dragon-red"], 14, ["dragon-red"]),
      1: fillTo(["dragon-red", "dragon-red"], 13, ["dragon-red"]),
      2: winningWait,
      3: fillTo([], 13, ["dragon-red"]),
    };
    let state = discardKind(buildTestState({ config, concealed }), 0, "dragon-red");
    const pung = legalAction(state, 1, "claim-pung");
    const win = legalAction(state, 2, "win");

    state = reduceGame(state, pung);
    state = reduceGame(state, win);

    expect(state.phase).toMatchObject({
      kind: "hand-ended",
      result: {
        outcome: "win",
        winner: 2,
        fromSeat: 0,
        source: "discard",
        winningTile: { kind: "dragon-red" },
      },
    });
    expect(state.players[1].melds).toEqual([]);
  });
});

describe("kong transitions", () => {
  it("RULE-KONG-1 RULE-KONG-2 declares a four-tile concealed Kong and draws from the tail", () => {
    const concealed = {
      0: fillTo(
        ["wind-east", "wind-east", "wind-east", "wind-east"],
        14,
        ["wind-east"],
      ),
      1: fillTo([], 13, ["wind-east"]),
      2: fillTo([], 13, ["wind-east"]),
      3: fillTo([], 13, ["wind-east"]),
    };
    const before = buildTestState({ concealed, wallTail: ["dots-9"] });
    const after = reduceGame(before, legalAction(before, 0, "declare-concealed-kong"));

    expect(after.players[0].melds).toHaveLength(1);
    expect(after.players[0].melds[0]).toMatchObject({
      type: "kong",
      exposure: "concealed",
      claimedFrom: null,
    });
    expect(after.players[0].melds[0]?.tiles).toHaveLength(4);
    expect(after.players[0].concealed.at(-1)?.kind).toBe("dots-9");
    expect(after.wall).toHaveLength(before.wall.length - 1);
    expect(after.phase).toMatchObject({
      kind: "awaiting-discard",
      seat: 0,
      source: "kong-replacement",
      drawnTile: { kind: "dots-9" },
    });
  });

  it("RULE-KONG-1 forms a four-tile exposed Kong from a discard before replacement", () => {
    const concealed = {
      0: fillTo(["wind-east"], 14, ["wind-east"]),
      1: fillTo([], 13, ["wind-east"]),
      2: fillTo(["wind-east", "wind-east", "wind-east"], 13, ["wind-east"]),
      3: fillTo([], 13, ["wind-east"]),
    };
    const discarded = discardKind(
      buildTestState({ concealed, wallTail: ["dots-9"] }),
      0,
      "wind-east",
    );
    const after = reduceGame(discarded, legalAction(discarded, 2, "claim-kong"));

    expect(after.players[2].melds.at(-1)).toMatchObject({
      type: "kong",
      exposure: "exposed",
      claimedFrom: 0,
    });
    expect(after.players[2].melds.at(-1)?.tiles).toHaveLength(4);
    expect(after.players[2].concealed.at(-1)?.kind).toBe("dots-9");
    expect(after.discards.at(-1)).toMatchObject({ claimedBy: 2, claimType: "kong" });
  });

  it("RULE-KONG-3 promotes an exposed Pung in place and draws a replacement", () => {
    const concealed = {
      0: fillTo(["wind-east"], 11, ["wind-east"]),
      1: fillTo([], 13, ["wind-east"]),
      2: fillTo([], 13, ["wind-east"]),
      3: fillTo([], 13, ["wind-east"]),
    };
    const before = buildTestState({
      concealed,
      melds: {
        0: [
          {
            type: "pung",
            exposure: "exposed",
            kinds: ["wind-east", "wind-east", "wind-east"],
            claimedFrom: 3,
          },
        ],
      },
      wallTail: ["dots-9"],
    });
    const after = reduceGame(before, legalAction(before, 0, "declare-added-kong"));

    expect(after.players[0].melds).toHaveLength(1);
    expect(after.players[0].melds[0]).toMatchObject({
      type: "kong",
      exposure: "exposed",
      claimedFrom: 3,
    });
    expect(after.players[0].melds[0]?.tiles).toHaveLength(4);
    expect(after.players[0].concealed.at(-1)?.kind).toBe("dots-9");
    expect(after.phase).toMatchObject({ kind: "awaiting-discard", source: "kong-replacement" });
  });

  it("RULE-ROB-1 RULE-ROB-3 rolls a robbed added Kong back to its exposed Pung", () => {
    const config: RulesProfile = {
      tileSetSize: 136,
      minimumFaan: 0,
      matchLength: "east-round",
    };
    const winningWait: OrdinaryTileKind[] = [
      "characters-4",
      "characters-6",
      "bamboo-1",
      "bamboo-2",
      "bamboo-3",
      "bamboo-4",
      "bamboo-5",
      "bamboo-6",
      "dots-1",
      "dots-2",
      "dots-3",
      "wind-east",
      "wind-east",
    ];
    const concealed = {
      0: fillTo(["characters-5"], 11, CHARACTER_KINDS),
      1: winningWait,
      2: fillTo([], 13, CHARACTER_KINDS),
      3: fillTo([], 13, CHARACTER_KINDS),
    };
    const before = buildTestState({
      config,
      concealed,
      melds: {
        0: [
          {
            type: "pung",
            exposure: "exposed",
            kinds: ["characters-5", "characters-5", "characters-5"],
            claimedFrom: 3,
          },
        ],
      },
    });
    const awaitingRob = reduceGame(before, legalAction(before, 0, "declare-added-kong"));

    expect(awaitingRob.phase).toMatchObject({
      kind: "awaiting-rob",
      declarer: 0,
      responders: [1],
    });
    const after = reduceGame(awaitingRob, legalAction(awaitingRob, 1, "win"));

    expect(after.players[0].melds).toHaveLength(1);
    expect(after.players[0].melds[0]).toMatchObject({
      type: "pung",
      exposure: "exposed",
      claimedFrom: 3,
    });
    expect(after.players[0].melds[0]?.tiles).toHaveLength(3);
    expect(after.players[0].concealed.some((tile) => tile.kind === "characters-5")).toBe(false);
    expect(after.phase).toMatchObject({
      kind: "hand-ended",
      result: {
        outcome: "win",
        winner: 1,
        fromSeat: 0,
        source: "robbed-kong",
        winningTile: { kind: "characters-5" },
      },
    });
    expect(after.record.events.some((event) => event.type === "kong-robbed")).toBe(true);
    expect(
      after.record.events.some(
        (event) => event.type === "meld-declared" && event.meld.type === "kong",
      ),
    ).toBe(false);
  });
});

function winResult(winner: Seat, dealer: Seat): WinHandResult {
  return {
    outcome: "win",
    handIndex: 0,
    roundWind: "east",
    dealer,
    winner,
    fromSeat: null,
    source: "self-draw",
    winningTile: { id: "characters-2-1", kind: "characters-2" },
    structure: {
      type: "standard",
      pair: "dots-2",
      sets: [
        { type: "chow", tiles: ["characters-1", "characters-2", "characters-3"] },
        { type: "chow", tiles: ["characters-4", "characters-5", "characters-6"] },
        { type: "chow", tiles: ["bamboo-1", "bamboo-2", "bamboo-3"] },
        { type: "chow", tiles: ["dots-4", "dots-5", "dots-6"] },
      ],
    },
    circumstances: {
      lastWallTile: false,
      lastDiscard: false,
      openingDealerHand: false,
      dealerFirstDiscard: false,
    },
    scoring: null,
  };
}

function drawResult(dealer: Seat): DrawHandResult {
  return {
    outcome: "draw",
    handIndex: 0,
    roundWind: "east",
    dealer,
    reason: "wall-exhausted",
    scoring: null,
  };
}

describe("hand and round progression", () => {
  it.each([
    {
      name: "dealer win continues the dealership",
      result: winResult(0, 0),
      expectedDealer: 0 as Seat,
    },
    {
      name: "non-dealer win rotates the dealership",
      result: winResult(2, 0),
      expectedDealer: 1 as Seat,
    },
    {
      name: "exhaustive draw rotates the dealership",
      result: drawResult(0),
      expectedDealer: 1 as Seat,
    },
  ])("RULE-PROG-1 RULE-DRAW-2 RULE-DRAW-3 $name", ({ result, expectedDealer }) => {
    const terminal = buildTestState({
      dealer: 0,
      phase: { kind: "hand-ended", result },
    });
    const next = reduceGame(terminal, { type: "continue" });

    expect(next.handIndex).toBe(1);
    expect(next.dealer).toBe(expectedDealer);
    expect(next.roundWind).toBe("east");
    expect(next.phase).toMatchObject({ kind: "awaiting-discard", seat: expectedDealer });
  });

  it("RULE-PROG-2 RULE-PROG-3 ends an East round when the deal returns to its starter", () => {
    const result = winResult(0, 3);
    const terminal = buildTestState({
      dealer: 3,
      roundStarter: 0,
      phase: { kind: "hand-ended", result },
    });
    const ended = reduceGame(terminal, { type: "continue" });

    expect(ended.phase.kind).toBe("match-ended");
    expect(ended.record.completed).toBe(true);
    expect(ended.record.events.at(-1)).toEqual({ type: "match-ended", handIndex: 0 });
  });

  it("RULE-WALL-1 RULE-DRAW-1 ends in an exhaustive draw when the next draw is unavailable", () => {
    const concealed = {
      0: fillTo(["characters-5"], 14, CHARACTER_KINDS),
      1: fillTo([], 13, CHARACTER_KINDS),
      2: fillTo([], 13, CHARACTER_KINDS),
      3: fillTo([], 13, CHARACTER_KINDS),
    };
    const before = buildTestState({
      concealed,
      scores: [12, -4, -3, -5],
      wallCount: 0,
      phase: {
        kind: "awaiting-discard",
        seat: 0,
        source: "wall",
        drawnTile: null,
        lastWallTile: true,
      },
    });
    const after = discardKind(before, 0, "characters-5");

    expect(after.wall).toEqual([]);
    expect(after.phase).toMatchObject({
      kind: "hand-ended",
      result: {
        outcome: "draw",
        reason: "wall-exhausted",
        scoring: null,
      },
    });
    expect(after.players.map((player) => player.score)).toEqual([12, -4, -3, -5]);
    expect(after.record.hands.at(-1)).toMatchObject({ outcome: "draw", reason: "wall-exhausted" });
  });
});
