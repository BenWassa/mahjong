import { describe, expect, it } from "vitest";

import {
  NO_COMPETENCE,
  scaffoldingFor,
  TURNS_TO_LEARN_THE_CONTROL,
} from "./scaffold";

/**
 * `ONBOARDING_DESIGN.md` §7.3, pinned down.
 *
 * The rule being protected is that help fades because the player demonstrated
 * something, not because time passed or hands were dealt — a hand counter
 * takes help away from somebody who has been guessing and keeps it in front of
 * somebody who understood it immediately.
 */
describe("the discard gesture stops being explained once it is demonstrated", () => {
  it("spells the gesture out for a player who has not thrown a tile yet", () => {
    expect(scaffoldingFor(NO_COMPETENCE, true).explainDiscardGesture).toBe(true);
  });

  it("keeps explaining it through the first unprompted turn", () => {
    expect(
      scaffoldingFor({ unpromptedTurns: 1, hasClaimed: false }, true).explainDiscardGesture,
    ).toBe(true);
  });

  it("stops at two unprompted turns", () => {
    expect(
      scaffoldingFor(
        { unpromptedTurns: TURNS_TO_LEARN_THE_CONTROL, hasClaimed: false },
        true,
      ).explainDiscardGesture,
    ).toBe(false);
  });

  it("never leads with the gesture on the full table", () => {
    // Somebody on Standard has not asked to be taught the controls, and #33
    // does not add coaching to a table that never had it.
    expect(scaffoldingFor(NO_COMPETENCE, false).explainDiscardGesture).toBe(false);
  });
});

describe("claims stop being explained once one has been taken", () => {
  it("explains the first claim offer", () => {
    expect(scaffoldingFor(NO_COMPETENCE, true).explainClaims).toBe(true);
  });

  it("relies on the normal interface afterwards", () => {
    // §7.3 ties this to having *claimed*, not to having read about claiming:
    // the Explain banner already fires on first occurrence, and this decides
    // what happens on the second.
    expect(
      scaffoldingFor({ unpromptedTurns: 0, hasClaimed: true }, true).explainClaims,
    ).toBe(false);
  });

  it("does not treat switching to Beginner as forgetting how to claim", () => {
    // Beginner is a table, not a competence. A player may switch to it after
    // fifty hands, and doing so must not put the training wheels back on.
    expect(
      scaffoldingFor({ unpromptedTurns: 9, hasClaimed: true }, true).explainClaims,
    ).toBe(false);
  });
});
