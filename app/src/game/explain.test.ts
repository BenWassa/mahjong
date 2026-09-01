import { describe, expect, it } from "vitest";

import { DEFAULT_RULES_PROFILE } from "@engine";
import type { GameAction, PublicGameState, PublicPlayerState, Seat, TileId } from "@engine";

import { CONCEPTS, detectConcepts, type ConceptId } from "./explain";
import type { SessionSnapshot } from "./session";

/**
 * Explain's concept registry and first-occurrence trigger detection. Every
 * concept is checked for real, plain-language copy, and every trigger is
 * checked in isolation with a hand-built snapshot pair, in the same spirit as
 * game/interaction.test.ts.
 */

function player(seat: Seat, bonuses = 0): PublicPlayerState {
  return {
    seat,
    seatWind: (["east", "south", "west", "north"] as const)[seat],
    concealedCount: 13,
    concealed: seat === 0 ? [] : null,
    melds: [],
    bonuses: Array.from({ length: bonuses }, (_unused, index) => ({
      id: `flower-1-${String(index)}` as TileId,
      kind: "flower-1" as const,
    })),
    score: 0,
  };
}

function makeSnapshot(overrides: {
  readonly handIndex?: number;
  readonly phase?: PublicGameState["phase"];
  readonly bonuses?: readonly number[];
  readonly legalActions?: readonly GameAction[];
}): SessionSnapshot {
  const bonuses = overrides.bonuses ?? [0, 0, 0, 0];
  const view: PublicGameState = {
    version: 1,
    viewer: 0,
    config: DEFAULT_RULES_PROFILE,
    handIndex: overrides.handIndex ?? 0,
    dealer: 0,
    roundWind: "east",
    currentSeat: 0,
    players: [
      player(0, bonuses[0]),
      player(1, bonuses[1]),
      player(2, bonuses[2]),
      player(3, bonuses[3]),
    ],
    wallCount: 60,
    discards: [],
    phase: overrides.phase ?? { kind: "awaiting-discard", seat: 0, source: "wall" },
  };
  return {
    view,
    legalActions: overrides.legalActions ?? [],
    waitingOn: null,
    lastAction: null,
    waitingTiles: [],
    structurallyComplete: false,
  };
}

describe("CONCEPTS", () => {
  it("defines a title and a non-empty body for every required concept", () => {
    const ids: readonly ConceptId[] = [
      "claim-decisions",
      "flowers-replacement",
      "minimum-faan",
      "dealer-rotation",
      "robbing-kong",
      "win-sources",
      "exhaustive-draw",
      "faan-breakdown",
    ];
    for (const id of ids) {
      expect(CONCEPTS[id].title.length).toBeGreaterThan(0);
      expect(CONCEPTS[id].body.length).toBeGreaterThan(20);
    }
  });
});

describe("detectConcepts", () => {
  it("finds nothing on a quiet snapshot with no previous state", () => {
    expect(detectConcepts(null, makeSnapshot({}), false)).toEqual([]);
  });

  it("detects a claim decision whenever the band has any legal claim", () => {
    const snapshot = makeSnapshot({
      legalActions: [{ type: "claim-pung", seat: 0, tileIds: ["dots-1-0", "dots-1-1"] }],
    });
    expect(detectConcepts(null, snapshot, false)).toContain("claim-decisions");
  });

  it("detects a below-minimum win only when told so by the caller", () => {
    const snapshot = makeSnapshot({});
    expect(detectConcepts(null, snapshot, false)).not.toContain("minimum-faan");
    expect(detectConcepts(null, snapshot, true)).toContain("minimum-faan");
  });

  it("detects a robbing-kong window from the phase alone", () => {
    const snapshot = makeSnapshot({
      phase: { kind: "awaiting-rob", declarer: 1, pendingTile: { id: "dots-1-0", kind: "dots-1" }, youMayRespond: false },
    });
    expect(detectConcepts(null, snapshot, false)).toContain("robbing-kong");
  });

  it("detects a flower/season reveal from a rise in total bonuses since the previous snapshot", () => {
    const previous = makeSnapshot({ bonuses: [0, 0, 0, 0] });
    const current = makeSnapshot({ bonuses: [1, 0, 0, 0] });
    expect(detectConcepts(previous, current, false)).toContain("flowers-replacement");
    expect(detectConcepts(previous, previous, false)).not.toContain("flowers-replacement");
  });

  it("detects dealer rotation from a hand index that has advanced", () => {
    const previous = makeSnapshot({ handIndex: 0 });
    const current = makeSnapshot({ handIndex: 1 });
    expect(detectConcepts(previous, current, false)).toContain("dealer-rotation");
    expect(detectConcepts(previous, previous, false)).not.toContain("dealer-rotation");
  });

  it("can report several concepts true at once, leaving the caller to pick one", () => {
    const previous = makeSnapshot({ handIndex: 0, bonuses: [0, 0, 0, 0] });
    const current = makeSnapshot({
      handIndex: 1,
      bonuses: [1, 0, 0, 0],
      legalActions: [{ type: "claim-pung", seat: 0, tileIds: ["dots-1-0", "dots-1-1"] }],
    });
    const found = detectConcepts(previous, current, true);
    expect(found).toEqual(
      expect.arrayContaining(["claim-decisions", "minimum-faan", "flowers-replacement", "dealer-rotation"]),
    );
  });
});
