import { describe, expect, it } from "vitest";

import { isStructurallyComplete, waitingTiles } from "../../src/engine/learning.js";
import { buildTestState } from "../fixtures/state-builder.js";

/**
 * Additive, read-only hints for the app's optional Assist layer (#9). Both
 * functions reuse the engine's own structural and scoring evaluators, so
 * these tests check the boundary they add (resting-hand gating, and the
 * distinction between "not complete" and "complete but below minimum faan")
 * rather than re-deriving winning-structure logic already covered by
 * tests/engine/winning.test.ts and tests/engine/scoring.test.ts.
 */

describe("waitingTiles", () => {
  it("lists the kinds that would complete a resting 13-tile hand", () => {
    const state = buildTestState({
      concealed: {
        0: [
          "characters-1", "characters-2", "characters-3",
          "bamboo-2", "bamboo-3", "bamboo-4",
          "dots-7", "dots-8", "dots-9",
          "wind-east", "wind-east", "wind-east",
          "dragon-red",
        ],
      },
    });
    expect(waitingTiles(state, 0)).toEqual(["dragon-red"]);
  });

  it("is empty while the seat is mid-turn holding an extra drawn tile", () => {
    const state = buildTestState({
      concealed: {
        0: [
          "characters-1", "characters-2", "characters-3",
          "bamboo-2", "bamboo-3", "bamboo-4",
          "dots-7", "dots-8", "dots-9",
          "wind-east", "wind-east", "wind-east",
          "dragon-red", "dragon-white",
        ],
      },
    });
    expect(waitingTiles(state, 0)).toEqual([]);
  });

  it("is empty for a hand nowhere near tenpai", () => {
    const state = buildTestState({
      concealed: {
        0: [
          "characters-1", "characters-5", "characters-9",
          "bamboo-1", "bamboo-5", "bamboo-9",
          "dots-1", "dots-5", "dots-9",
          "wind-east", "wind-south", "wind-west",
          "dragon-red",
        ],
      },
    });
    expect(waitingTiles(state, 0)).toEqual([]);
  });

  it("respects a fixed meld when computing the resting count", () => {
    const state = buildTestState({
      concealed: {
        0: [
          "bamboo-2", "bamboo-3", "bamboo-4",
          "dots-7", "dots-8", "dots-9",
          "wind-east", "wind-east", "wind-east",
          "dragon-red",
        ],
      },
      melds: {
        0: [{ type: "chow", exposure: "exposed", kinds: ["characters-1", "characters-2", "characters-3"], claimedFrom: 3 }],
      },
      discards: [{ seat: 3, kind: "characters-3" }],
    });
    expect(waitingTiles(state, 0)).toEqual(["dragon-red"]);
  });
});

describe("isStructurallyComplete", () => {
  it("is true when the seat's current tiles already form a legal winning shape", () => {
    const state = buildTestState({
      concealed: {
        0: [
          "characters-1", "characters-2", "characters-3",
          "bamboo-2", "bamboo-3", "bamboo-4",
          "dots-7", "dots-8", "dots-9",
          "wind-east", "wind-east", "wind-east",
          "dragon-red", "dragon-red",
        ],
      },
    });
    expect(isStructurallyComplete(state, 0)).toBe(true);
  });

  it("is false for a resting hand that has not yet drawn its 14th tile", () => {
    const state = buildTestState({
      concealed: {
        0: [
          "characters-1", "characters-2", "characters-3",
          "bamboo-2", "bamboo-3", "bamboo-4",
          "dots-7", "dots-8", "dots-9",
          "wind-east", "wind-east", "wind-east",
          "dragon-red",
        ],
      },
    });
    expect(isStructurallyComplete(state, 0)).toBe(false);
  });

  it("considers structure alone, independent of the minimum-faan floor", () => {
    // isStructurallyComplete never looks at the rules profile's minimum faan;
    // the app layer combines this with the engine's real win legality (which
    // does apply that floor, via MahjongGame.legalActions) to tell "not a
    // winning shape" apart from "complete, but below the table minimum".
    const state = buildTestState({
      concealed: {
        0: [
          "characters-2", "characters-3", "characters-4",
          "bamboo-2", "bamboo-3", "bamboo-4",
          "dots-2", "dots-3", "dots-4",
          "dots-5", "dots-6", "dots-7",
          "characters-8", "characters-8",
        ],
      },
    });
    expect(isStructurallyComplete(state, 0)).toBe(true);
  });
});
