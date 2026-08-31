import { describe, expect, it } from "vitest";
import {
  decisionTileIds,
  initialState,
  medianMillis,
  reduce,
  type InteractionEvent,
  type InteractionModel,
  type InteractionState,
} from "./interaction.ts";
import { SCENARIOS } from "./scenarios.ts";
import { measureHand, DEFAULT_SETTINGS, MAX_HAND_TILES } from "./settings.ts";

function run(
  events: readonly InteractionEvent[],
  model: InteractionModel = "tap-tap",
  start: InteractionState = initialState(0),
): InteractionState {
  return events.reduce((state, event) => reduce(state, event, model), start);
}

function tap(tileId: string, at: number): InteractionEvent {
  return { type: "tap-hand-tile", tileId, at };
}

const firstTile = SCENARIOS[0]?.hand[0]?.id ?? "";
const secondTile = SCENARIOS[0]?.hand[1]?.id ?? "";

describe("tap-to-select, tap-again-to-discard", () => {
  it("lifts a tile on the first tap without discarding it", () => {
    const state = run([tap(firstTile, 0)]);
    expect(state.selectedTileId).toBe(firstTile);
    expect(state.resolution).toBeNull();
    expect(state.metrics.discards).toBe(0);
    expect(state.table.hand).toHaveLength(14);
  });

  it("discards only when the same tile is tapped a second time", () => {
    const state = run([tap(firstTile, 0), tap(firstTile, 400)]);
    expect(state.resolution).toEqual({ kind: "discard", tileId: firstTile, label: "characters-2" });
    expect(state.selectedTileId).toBeNull();
    expect(state.table.hand).toHaveLength(13);
    expect(state.metrics.discards).toBe(1);
    expect(state.metrics.discardMillis).toEqual([400]);
  });

  it("moves the selection instead of discarding when another tile is tapped", () => {
    const state = run([tap(firstTile, 0), tap(secondTile, 200)]);
    expect(state.selectedTileId).toBe(secondTile);
    expect(state.resolution).toBeNull();
    expect(state.metrics.discards).toBe(0);
    expect(state.metrics.selectionMoves).toBe(1);
  });

  it("times a decision from its first tap, not from the last selection move", () => {
    const state = run([tap(firstTile, 0), tap(secondTile, 300), tap(secondTile, 900)]);
    expect(state.metrics.discardMillis).toEqual([900]);
  });

  it("records whole milliseconds, so the session report stays readable", () => {
    const state = run([tap(firstTile, 10.4), tap(firstTile, 421.5)]);
    expect(state.metrics.discardMillis).toEqual([411]);
  });

  it("clears the lift without discarding", () => {
    const state = run([tap(firstTile, 0), { type: "clear-selection" }]);
    expect(state.selectedTileId).toBeNull();
    expect(state.metrics.discards).toBe(0);
  });
});

describe("turn ownership", () => {
  it("ignores hand taps when the table is not asking for a discard", () => {
    const waiting = initialState(1);
    const tileId = waiting.table.hand[3]?.id ?? "";
    const state = run([tap(tileId, 0), tap(tileId, 300)], "tap-tap", waiting);
    expect(state.selectedTileId).toBeNull();
    expect(state.resolution).toBeNull();
    expect(state.metrics.inertTaps).toBe(2);
    expect(state.table.hand).toHaveLength(13);
  });

  it("ignores hand taps while a claim decision is pending", () => {
    const claiming = initialState(2);
    const tileId = claiming.table.hand[0]?.id ?? "";
    const state = run([tap(tileId, 0), tap(tileId, 250)], "tap-tap", claiming);
    expect(state.metrics.inertTaps).toBe(2);
    expect(state.metrics.discards).toBe(0);
  });

  it("refuses a second discard once the scenario is resolved", () => {
    const resolved = run([tap(firstTile, 0), tap(firstTile, 200)]);
    const after = run([tap(secondTile, 400), tap(secondTile, 600)], "tap-tap", resolved);
    expect(after.metrics.discards).toBe(1);
    expect(after.metrics.inertTaps).toBe(2);
  });
});

describe("flick comparison model", () => {
  it("discards on a flick", () => {
    const state = run([{ type: "flick-hand-tile", tileId: firstTile, at: 120 }], "flick");
    expect(state.metrics.discards).toBe(1);
    expect(state.table.hand).toHaveLength(13);
  });

  it("does not discard on a repeated tap, so the two models stay distinguishable", () => {
    const state = run([tap(firstTile, 0), tap(firstTile, 200)], "flick");
    expect(state.metrics.discards).toBe(0);
    expect(state.selectedTileId).toBe(firstTile);
  });

  it("ignores a flick that is not this seat's decision", () => {
    const waiting = initialState(1);
    const tileId = waiting.table.hand[0]?.id ?? "";
    const state = run([{ type: "flick-hand-tile", tileId, at: 0 }], "flick", waiting);
    expect(state.metrics.discards).toBe(0);
    expect(state.metrics.inertTaps).toBe(1);
  });
});

describe("contextual claims", () => {
  it("offers two distinct chows on one discard", () => {
    const state = initialState(2);
    expect(state.table.claims.map((claim) => claim.detail)).toEqual(["2·3·4", "4·5·6"]);
    for (const claim of state.table.claims) {
      expect(claim.usesTileIds).toHaveLength(2);
    }
  });

  it("resolves the chosen claim and refuses a second one", () => {
    const claiming = initialState(2);
    const state = run(
      [
        { type: "claim", claimId: "chow-high" },
        { type: "claim", claimId: "chow-low" },
        { type: "pass" },
      ],
      "tap-tap",
      claiming,
    );
    expect(state.resolution).toEqual({ kind: "claim", claim: claiming.table.claims[1] });
    expect(state.metrics.claims).toBe(1);
    expect(state.metrics.passes).toBe(0);
  });

  it("offers pung and kong separately on the same discard", () => {
    const state = initialState(3);
    expect(state.table.claims.map((claim) => claim.kind)).toEqual(["pung", "kong"]);
    expect(state.table.claims[1]?.usesTileIds).toHaveLength(3);
  });

  it("never pairs a win with any control other than pass", () => {
    const state = initialState(4);
    expect(state.table.claims.map((claim) => claim.kind)).toEqual(["win"]);
  });

  it("exposes the tiles a pending decision depends on", () => {
    expect(decisionTileIds(initialState(2).table).size).toBe(4);
    expect(decisionTileIds(initialState(0).table).size).toBe(0);
  });
});

describe("scenario navigation and metrics", () => {
  it("keeps metrics across scenarios but clears the resolution", () => {
    const played = run([tap(firstTile, 0), tap(firstTile, 300)]);
    const next = reduce(played, { type: "goto-scenario", index: 2 }, "tap-tap");
    expect(next.metrics.discards).toBe(1);
    expect(next.resolution).toBeNull();
    expect(next.table.id).toBe("chow-two-ways");
  });

  it("replays a scenario from its deterministic starting state", () => {
    const played = run([tap(firstTile, 0), tap(firstTile, 300)]);
    const replayed = reduce(played, { type: "replay-scenario" }, "tap-tap");
    expect(replayed.table.hand).toHaveLength(14);
    expect(replayed.table).toEqual(SCENARIOS[0]);
  });

  it("records tester-reported misfires", () => {
    const state = run([{ type: "report-misfire" }, { type: "report-misfire" }]);
    expect(state.metrics.misfires).toBe(2);
  });

  it("wraps scenario indices in both directions", () => {
    const back = reduce(initialState(0), { type: "goto-scenario", index: -1 }, "tap-tap");
    expect(back.table.id).toBe(SCENARIOS[SCENARIOS.length - 1]?.id);
  });
});

describe("hand sizing", () => {
  it("fits fourteen tiles into a landscape hand row", () => {
    const metrics = measureHand(760, MAX_HAND_TILES, DEFAULT_SETTINGS, true);
    expect(metrics.overflows).toBe(false);
    expect(metrics.tileWidth).toBeGreaterThanOrEqual(42);
  });

  it("reports overflow when a fixed size cannot show the whole hand", () => {
    const metrics = measureHand(
      520,
      MAX_HAND_TILES,
      { ...DEFAULT_SETTINGS, tileSize: "l" },
      true,
    );
    expect(metrics.overflows).toBe(true);
  });

  it("keeps tiles upright at a 3:4 face ratio", () => {
    const metrics = measureHand(760, 13, DEFAULT_SETTINGS, false);
    expect(metrics.tileHeight).toBe(Math.round(metrics.tileWidth * (4 / 3)));
  });
});

describe("median", () => {
  it("returns null for no samples and the middle otherwise", () => {
    expect(medianMillis([])).toBeNull();
    expect(medianMillis([300, 100, 200])).toBe(200);
    expect(medianMillis([100, 300])).toBe(200);
  });
});
