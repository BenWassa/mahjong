import { describe, expect, it } from "vitest";

import { createInitialGame, legalActionsFor, reduceGame } from "../../src/engine/core.js";
import {
  createInitialGame as createScoredGame,
  legalActionsFor as scoredLegalActionsFor,
  reduceGame as reduceScoredGame,
} from "../../src/engine/scored-core.js";
import {
  BONUS_TILE_KINDS,
  ORDINARY_TILE_KINDS,
  createTileSet,
  isBonusKind,
  seatOwnsBonus,
} from "../../src/engine/tiles.js";
import { seatWind } from "../../src/engine/seats.js";
import { projectPublicState } from "../../src/engine/redaction.js";
import { assertGameInvariants } from "../../src/engine/invariants.js";
import { buildTestState } from "../fixtures/state-builder.js";
import type {
  GameAction,
  InternalGameState,
  OrdinaryTileKind,
  RulesProfile,
  Seat,
  TileKind,
  WinHandResult,
} from "../../src/engine/types.js";

const PROFILE_144: RulesProfile = { tileSetSize: 144, minimumFaan: 1, matchLength: "east-round" };
const PROFILE_144_OPEN: RulesProfile = { ...PROFILE_144, minimumFaan: 0 };

const CHARACTER_KINDS = ORDINARY_TILE_KINDS.filter((kind) => kind.startsWith("characters-"));

function fillTo(
  prefix: readonly OrdinaryTileKind[],
  count: number,
  excluded: readonly OrdinaryTileKind[] = [],
): OrdinaryTileKind[] {
  const blocked = new Set([...prefix, ...excluded]);
  const fillers = ORDINARY_TILE_KINDS.filter((kind) => !blocked.has(kind));
  return [...prefix, ...fillers.slice(0, count - prefix.length)];
}

function actionOfType<T extends GameAction["type"]>(
  actions: readonly GameAction[],
  type: T,
): Extract<GameAction, { type: T }> {
  const found = actions.find((action) => action.type === type);
  if (found === undefined) {
    throw new Error(`No ${type} action was legal`);
  }
  return found as Extract<GameAction, { type: T }>;
}

function discardKind(state: InternalGameState, seat: Seat, kind: TileKind): InternalGameState {
  const tile = state.players[seat].concealed.find((candidate) => candidate.kind === kind);
  if (tile === undefined) {
    throw new Error(`Seat ${String(seat)} does not hold ${kind}`);
  }
  return reduceGame(state, { type: "discard", seat, tileId: tile.id });
}

/** The first concealed tile of a seat, for fixtures that just need any discard. */
function firstConcealedKind(state: InternalGameState, seat: Seat): TileKind {
  const tile = state.players[seat].concealed[0];
  if (tile === undefined) {
    throw new Error(`Seat ${String(seat)} holds no tiles`);
  }
  return tile.kind;
}

/** The physical id of a kind in a seat's hand. */
function tileIdOfKind(state: InternalGameState, seat: Seat, kind: TileKind): string {
  const tile = state.players[seat].concealed.find((candidate) => candidate.kind === kind);
  if (tile === undefined) {
    throw new Error(`Seat ${String(seat)} does not hold ${kind}`);
  }
  return tile.id;
}

/**
 * Declines every pending claim so play reaches the next draw. Fixture hands
 * share tile kinds, so a discard usually opens a claim window; these tests are
 * about what happens on the draw that follows it.
 */
function passAllClaims(
  state: InternalGameState,
  reducer: (from: InternalGameState, action: GameAction) => InternalGameState = reduceGame,
): InternalGameState {
  let current = state;
  let guard = 0;
  while (current.phase.kind === "awaiting-claims" || current.phase.kind === "awaiting-rob") {
    if (guard > 8) {
      throw new Error("A claim window did not resolve");
    }
    guard += 1;
    const phase = current.phase;
    const pending = phase.responders.find(
      (seat) => !phase.responses.some((response) => response.seat === seat),
    );
    if (pending === undefined) {
      throw new Error("A claim window had no pending responder");
    }
    current = reducer(current, { type: "pass", seat: pending });
  }
  return current;
}

/** Discards, then declines every claim, leaving the next seat having drawn. */
function discardAndPass(
  state: InternalGameState,
  seat: Seat,
  kind: TileKind,
  reducer: (from: InternalGameState, action: GameAction) => InternalGameState = reduceGame,
): InternalGameState {
  const tile = state.players[seat].concealed.find((candidate) => candidate.kind === kind);
  if (tile === undefined) {
    throw new Error(`Seat ${String(seat)} does not hold ${kind}`);
  }
  return passAllClaims(reducer(state, { type: "discard", seat, tileId: tile.id }), reducer);
}

// ---------------------------------------------------------------------------

describe("tile set", () => {
  it("RULE-TILES-1: 144 is four copies of every ordinary kind plus one of each bonus", () => {
    const full = createTileSet(144);
    expect(full).toHaveLength(144);
    const counts = new Map<TileKind, number>();
    for (const tile of full) {
      counts.set(tile.kind, (counts.get(tile.kind) ?? 0) + 1);
    }
    for (const kind of ORDINARY_TILE_KINDS) {
      expect(counts.get(kind), kind).toBe(4);
    }
    for (const kind of BONUS_TILE_KINDS) {
      expect(counts.get(kind), kind).toBe(1);
    }

    const reduced = createTileSet(136);
    expect(reduced).toHaveLength(136);
    expect(reduced.some((tile) => isBonusKind(tile.kind))).toBe(false);
  });

  it("RULE-TILES-2: bonus ownership follows the seat wind, not the player", () => {
    // East owns flower-1 and season-1, South flower-2, and so on.
    expect(seatOwnsBonus("east", "flower-1")).toBe(true);
    expect(seatOwnsBonus("east", "season-1")).toBe(true);
    expect(seatOwnsBonus("east", "flower-2")).toBe(false);
    expect(seatOwnsBonus("north", "season-4")).toBe(true);

    // Seat 1 is South under dealer 0 and East under dealer 1, so the bonus it
    // owns changes with the dealership rather than staying with the player.
    expect(seatWind(1, 0)).toBe("south");
    expect(seatOwnsBonus(seatWind(1, 0), "flower-2")).toBe(true);
    expect(seatWind(1, 1)).toBe("east");
    expect(seatOwnsBonus(seatWind(1, 1), "flower-1")).toBe(true);
  });
});

describe("bonus tiles", () => {
  it("RULE-FLOWER-1/3: a drawn bonus tile is revealed, replaced, and never held", () => {
    const state = buildTestState({
      config: PROFILE_144,
      concealed: {
        0: fillTo([], 13, CHARACTER_KINDS),
        1: fillTo([], 13, CHARACTER_KINDS),
        2: fillTo([], 13, CHARACTER_KINDS),
        3: fillTo([], 13, CHARACTER_KINDS),
      },
      // Seat 1 draws a flower, then takes its replacement from the tail.
      wallHead: ["flower-2"],
      wallTail: ["characters-1"],
      phase: {
        kind: "awaiting-discard",
        seat: 0,
        source: "deal",
        drawnTile: null,
        lastWallTile: false,
      },
    });
    const wallBefore = state.wall.length;
    const after = discardAndPass(state, 0, firstConcealedKind(state, 0));

    expect(after.players[1].bonuses.map((tile) => tile.kind)).toEqual(["flower-2"]);
    expect(after.players[1].concealed.some((tile) => isBonusKind(tile.kind))).toBe(false);
    expect(after.players[1].concealed).toHaveLength(14);
    expect(after.players[1].concealed.at(-1)?.kind).toBe("characters-1");
    // One head draw plus one tail replacement.
    expect(after.wall).toHaveLength(wallBefore - 2);
    assertGameInvariants(after);
  });

  it("RULE-FLOWER-1: a chain of bonus draws keeps replacing until an ordinary tile arrives", () => {
    const state = buildTestState({
      config: PROFILE_144,
      concealed: {
        0: fillTo([], 13, CHARACTER_KINDS),
        1: fillTo([], 13, CHARACTER_KINDS),
        2: fillTo([], 13, CHARACTER_KINDS),
        3: fillTo([], 13, CHARACTER_KINDS),
      },
      wallHead: ["flower-2"],
      // Replacements are taken from the tail, so the last entry is drawn first.
      wallTail: ["characters-1", "season-3", "season-2"],
      phase: {
        kind: "awaiting-discard",
        seat: 0,
        source: "deal",
        drawnTile: null,
        lastWallTile: false,
      },
    });
    const after = discardAndPass(state, 0, firstConcealedKind(state, 0));

    expect(after.players[1].bonuses.map((tile) => tile.kind).sort()).toEqual([
      "flower-2",
      "season-2",
      "season-3",
    ]);
    expect(after.players[1].concealed).toHaveLength(14);
    expect(after.players[1].concealed.some((tile) => isBonusKind(tile.kind))).toBe(false);
    assertGameInvariants(after);
  });

  it("RULE-FLOWER-2: the deal leaves no seat holding a bonus tile", () => {
    for (let index = 0; index < 60; index += 1) {
      const state = createInitialGame(`flower-deal-${String(index)}`, PROFILE_144);
      for (const player of state.players) {
        expect(player.concealed.some((tile) => isBonusKind(tile.kind))).toBe(false);
      }
      assertGameInvariants(state);
    }
  });

  it("RULE-FLOWER-3: a bonus tile is never a legal discard and never reaches the pile", () => {
    for (let index = 0; index < 40; index += 1) {
      const state = createInitialGame(`flower-discard-${String(index)}`, PROFILE_144);
      const discards = legalActionsFor(state, state.dealer).filter(
        (action) => action.type === "discard",
      );
      for (const action of discards) {
        const tile = state.players[state.dealer].concealed.find(
          (candidate) => candidate.id === action.tileId,
        );
        expect(isBonusKind(tile?.kind ?? "characters-1")).toBe(false);
      }
      expect(state.discards.some((discard) => isBonusKind(discard.tile.kind))).toBe(false);
    }
  });

  it("RULE-FLOWER-4: an empty wall at replacement time ends the hand as a draw", () => {
    const state = buildTestState({
      config: PROFILE_144,
      concealed: {
        0: fillTo([], 13, CHARACTER_KINDS),
        1: fillTo([], 13, CHARACTER_KINDS),
        2: fillTo([], 13, CHARACTER_KINDS),
        3: fillTo([], 13, CHARACTER_KINDS),
      },
      // Every other bonus tile is already revealed, spread so that no seat is
      // anywhere near the seven-flower instant win, leaving one flower as the
      // only tile in the wall: its replacement cannot be supplied.
      bonuses: {
        0: ["flower-1", "flower-3"],
        2: ["flower-4", "season-1"],
        3: ["season-2", "season-3", "season-4"],
      },
      wallHead: ["flower-2"],
      wallCount: 1,
      phase: {
        kind: "awaiting-discard",
        seat: 0,
        source: "deal",
        drawnTile: null,
        lastWallTile: false,
      },
    });
    const after = discardAndPass(state, 0, firstConcealedKind(state, 0));
    expect(after.phase.kind === "hand-ended" || after.phase.kind === "match-ended").toBe(true);
    if (after.phase.kind === "hand-ended" || after.phase.kind === "match-ended") {
      expect(after.phase.result.outcome).toBe("draw");
    }
    assertGameInvariants(after);
  });
});

describe("claims", () => {
  it("RULE-CLAIM-3: on a double win the seat nearest the discarder takes it", () => {
    // Seats 1 and 2 both complete on characters-5; seat 1 is nearer to seat 0.
    const waiting: OrdinaryTileKind[] = [
      "characters-4",
      "characters-6",
      "bamboo-1",
      "bamboo-2",
      "bamboo-3",
      "dots-1",
      "dots-2",
      "dots-3",
      "dots-7",
      "dots-8",
      "dots-9",
      "wind-west",
      "wind-west",
    ];
    const state = buildTestState({
      config: PROFILE_144_OPEN,
      concealed: {
        0: fillTo(["characters-5"], 14, CHARACTER_KINDS),
        1: waiting,
        2: [...waiting],
        3: fillTo([], 13, [...CHARACTER_KINDS, ...waiting]),
      },
    });
    const claims = discardKind(state, 0, "characters-5");
    expect(claims.phase.kind).toBe("awaiting-claims");

    // Declare out of seat order on purpose: priority is by seat, not by speed.
    const winFor = (from: InternalGameState, seat: Seat): GameAction =>
      actionOfType(legalActionsFor(from, seat), "win");
    const afterSecond = reduceGame(claims, winFor(claims, 2));
    const resolved = reduceGame(afterSecond, winFor(afterSecond, 1));

    expect(resolved.phase.kind === "hand-ended" || resolved.phase.kind === "match-ended").toBe(true);
    if (resolved.phase.kind === "hand-ended" || resolved.phase.kind === "match-ended") {
      const result = resolved.phase.result as WinHandResult;
      expect(result.outcome).toBe("win");
      expect(result.winner).toBe(1);
      expect(result.fromSeat).toBe(0);
    }
  });

  it("RULE-CLAIM-4: a pung and an exposed kong can never contend for one discard", () => {
    // Contending would need five copies of a kind: three in one hand, two in
    // another, plus the discard. The tile set only ever holds four.
    const state = createInitialGame("claim-contention", PROFILE_144);
    const counts = new Map<TileKind, number>();
    for (const tile of createTileSet(state.config.tileSetSize)) {
      counts.set(tile.kind, (counts.get(tile.kind) ?? 0) + 1);
    }
    for (const kind of ORDINARY_TILE_KINDS) {
      expect(counts.get(kind) ?? 0).toBeLessThan(5);
    }
  });
});

describe("kongs", () => {
  it("RULE-ROB-2: a concealed kong is never offered for robbing", () => {
    const state = buildTestState({
      config: PROFILE_144_OPEN,
      concealed: {
        // Four dragons in hand, ready to be konged concealed.
        0: fillTo(
          ["dragon-red", "dragon-red", "dragon-red", "dragon-red"],
          14,
          CHARACTER_KINDS,
        ),
        1: fillTo([], 13, CHARACTER_KINDS),
        2: fillTo([], 13, CHARACTER_KINDS),
        3: fillTo([], 13, CHARACTER_KINDS),
      },
      wallTail: ["characters-1"],
    });
    const kong = actionOfType(legalActionsFor(state, 0), "declare-concealed-kong");
    const after = reduceGame(state, kong);

    // The turn returns to the declarer directly: no rob window is opened.
    expect(after.phase.kind).toBe("awaiting-discard");
    expect(after.players[0].melds.at(-1)).toMatchObject({ type: "kong", exposure: "concealed" });
    assertGameInvariants(after);
  });

  it("RULE-WALL-2: a kong is illegal once the wall is empty", () => {
    const withWall = buildTestState({
      config: PROFILE_144_OPEN,
      concealed: {
        0: fillTo(
          ["dragon-red", "dragon-red", "dragon-red", "dragon-red"],
          14,
          CHARACTER_KINDS,
        ),
        1: fillTo([], 13, CHARACTER_KINDS),
        2: fillTo([], 13, CHARACTER_KINDS),
        3: fillTo([], 13, CHARACTER_KINDS),
      },
      wallTail: ["characters-1"],
    });
    expect(
      legalActionsFor(withWall, 0).some((action) => action.type === "declare-concealed-kong"),
    ).toBe(true);

    const emptyWall = buildTestState({
      // The 136 profile has no bonus tiles, so the wall can legitimately be
      // emptied completely. RULE-TILES-1
      config: { ...PROFILE_144_OPEN, tileSetSize: 136 },
      concealed: {
        0: fillTo(
          ["dragon-red", "dragon-red", "dragon-red", "dragon-red"],
          14,
          CHARACTER_KINDS,
        ),
        1: fillTo([], 13, CHARACTER_KINDS),
        2: fillTo([], 13, CHARACTER_KINDS),
        3: fillTo([], 13, CHARACTER_KINDS),
      },
      wallCount: 0,
    });
    expect(
      legalActionsFor(emptyWall, 0).some((action) => action.type === "declare-concealed-kong"),
    ).toBe(false);
  });
});

describe("declaring a win", () => {
  it("RULE-WIN-6: a legal win is offered but never forced", () => {
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
      "dots-7",
      "dots-8",
      "dots-9",
      "wind-west",
      "wind-west",
    ];
    const state = buildTestState({
      config: PROFILE_144_OPEN,
      concealed: {
        0: complete,
        1: fillTo([], 13, complete),
        2: fillTo([], 13, complete),
        3: fillTo([], 13, complete),
      },
    });
    const actions = legalActionsFor(state, 0);
    expect(actions.some((action) => action.type === "win")).toBe(true);
    // Discards remain available alongside the win, so declining is a legal move.
    expect(actions.some((action) => action.type === "discard")).toBe(true);

    const declined = discardKind(state, 0, "wind-west");
    expect(declined.phase.kind).not.toBe("hand-ended");
    assertGameInvariants(declined);
  });

  it("RULE-WIN-5: seven bonus tiles win immediately and settle as a self-draw", () => {
    // Seat 1 holds six bonus tiles and draws a seventh.
    const state = buildTestState({
      config: PROFILE_144,
      concealed: {
        0: fillTo([], 13, CHARACTER_KINDS),
        1: fillTo([], 13, CHARACTER_KINDS),
        2: fillTo([], 13, CHARACTER_KINDS),
        3: fillTo([], 13, CHARACTER_KINDS),
      },
      bonuses: {
        1: ["flower-1", "flower-2", "flower-3", "flower-4", "season-1", "season-2"],
      },
      wallHead: ["season-3"],
      wallTail: ["characters-1"],
      phase: {
        kind: "awaiting-discard",
        seat: 0,
        source: "deal",
        drawnTile: null,
        lastWallTile: false,
      },
    });
    const after = discardAndPass(
      state,
      0,
      firstConcealedKind(state, 0),
      reduceScoredGame,
    );

    expect(after.phase.kind === "hand-ended" || after.phase.kind === "match-ended").toBe(true);
    if (after.phase.kind === "hand-ended" || after.phase.kind === "match-ended") {
      const result = after.phase.result as WinHandResult;
      expect(result.outcome).toBe("win");
      expect(result.winner).toBe(1);
      expect(result.source).toBe("seven-flowers");
      // Settles as a self-draw: no discarder, and every loser pays equally.
      expect(result.fromSeat).toBeNull();
      const payments = result.scoring?.payments ?? [0, 0, 0, 0];
      expect(payments[0]).toBe(payments[2]);
      expect(payments[0]).toBe(payments[3]);
      expect(payments.reduce((sum, value) => sum + value, 0)).toBe(0);
    }
    assertGameInvariants(after);
  });
});

describe("minimum faan profiles", () => {
  it("RULE-SCORE-4: the 0, 1 and 3 profiles all produce reachable, legal games", () => {
    for (const minimumFaan of [0, 1, 3] as const) {
      const config: RulesProfile = { ...PROFILE_144, minimumFaan };
      const state = createScoredGame(`profile-${String(minimumFaan)}`, config);
      expect(state.config.minimumFaan).toBe(minimumFaan);
      expect(scoredLegalActionsFor(state, state.dealer).length).toBeGreaterThan(0);
      assertGameInvariants(state);
    }
  });
});

describe("the end of the wall", () => {
  it("RULE-DRAW-4: an empty wall still allows Win, Chow and Pung, but never Kong", () => {
    // Seat 1 can chow or pung characters-5; seat 2 holds three of them.
    const state = buildTestState({
      config: { ...PROFILE_144_OPEN, tileSetSize: 136 },
      concealed: {
        0: fillTo(["characters-5"], 14, CHARACTER_KINDS),
        1: fillTo(["characters-4", "characters-6"], 13, CHARACTER_KINDS),
        2: fillTo(["characters-5", "characters-5", "characters-5"], 13, CHARACTER_KINDS),
        3: fillTo([], 13, CHARACTER_KINDS),
      },
      wallCount: 0,
    });
    const claims = reduceGame(state, {
      type: "discard",
      seat: 0,
      tileId: tileIdOfKind(state, 0, "characters-5") as typeof state.players[0]["concealed"][number]["id"],
    });
    expect(claims.phase.kind).toBe("awaiting-claims");

    const offered = new Set(
      [1, 2, 3].flatMap((seat) => legalActionsFor(claims, seat as Seat).map((action) => action.type)),
    );
    expect(offered.has("claim-chow")).toBe(true);
    expect(offered.has("claim-pung")).toBe(true);
    // A kong needs a replacement tile, and there is none. RULE-WALL-2
    expect(offered.has("claim-kong")).toBe(false);
  });

  it("RULE-FAAN-G14: a kong replacement comes from the tail, so it is never the last wall tile", () => {
    const state = buildTestState({
      config: { ...PROFILE_144_OPEN, tileSetSize: 136 },
      concealed: {
        0: fillTo(
          ["dragon-red", "dragon-red", "dragon-red", "dragon-red"],
          14,
          CHARACTER_KINDS,
        ),
        1: fillTo([], 13, CHARACTER_KINDS),
        2: fillTo([], 13, CHARACTER_KINDS),
        3: fillTo([], 13, CHARACTER_KINDS),
      },
      wallHead: ["characters-1"],
      wallTail: ["characters-9"],
      wallCount: 2,
    });
    const after = reduceGame(state, actionOfType(legalActionsFor(state, 0), "declare-concealed-kong"));

    // The replacement came off the tail, and a head tile still remains, so the
    // hand cannot simultaneously be on its last wall tile.
    expect(after.players[0].concealed.at(-1)?.kind).toBe("characters-9");
    expect(after.wall).toHaveLength(1);
    expect(after.phase).toMatchObject({ kind: "awaiting-discard", lastWallTile: false });
  });
});

describe("redaction of pending claims", () => {
  it("RULE-REDACT-5: a seat is told only whether it owes a response, never who else does", () => {
    // Seat 1 can always chow, so a claim window exists in both worlds and the
    // only difference is whether seat 2 is also a responder. Without that, the
    // window would simply not open (RULE-CLAIM-5) and the test would be
    // comparing two different situations rather than two different hands.
    const base = {
      config: PROFILE_144_OPEN,
      concealed: {
        0: fillTo(["characters-5"], 14, CHARACTER_KINDS),
        1: fillTo(["characters-4", "characters-6"], 13, CHARACTER_KINDS),
        3: fillTo([], 13, CHARACTER_KINDS),
      },
    } as const;

    const discardFive = (state: InternalGameState): InternalGameState =>
      reduceGame(state, {
        type: "discard",
        seat: 0,
        tileId: tileIdOfKind(state, 0, "characters-5") as typeof state.players[0]["concealed"][number]["id"],
      });

    const canPung = discardFive(
      buildTestState({
        ...base,
        concealed: {
          ...base.concealed,
          2: fillTo(["characters-5", "characters-5"], 13, CHARACTER_KINDS),
        },
      }),
    );
    const cannotPung = discardFive(
      buildTestState({
        ...base,
        concealed: { ...base.concealed, 2: fillTo([], 13, CHARACTER_KINDS) },
      }),
    );

    // Seat 2's holding differs between the two worlds, and the engine's own
    // phase records that. Seat 3, an uninvolved observer, must not be able to
    // tell them apart from its public phase.
    expect(canPung.phase.kind).toBe("awaiting-claims");
    expect(cannotPung.phase.kind).toBe("awaiting-claims");
    expect(canPung.phase).not.toEqual(cannotPung.phase);
    expect(projectPublicState(canPung, 3).phase).toEqual(projectPublicState(cannotPung, 3).phase);
    expect(projectPublicState(canPung, 3).phase).toMatchObject({
      kind: "awaiting-claims",
      youMayRespond: false,
    });
    // Seat 2 itself is told, because it owes the response.
    expect(projectPublicState(canPung, 2).phase).toMatchObject({ youMayRespond: true });
    expect(JSON.stringify(projectPublicState(canPung, 3))).not.toContain("responders");
  });
});
