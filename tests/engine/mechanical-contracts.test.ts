import { describe, expect, it } from "vitest";

import {
  createInitialGame,
  legalActionsFor,
  reduceGame,
} from "../../src/engine/core.js";
import { projectPublicState } from "../../src/engine/redaction.js";
import { seatWind } from "../../src/engine/seats.js";
import {
  ORDINARY_TILE_KINDS,
  createTileSet,
  isBonusTile,
  seatOwnsBonus,
} from "../../src/engine/tiles.js";
import type {
  GameAction,
  InternalGameState,
  OrdinaryTileKind,
  RulesProfile,
  Seat,
  TileKind,
} from "../../src/engine/types.js";
import { buildTestState } from "../fixtures/state-builder.js";

const CONFIG_136_ZERO: RulesProfile = {
  tileSetSize: 136,
  minimumFaan: 0,
  matchLength: "east-round",
};

const CONFIG_144_ZERO: RulesProfile = {
  tileSetSize: 144,
  minimumFaan: 0,
  matchLength: "east-round",
};

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

function quietHands(
  discard: OrdinaryTileKind,
  excluded: readonly OrdinaryTileKind[] = [],
): Partial<Record<Seat, readonly OrdinaryTileKind[]>> {
  const exclusions = [discard, ...excluded];
  return {
    0: fillTo([discard], 14, exclusions),
    1: fillTo([], 13, exclusions),
    2: fillTo([], 13, exclusions),
    3: fillTo([], 13, exclusions),
  };
}

describe("tile and bonus mechanics", () => {
  it("RULE-TILES-1 removes all eight bonus tiles in the 136-tile profile", () => {
    const tiles = createTileSet(136);

    expect(tiles).toHaveLength(136);
    expect(tiles.some(isBonusTile)).toBe(false);
  });

  it("RULE-TILES-2 derives bonus ownership from the rotating seat wind", () => {
    const ownIndexByWind = {
      east: 1,
      south: 2,
      west: 3,
      north: 4,
    } as const;

    for (const dealer of [0, 1, 2, 3] as const) {
      for (const seat of [0, 1, 2, 3] as const) {
        const wind = seatWind(seat, dealer);
        const ownIndex = ownIndexByWind[wind];
        const otherIndex = ownIndex === 4 ? 1 : ownIndex + 1;

        expect(seatOwnsBonus(wind, `flower-${String(ownIndex)}` as TileKind)).toBe(true);
        expect(seatOwnsBonus(wind, `season-${String(ownIndex)}` as TileKind)).toBe(true);
        expect(seatOwnsBonus(wind, `flower-${String(otherIndex)}` as TileKind)).toBe(false);
      }
    }
  });

  it("RULE-FLOWER-1 RULE-FLOWER-3 resolves chained bonus replacements from the tail and never offers them as discards", () => {
    const before = buildTestState({
      config: CONFIG_144_ZERO,
      concealed: quietHands("dragon-white", ["dots-9"]),
      wallHead: ["flower-1"],
      wallTail: ["dots-9", "season-2"],
    });
    const eventStart = before.record.events.length;
    const after = discardKind(before, 0, "dragon-white");
    const newEvents = after.record.events.slice(eventStart).filter(
      (event) => event.type === "tile-drawn" || event.type === "bonus-revealed",
    );

    expect(newEvents.map((event) => event.type)).toEqual([
      "tile-drawn",
      "bonus-revealed",
      "tile-drawn",
      "bonus-revealed",
      "tile-drawn",
    ]);
    expect(
      newEvents
        .filter((event) => event.type === "tile-drawn")
        .map((event) => event.tile.kind),
    ).toEqual(["flower-1", "season-2", "dots-9"]);
    expect(after.players[1].bonuses.map((tile) => tile.kind)).toEqual([
      "flower-1",
      "season-2",
    ]);
    expect(after.players[1].concealed.some(isBonusTile)).toBe(false);
    expect(after.phase).toMatchObject({
      kind: "awaiting-discard",
      seat: 1,
      drawnTile: { kind: "dots-9" },
    });
    const bonusIds = new Set(after.players[1].bonuses.map((tile) => tile.id));
    expect(
      legalActionsFor(after, 1).some(
        (action) => action.type === "discard" && bonusIds.has(action.tileId),
      ),
    ).toBe(false);
  });

  it("RULE-FLOWER-2 resolves deal bonuses in dealer-first seat order", () => {
    let bonusSeats: Seat[] | null = null;

    for (let index = 0; index < 64; index += 1) {
      const state = createInitialGame(`flower-order-${String(index)}`, CONFIG_144_ZERO);
      const seats = state.record.events
        .filter((event) => event.type === "bonus-revealed")
        .map((event) => event.seat);
      if (seats.length > 0) {
        bonusSeats = seats;
        break;
      }
    }

    expect(bonusSeats).not.toBeNull();
    const distances = (bonusSeats ?? []).map((seat) => seat);
    expect(distances).toEqual([...distances].sort((left, right) => left - right));
  });

  it("RULE-FLOWER-4 ends the hand as an exhaustive draw when a bonus replacement is unavailable", () => {
    const before = buildTestState({
      config: CONFIG_144_ZERO,
      concealed: quietHands("dragon-white"),
      bonuses: {
        0: ["flower-2", "flower-3"],
        2: ["flower-4", "season-1"],
        3: ["season-2", "season-3", "season-4"],
      },
      wallHead: ["flower-1"],
      wallCount: 1,
    });
    const after = discardKind(before, 0, "dragon-white");

    expect(after.wall).toEqual([]);
    expect(after.players[1].bonuses.map((tile) => tile.kind)).toEqual(["flower-1"]);
    expect(after.phase).toMatchObject({
      kind: "hand-ended",
      result: { outcome: "draw", reason: "wall-exhausted" },
    });
  });
});

describe("wall, claim, and Kong mechanics", () => {
  it("RULE-WALL-2 suppresses concealed and exposed Kong actions when the wall is empty", () => {
    const concealedKong = buildTestState({
      config: CONFIG_136_ZERO,
      concealed: {
        0: fillTo(
          ["wind-east", "wind-east", "wind-east", "wind-east"],
          14,
          ["wind-east"],
        ),
      },
      wallCount: 0,
    });

    expect(
      legalActionsFor(concealedKong, 0).some(
        (action) => action.type === "declare-concealed-kong",
      ),
    ).toBe(false);

    const exposedBefore = buildTestState({
      config: CONFIG_136_ZERO,
      concealed: {
        0: fillTo(["dragon-red"], 14, ["dragon-red"]),
        2: fillTo(["dragon-red", "dragon-red", "dragon-red"], 13, ["dragon-red"]),
      },
      wallCount: 0,
    });
    const awaitingClaims = discardKind(exposedBefore, 0, "dragon-red");
    const claimTypes = legalActionsFor(awaitingClaims, 2).map((action) => action.type);

    expect(claimTypes).not.toContain("claim-kong");
    expect(claimTypes).toContain("claim-pung");
  });

  it("RULE-CLAIM-3 resolves multiple Win declarations to the nearest seat regardless of response order", () => {
    const seatOneWait: OrdinaryTileKind[] = [
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
    const seatTwoWait: OrdinaryTileKind[] = [
      "characters-7",
      "characters-8",
      "characters-9",
      "bamboo-4",
      "bamboo-5",
      "bamboo-6",
      "bamboo-7",
      "bamboo-8",
      "bamboo-9",
      "dots-4",
      "dots-5",
      "dots-6",
      "dragon-red",
    ];
    const before = buildTestState({
      config: CONFIG_136_ZERO,
      concealed: {
        0: fillTo(["dragon-red"], 14, ["dragon-red"]),
        1: seatOneWait,
        2: seatTwoWait,
        3: fillTo([], 13, ["dragon-red"]),
      },
    });
    let state = discardKind(before, 0, "dragon-red");

    expect(state.phase).toMatchObject({ kind: "awaiting-claims", responders: [1, 2] });
    const fartherWin = legalAction(state, 2, "win");
    const nearerWin = legalAction(state, 1, "win");
    state = reduceGame(state, fartherWin);
    state = reduceGame(state, nearerWin);

    expect(state.phase).toMatchObject({
      kind: "hand-ended",
      result: { outcome: "win", winner: 1, fromSeat: 0, source: "discard" },
    });
  });

  it("RULE-CLAIM-4 makes conflicting Pung/Kong claims physically unrepresentable with four copies", () => {
    expect(() =>
      buildTestState({
        config: CONFIG_136_ZERO,
        concealed: {
          0: ["dragon-green"],
          1: ["dragon-green", "dragon-green"],
          2: ["dragon-green", "dragon-green"],
        },
      }),
    ).toThrow(/No physical dragon-green tile remains/);
  });

  it("RULE-ROB-2 never opens a robbery window for a concealed Kong", () => {
    const thirteenOrphansWait: OrdinaryTileKind[] = [
      "characters-1",
      "characters-9",
      "bamboo-1",
      "bamboo-9",
      "dots-1",
      "dots-9",
      "wind-east",
      "wind-south",
      "wind-west",
      "dragon-red",
      "dragon-red",
      "dragon-green",
      "dragon-white",
    ];
    const before = buildTestState({
      config: CONFIG_136_ZERO,
      concealed: {
        0: fillTo(
          ["wind-north", "wind-north", "wind-north", "wind-north"],
          14,
          ["wind-north"],
        ),
        1: thirteenOrphansWait,
      },
      wallTail: ["dots-9"],
    });
    const after = reduceGame(before, legalAction(before, 0, "declare-concealed-kong"));

    expect(after.phase.kind).not.toBe("awaiting-rob");
    expect(after.phase).toMatchObject({
      kind: "awaiting-discard",
      seat: 0,
      source: "kong-replacement",
    });
  });
});

describe("winning and information-boundary mechanics", () => {
  it.each([
    {
      name: "seven flowers",
      existing: [
        "flower-1",
        "flower-2",
        "flower-3",
        "flower-4",
        "season-1",
        "season-2",
      ] as const,
      next: "season-3" as const,
      source: "seven-flowers" as const,
    },
    {
      name: "eight immortals",
      existing: [
        "flower-1",
        "flower-2",
        "flower-3",
        "flower-4",
        "season-1",
        "season-2",
        "season-3",
      ] as const,
      next: "season-4" as const,
      source: "eight-immortals" as const,
    },
  ])(
    "RULE-WIN-5 ends immediately on $name without requiring a structural hand",
    ({ existing, next, source }) => {
      const before = buildTestState({
        config: CONFIG_144_ZERO,
        concealed: quietHands("dragon-white"),
        bonuses: { 1: existing },
        wallHead: [next],
      });
      const after = discardKind(before, 0, "dragon-white");

      expect(after.phase).toMatchObject({
        kind: "hand-ended",
        result: {
          outcome: "win",
          winner: 1,
          fromSeat: null,
          source,
          structure: null,
        },
      });
    },
  );

  it("RULE-WIN-6 offers Win without forcing it when a structurally complete hand may play on", () => {
    const complete: OrdinaryTileKind[] = [
      "characters-1",
      "characters-2",
      "characters-3",
      "characters-4",
      "characters-5",
      "characters-6",
      "bamboo-1",
      "bamboo-2",
      "bamboo-3",
      "dots-4",
      "dots-5",
      "dots-6",
      "wind-east",
      "wind-east",
    ];
    const before = buildTestState({
      config: CONFIG_136_ZERO,
      concealed: { 0: complete },
    });
    const actions = legalActionsFor(before, 0);
    const discard = actions.find((action) => action.type === "discard");

    expect(actions.some((action) => action.type === "win")).toBe(true);
    expect(discard).toBeDefined();
    if (discard === undefined) {
      throw new Error("Expected a legal discard alongside optional Win");
    }
    const after = reduceGame(before, discard);
    expect(after.record.actions.at(-1)?.action.type).toBe("discard");
  });

  it("RULE-REDACT-3 hides an opponent concealed Kong identity while preserving its existence", () => {
    const state = buildTestState({
      config: CONFIG_136_ZERO,
      melds: {
        0: [
          {
            type: "kong",
            exposure: "concealed",
            kinds: ["wind-north", "wind-north", "wind-north", "wind-north"],
          },
        ],
      },
    });
    const own = projectPublicState(state, 0).players[0].melds[0];
    const opponent = projectPublicState(state, 1).players[0].melds[0];

    expect(own?.tiles).toHaveLength(4);
    expect(opponent).toMatchObject({
      type: "kong",
      exposure: "concealed",
      tiles: null,
      tileCount: 4,
      claimedFrom: null,
    });
    for (const tile of state.players[0].melds[0]?.tiles ?? []) {
      expect(JSON.stringify(projectPublicState(state, 1))).not.toContain(tile.id);
    }
  });
});
