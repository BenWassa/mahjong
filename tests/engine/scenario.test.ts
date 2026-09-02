import { describe, expect, it } from "vitest";

import {
  DEFAULT_RULES_PROFILE,
  ReplayMismatchError,
  ScenarioSpecError,
  buildScenarioWall,
  newScenarioGame,
  replayGame,
  type GameAction,
  type MahjongGame,
  type OrdinaryTileKind,
  type ScenarioSpec,
  type Seat,
  type Tile,
  type TileKind,
} from "../../src/engine/index.js";
import { BONUS_TILE_KINDS, createTileSet } from "../../src/engine/tiles.js";

const SEATS: readonly Seat[] = [0, 1, 2, 3];

/**
 * Three packets of four to each of the four seats, then one more each, then the
 * dealer's extra. The first scripted draw therefore sits at this wall index.
 */
const DEALT_TILE_COUNT = 53;

const BONUS_KINDS = new Set<TileKind>(BONUS_TILE_KINDS);

/** A dealer hand named in full: fourteen ordinary tiles, no kind past four copies. */
const DEALER_FOURTEEN: readonly OrdinaryTileKind[] = [
  "characters-1",
  "characters-1",
  "characters-1",
  "characters-2",
  "characters-3",
  "characters-4",
  "bamboo-5",
  "bamboo-6",
  "bamboo-7",
  "dots-1",
  "dots-2",
  "dots-3",
  "dragon-red",
  "dragon-red",
];

/** A non-dealer hand named in full: thirteen ordinary tiles. */
const RESPONDER_THIRTEEN: readonly OrdinaryTileKind[] = [
  "wind-east",
  "wind-east",
  "wind-south",
  "wind-west",
  "wind-north",
  "dots-6",
  "dots-7",
  "dots-8",
  "bamboo-1",
  "bamboo-2",
  "bamboo-3",
  "characters-6",
  "characters-7",
];

const EMPTY_HANDS: ScenarioSpec["hands"] = [[], [], [], []];

function spec(overrides: Partial<ScenarioSpec> & Pick<ScenarioSpec, "id">): ScenarioSpec {
  return {
    profile: DEFAULT_RULES_PROFILE,
    dealer: 0,
    hands: EMPTY_HANDS,
    ...overrides,
  };
}

function openHand(game: MahjongGame, seat: Seat): readonly Tile[] {
  const tiles = game.openHandsForTutorial().get(seat);
  if (tiles === undefined) {
    throw new Error(`Tutorial open hands are missing seat ${String(seat)}`);
  }
  return tiles;
}

function kindsOf(tiles: readonly Tile[]): readonly TileKind[] {
  return tiles.map((tile) => tile.kind);
}

function idsOf(tiles: readonly Tile[]): readonly string[] {
  return tiles.map((tile) => tile.id);
}

function wallTileAt(resolvedWall: readonly Tile[], index: number): Tile {
  const tile = resolvedWall[index];
  if (tile === undefined) {
    throw new Error(`The arranged wall has no tile at index ${String(index)}`);
  }
  return tile;
}

function firstAction(game: MahjongGame, type: GameAction["type"], seat: Seat): GameAction {
  const action = game.legalActions(seat).find((candidate) => candidate.type === type);
  if (action === undefined) {
    throw new Error(`Expected seat ${String(seat)} to have a legal ${type}`);
  }
  return action;
}

/** Applies an explicit pass for every responder the claim window still asks. */
function closeClaimWindow(game: MahjongGame): MahjongGame {
  let current = game;
  for (let guard = 0; guard < 4; guard += 1) {
    const pass = SEATS.flatMap((seat) => current.legalActions(seat)).find(
      (candidate) => candidate.type === "pass",
    );
    if (pass === undefined) {
      return current;
    }
    current = current.act(pass);
  }
  throw new Error("The claim window did not close after four passes");
}

describe("scenario wall arrangement", () => {
  it("orders the whole physical tile set: every canonical tile id appears exactly once", () => {
    const resolved = buildScenarioWall(
      spec({
        id: "permutation",
        hands: [DEALER_FOURTEEN, RESPONDER_THIRTEEN, [], []],
        draws: ["dragon-green", "dragon-white"],
      }),
    );
    const canonical = createTileSet(DEFAULT_RULES_PROFILE.tileSetSize);

    expect(resolved.wall).toHaveLength(canonical.length);
    expect([...idsOf(resolved.wall)].sort()).toEqual([...idsOf(canonical)].sort());
    expect(new Set(idsOf(resolved.wall)).size).toBe(canonical.length);
  });

  it("arranges a 136-tile profile from that profile's inventory, with no bonus tiles at all", () => {
    const profile = { ...DEFAULT_RULES_PROFILE, tileSetSize: 136 as const };
    const resolved = buildScenarioWall(
      spec({ id: "permutation-136", profile, hands: [DEALER_FOURTEEN, [], [], []] }),
    );

    expect([...idsOf(resolved.wall)].sort()).toEqual([...idsOf(createTileSet(136))].sort());
    expect(resolved.wall.some((tile) => BONUS_KINDS.has(tile.kind))).toBe(false);
  });
});

describe("the deal lands the tiles the scenario named", () => {
  it("gives the dealer at seat 0 exactly its named fourteen and seat 1 its named thirteen", () => {
    const scenario = spec({
      id: "deal-dealer-0",
      dealer: 0,
      hands: [DEALER_FOURTEEN, RESPONDER_THIRTEEN, [], []],
    });

    const game = newScenarioGame(scenario);

    expect(kindsOf(openHand(game, 0))).toEqual(DEALER_FOURTEEN);
    expect(kindsOf(openHand(game, 1))).toEqual(RESPONDER_THIRTEEN);
    expect(openHand(game, 2)).toHaveLength(13);
    expect(openHand(game, 3)).toHaveLength(13);
  });

  it("gives the dealer at seat 1 its named fourteen, proving the deal-position arithmetic", () => {
    const scenario = spec({
      id: "deal-dealer-1",
      dealer: 1,
      hands: [RESPONDER_THIRTEEN, DEALER_FOURTEEN, [], []],
    });

    const game = newScenarioGame(scenario);

    expect(kindsOf(openHand(game, 1))).toEqual(DEALER_FOURTEEN);
    expect(kindsOf(openHand(game, 0))).toEqual(RESPONDER_THIRTEEN);
    expect(openHand(game, 1)).toHaveLength(14);
    expect(openHand(game, 0)).toHaveLength(13);
    expect(game.state(0).dealer).toBe(1);
    expect(game.state(0).currentSeat).toBe(1);
  });

  it("honours a partially named hand as a prefix and pads the rest to the dealt size", () => {
    const named: readonly OrdinaryTileKind[] = ["dragon-white", "dragon-white", "dragon-white"];
    const scenario = spec({ id: "partial-hand", hands: [DEALER_FOURTEEN, named, [], []] });

    const game = newScenarioGame(scenario);
    const seatOne = kindsOf(openHand(game, 1));

    expect(seatOne.slice(0, 3)).toEqual(named);
    expect(seatOne).toHaveLength(13);
    expect(seatOne.filter((kind) => kind === "dragon-white")).toHaveLength(3);
  });

  it("pads the dealer's own short hand up to fourteen, with its named tiles first", () => {
    const named: readonly OrdinaryTileKind[] = ["dragon-white", "dragon-white"];
    const scenario = spec({ id: "partial-dealer-hand", hands: [named, [], [], []] });

    const game = newScenarioGame(scenario);
    const dealerHand = kindsOf(openHand(game, 0));

    expect(dealerHand.slice(0, 2)).toEqual(named);
    expect(dealerHand).toHaveLength(14);
  });
});

describe("scripted draws", () => {
  it("hands the first scripted draw to the next seat once the claim window has closed", () => {
    const scenario = spec({
      id: "scripted-draws",
      hands: [DEALER_FOURTEEN, RESPONDER_THIRTEEN, [], []],
      draws: ["dragon-green", "dragon-white"],
    });
    const scripted = wallTileAt(buildScenarioWall(scenario).wall, DEALT_TILE_COUNT);
    expect(scripted.kind).toBe("dragon-green");

    const opening = newScenarioGame(scenario);
    expect(idsOf(openHand(opening, 1))).not.toContain(scripted.id);

    const afterDiscard = opening.act(firstAction(opening, "discard", 0));
    const drawn = closeClaimWindow(afterDiscard);

    expect(drawn.state(0).currentSeat).toBe(1);
    expect(idsOf(openHand(drawn, 1))).toContain(scripted.id);
    expect(kindsOf(openHand(drawn, 1))).toContain("dragon-green");
    expect(openHand(drawn, 1)).toHaveLength(14);
  });

  it("places each scripted draw at its own offset behind the deal, in the order named", () => {
    const draws: readonly OrdinaryTileKind[] = ["dragon-green", "dragon-white", "wind-north"];
    const resolved = buildScenarioWall(
      spec({ id: "draw-order", hands: [DEALER_FOURTEEN, [], [], []], draws }),
    );

    expect(
      draws.map((_, offset) => wallTileAt(resolved.wall, DEALT_TILE_COUNT + offset).kind),
    ).toEqual(draws);
  });
});

describe("scenario determinism", () => {
  it("rebuilds an identical wall and identical hands from the same spec", () => {
    const scenario = (): ScenarioSpec =>
      spec({
        id: "determinism",
        hands: [DEALER_FOURTEEN, ["wind-east"], [], []],
        draws: ["dragon-green"],
      });

    const first = buildScenarioWall(scenario());
    const second = buildScenarioWall(scenario());

    expect(idsOf(first.wall)).toEqual(idsOf(second.wall));
    expect(first.hands.map(idsOf)).toEqual(second.hands.map(idsOf));

    const dealt = newScenarioGame(scenario());
    expect(SEATS.map((seat) => idsOf(openHand(dealt, seat)))).toEqual(first.hands.map(idsOf));
  });

  it("seeds padding per scenario id, so two otherwise identical specs pad differently", () => {
    const padded = (id: string): readonly string[][] =>
      buildScenarioWall(spec({ id, hands: EMPTY_HANDS })).hands.map((hand) => [...idsOf(hand)]);

    const left = padded("padding-seed-a");
    const right = padded("padding-seed-b");

    expect(left.flat()).toHaveLength(53);
    expect(right.flat()).toHaveLength(53);
    expect(left).not.toEqual(right);
  });
});

describe("padding never introduces a bonus tile", () => {
  it("pads entirely empty hands with ordinary tiles and reveals no flower or season", () => {
    const game = newScenarioGame(spec({ id: "padding-bonus-free", hands: EMPTY_HANDS }));

    for (const seat of SEATS) {
      const hand = openHand(game, seat);
      expect(hand).toHaveLength(seat === 0 ? 14 : 13);
      expect(hand.filter((tile) => BONUS_KINDS.has(tile.kind))).toEqual([]);
    }

    for (const player of game.state(0).players) {
      expect(player.bonuses).toEqual([]);
    }
    expect(game.state(0).phase.kind).toBe("awaiting-discard");
  });

  it("keeps the bonus tiles out of the wall's head and tail, so no early draw is a flower", () => {
    const resolved = buildScenarioWall(spec({ id: "bonus-placement", hands: EMPTY_HANDS }));
    const bonusIndices = resolved.wall.flatMap((tile, index) =>
      BONUS_KINDS.has(tile.kind) ? [index] : [],
    );

    expect(bonusIndices).toHaveLength(BONUS_TILE_KINDS.length);
    expect(Math.min(...bonusIndices)).toBeGreaterThan(DEALT_TILE_COUNT + 20);
    expect(Math.max(...bonusIndices)).toBeLessThan(resolved.wall.length - 20);
  });
});

describe("scenario states satisfy the engine's own invariants", () => {
  it("builds an opening state and survives fifteen legal actions without violating conservation", () => {
    const scenario = spec({
      id: "invariants",
      hands: [DEALER_FOURTEEN, RESPONDER_THIRTEEN, [], []],
      draws: ["dragon-green", "dragon-white", "wind-north", "bamboo-8", "bamboo-9"],
    });
    const moveCount = 15;

    let game = newScenarioGame(scenario);
    let applied = 0;

    for (let step = 0; step < moveCount; step += 1) {
      const owed = SEATS.map((seat) => game.legalActions(seat)).find(
        (actions) => actions.length > 0,
      );
      const action = owed?.[0];
      if (action === undefined) {
        break;
      }
      game = game.act(action);
      applied += 1;
    }

    expect(applied).toBe(moveCount);
    expect(game.gameRecord().actions).toHaveLength(moveCount);
    expect(game.gameRecord().actions.map((recorded) => recorded.index)).toEqual(
      Array.from({ length: moveCount }, (_, index) => index),
    );
  });
});

describe("scenario games keep the ordinary redaction contract", () => {
  it("RULE-REDACT-1: shows a viewer only its own concealed tiles on a scenario game", () => {
    const game = newScenarioGame(
      spec({ id: "redaction", hands: [DEALER_FOURTEEN, RESPONDER_THIRTEEN, [], []] }),
    );

    expect(game.state(0).players[1].concealed).toBeNull();
    expect(game.state(0).players[0].concealed).not.toBeNull();

    for (const viewer of SEATS) {
      const state = game.state(viewer);
      expect(state.players.map((player) => player.concealed !== null)).toEqual(
        SEATS.map((seat) => seat === viewer),
      );
      const json = JSON.stringify(state);
      for (const opponent of SEATS.filter((seat) => seat !== viewer)) {
        for (const tile of openHand(game, opponent)) {
          expect(json).not.toContain(tile.id);
        }
      }
    }
  });
});

describe("the tutorial open-hands API is separate from game state", () => {
  it("returns every seat's real concealed tiles without widening what state(viewer) reveals", () => {
    const game = newScenarioGame(
      spec({ id: "open-hands", hands: [DEALER_FOURTEEN, RESPONDER_THIRTEEN, [], []] }),
    );
    const before = JSON.stringify(game.state(1));

    const open = game.openHandsForTutorial();

    expect([...open.keys()].sort()).toEqual([0, 1, 2, 3]);
    expect(kindsOf(openHand(game, 0))).toEqual(DEALER_FOURTEEN);
    expect(kindsOf(openHand(game, 1))).toEqual(RESPONDER_THIRTEEN);
    for (const seat of SEATS) {
      const own = game.state(seat).players[seat].concealed;
      if (own === null) {
        throw new Error(`Seat ${String(seat)} cannot see its own concealed tiles`);
      }
      expect([...idsOf(openHand(game, seat))].sort()).toEqual([...idsOf(own)].sort());
    }

    expect(JSON.stringify(game.state(1))).toBe(before);
    expect(game.state(1).players[0].concealed).toBeNull();
    expect(game.state(1).players[2].concealed).toBeNull();
  });
});

describe("scenario spec validation", () => {
  it("rejects a non-dealer seat named more tiles than it is dealt", () => {
    expect(() =>
      buildScenarioWall(
        spec({ id: "overlong-hand", dealer: 0, hands: [[], DEALER_FOURTEEN, [], []] }),
      ),
    ).toThrow(ScenarioSpecError);
  });

  it("rejects a kind named more than its four copies across the whole spec", () => {
    const threeCopies: readonly OrdinaryTileKind[] = ["dots-5", "dots-5", "dots-5"];
    const twoCopies: readonly OrdinaryTileKind[] = ["dots-5", "dots-5"];

    expect(() =>
      buildScenarioWall(
        spec({ id: "fifth-copy", hands: [threeCopies, twoCopies, [], []] }),
      ),
    ).toThrow(ScenarioSpecError);
  });

  it("rejects a scripted draw that spends a fifth copy of a kind already fully named", () => {
    const fourCopies: readonly OrdinaryTileKind[] = ["dots-5", "dots-5", "dots-5", "dots-5"];

    expect(() =>
      buildScenarioWall(
        spec({ id: "fifth-copy-draw", hands: [fourCopies, [], [], []], draws: ["dots-5"] }),
      ),
    ).toThrow(ScenarioSpecError);
  });
});

describe("scenario records are not replayable", () => {
  it("refuses to replay a scenario record, because replay rebuilds the wall from the seed", () => {
    const game = newScenarioGame(
      spec({ id: "no-replay", hands: [DEALER_FOURTEEN, RESPONDER_THIRTEEN, [], []] }),
    );
    const record = game.gameRecord();

    expect(record.seed).toBe("scenario:no-replay");
    expect(() => replayGame(record)).toThrow(ReplayMismatchError);
  });
});
