import { describe, expect, it } from "vitest";

import {
  legalActionsFor,
  reduceGame,
} from "../../src/engine/scored-core.js";
import type { RulesProfile } from "../../src/engine/types.js";
import { buildTestState } from "../fixtures/state-builder.js";

const ZERO_FAAN_WAIT = [
  "bamboo-1", "bamboo-2", "bamboo-3",
  "dots-4", "dots-5", "dots-6",
  "characters-7", "characters-8", "characters-9",
  "bamboo-5",
] as const;

function profile(minimumFaan: 0 | 1 | 3, matchLength: RulesProfile["matchLength"] = "east-round"): RulesProfile {
  return {
    tileSetSize: 136,
    minimumFaan,
    matchLength,
  };
}

describe("scored core integration", () => {
  it("RECON-1 / RULE-SCORE-4: minimum-faan legality filters the Win action", () => {
    const baseOptions = {
      concealed: {
        1: [...ZERO_FAAN_WAIT, "bamboo-5"] as const,
      },
      melds: {
        1: [{
          type: "pung" as const,
          exposure: "exposed" as const,
          kinds: ["characters-2", "characters-2", "characters-2"] as const,
        }],
      },
      phase: {
        kind: "awaiting-discard" as const,
        seat: 1 as const,
        source: "wall" as const,
        drawnTile: null,
        lastWallTile: false,
      },
    };

    const beginner = buildTestState({ ...baseOptions, config: profile(0) });
    const standard = buildTestState({ ...baseOptions, config: profile(1) });
    const classic = buildTestState({ ...baseOptions, config: profile(3) });

    expect(legalActionsFor(beginner, 1).some((action) => action.type === "win")).toBe(true);
    expect(legalActionsFor(standard, 1).some((action) => action.type === "win")).toBe(true);
    expect(legalActionsFor(classic, 1).some((action) => action.type === "win")).toBe(false);
  });

  it("RULE-WIN-7 / RULE-CLAIM-5: a below-minimum discard win does not leave a claims prompt", () => {
    const state = buildTestState({
      config: profile(3),
      concealed: {
        0: ["bamboo-5"],
        1: ZERO_FAAN_WAIT,
      },
      melds: {
        1: [{
          type: "pung",
          exposure: "exposed",
          kinds: ["characters-2", "characters-2", "characters-2"],
        }],
      },
      phase: {
        kind: "awaiting-discard",
        seat: 0,
        source: "wall",
        drawnTile: null,
        lastWallTile: false,
      },
      wallCount: 40,
    });
    const discard = state.players[0].concealed[0];
    expect(discard).toBeDefined();
    if (discard === undefined) {
      throw new Error("Expected discard fixture tile");
    }

    const next = reduceGame(state, { type: "discard", seat: 0, tileId: discard.id });
    expect(next.phase.kind).toBe("awaiting-discard");
    if (next.phase.kind === "awaiting-discard") {
      expect(next.phase.seat).toBe(1);
    }
    expect(next.record.actions).toHaveLength(1);
    expect(next.record.actions[0]?.action.type).toBe("discard");
  });

  it("RULE-PAY-1/6 and RECON-16: a 0-faan discard win settles scores and records the itemized breakdown", () => {
    const state = buildTestState({
      config: profile(0, "single-hand"),
      concealed: {
        0: ["bamboo-5"],
        1: ZERO_FAAN_WAIT,
      },
      melds: {
        1: [{
          type: "pung",
          exposure: "exposed",
          kinds: ["characters-2", "characters-2", "characters-2"],
        }],
      },
      phase: {
        kind: "awaiting-discard",
        seat: 0,
        source: "wall",
        drawnTile: null,
        lastWallTile: false,
      },
      wallCount: 40,
    });
    const discard = state.players[0].concealed[0];
    if (discard === undefined) {
      throw new Error("Expected discard fixture tile");
    }
    const claims = reduceGame(state, { type: "discard", seat: 0, tileId: discard.id });
    expect(claims.phase.kind).toBe("awaiting-claims");
    expect(legalActionsFor(claims, 1).some((action) => action.type === "win")).toBe(true);

    const ended = reduceGame(claims, { type: "win", seat: 1 });
    expect(ended.phase.kind).toBe("match-ended");
    if (ended.phase.kind !== "match-ended" || ended.phase.result.outcome !== "win") {
      throw new Error("Expected a terminal win");
    }
    expect(ended.phase.result.scoring?.qualifyingFaan).toBe(0);
    expect(ended.phase.result.scoring?.totalFaan).toBe(0);
    expect(ended.phase.result.scoring?.basePoints).toBe(1);
    expect(ended.phase.result.scoring?.payments).toEqual([-2, 4, -1, -1]);
    expect(ended.players.map((entry) => entry.score)).toEqual([-2, 4, -1, -1]);
    expect(ended.record.hands[0]).toEqual(ended.phase.result);
  });

  it("RULE-PAY-2: self-draw settlement applies the payment vector to existing scores", () => {
    const state = buildTestState({
      config: profile(1, "single-hand"),
      scores: [10, -5, 0, 20],
      concealed: {
        0: [
          "characters-2", "characters-2", "characters-2",
          "bamboo-3", "bamboo-3", "bamboo-3",
          "dots-4", "dots-4", "dots-4",
          "characters-7", "characters-7", "characters-7",
          "bamboo-6", "bamboo-6",
        ],
      },
      phase: {
        kind: "awaiting-discard",
        seat: 0,
        source: "wall",
        drawnTile: null,
        lastWallTile: false,
      },
    });
    const ended = reduceGame(state, { type: "win", seat: 0 });
    expect(ended.phase.kind).toBe("match-ended");
    if (ended.phase.kind !== "match-ended" || ended.phase.result.outcome !== "win") {
      throw new Error("Expected a terminal self-draw win");
    }
    const scoring = ended.phase.result.scoring;
    expect(scoring).not.toBeNull();
    if (scoring === null) {
      throw new Error("Expected scoring");
    }
    expect(ended.players.map((entry) => entry.score)).toEqual([
      10 + 6 * scoring.basePoints,
      -5 - 2 * scoring.basePoints,
      -2 * scoring.basePoints,
      20 - 2 * scoring.basePoints,
    ]);
  });
});
