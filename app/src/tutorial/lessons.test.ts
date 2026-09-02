import { describe, expect, it } from "vitest";

import { newScenarioGame, type Seat, type Wind } from "@engine";

import { seatPosition, seatPositionName, windName } from "../game/labels";
import { LESSONS, lessonById } from "./lessons";
import { TUTORIAL_SEAT } from "./runner";

/**
 * The lessons' claims about the game, checked against the engine rather than
 * against a reading of the rules.
 *
 * A tutorial sentence is a promise: "either of these two tiles wins the hand"
 * is wrong if the engine would refuse the declaration, and "you are North" is
 * wrong if the deal seats the player somewhere else. Both kinds of mistake are
 * invisible to a test that only checks the lessons play through, which is why
 * they are asserted here from the tiles themselves.
 */

const seatWindOf = (lesson: (typeof LESSONS)[number], seat: Seat): Wind =>
  newScenarioGame(lesson.scenario).state(seat).players[seat].seatWind;

describe("what the lessons say about the seating is what the deal produces", () => {
  it("seats the player where each lesson's prompts say they are sitting", () => {
    // Both claim lessons name the player's own wind, and the pass step's
    // reasoning depends on it: a West pung is worthless precisely because West
    // is neither this seat's wind nor the round's.
    expect(windName(seatWindOf(lessonById("turn"), TUTORIAL_SEAT))).toBe("East");
    expect(windName(seatWindOf(lessonById("improve"), TUTORIAL_SEAT))).toBe("East");
    expect(windName(seatWindOf(lessonById("claims"), TUTORIAL_SEAT))).toBe("North");
  });

  it("puts each named opponent in the seat the prompt points at", () => {
    const claims = lessonById("claims");
    const where = (seat: Seat): string =>
      seatPositionName(seatPosition(seat, TUTORIAL_SEAT));
    // "the player on your right has thrown a Three of Dots" — seat 1.
    expect(where(1)).toBe("Right");
    // "the player on your left has thrown a Three of Bamboo" — seat 3, and
    // that is the only seat a Chow may be claimed from (RULE-CLAIM-1).
    expect(where(3)).toBe("Left");
    expect(claims.script?.[0]).toEqual({ seat: 1, discard: "dots-3" });
    expect(claims.script?.[2]).toEqual({ seat: 3, discard: "bamboo-3" });
  });
});

describe("what the lessons say about winning is what the engine allows", () => {
  it("leaves the improve lesson one tile away, on a hand the standard rules let you declare", () => {
    // The lesson closes on "you are now waiting on two tiles, and either of
    // them wins the hand". Under the standard profile that is only true if the
    // finished hand clears the minimum faan — four chows and a pair is Common
    // Hand, worth one (HKOS_RULES §5.A A1). The engine is asked directly:
    // `waitingTiles` reports only kinds that would produce a declarable win.
    const game = newScenarioGame({
      id: "improve-end-state",
      profile: lessonById("improve").scenario.profile,
      // Dealt from another seat so the player holds thirteen. `waitingTiles`
      // is only defined at a resting hand count — mid-turn, holding a
      // fourteenth tile, "waiting on" has no meaning yet.
      dealer: 1,
      hands: [
        [
          "characters-3", "characters-4", "characters-5",
          "bamboo-6", "bamboo-7", "bamboo-8",
          "dots-2", "dots-3", "dots-4",
          "dots-6", "dots-7",
          "wind-east", "wind-east",
        ],
        [], [], [],
      ],
    });

    expect([...game.waitingTiles(TUTORIAL_SEAT)].sort()).toEqual(["dots-5", "dots-8"]);
  });

  it("gives the win lesson a hand that qualifies without Beginner's relaxed floor", () => {
    // #30 forbids teaching the simplified profile as if it were the game, so
    // every lesson runs at the standard minimum faan. The winning hand is
    // built around a Red Dragon pung, worth one on its own (§5.B B1).
    const win = lessonById("win");
    expect(win.scenario.profile.minimumFaan).toBe(1);
    expect(win.scenario.hands[TUTORIAL_SEAT].filter((kind) => kind === "dragon-red")).toHaveLength(3);

    const game = newScenarioGame(win.scenario);
    expect([...game.waitingTiles(TUTORIAL_SEAT)]).toEqual(["dots-8"]);
  });

  it("runs every lesson at the standard profile, not Beginner's", () => {
    for (const lesson of LESSONS) {
      expect(lesson.scenario.profile.minimumFaan, lesson.id).toBe(1);
      expect(lesson.scenario.profile.tileSetSize, lesson.id).toBe(144);
    }
  });
});

describe("the reveal sequence", () => {
  it("opens the table for the first four lessons and closes it for the last", () => {
    // The progressive-hidden-information transition #30 asks for, asserted on
    // the catalogue so a reordered lesson cannot silently break it.
    const revealed = LESSONS.map((lesson) => lesson.reveal.length > 0);
    expect(revealed).toEqual([true, true, true, true, false]);
    expect(lessonById("win").reveal).toEqual([]);
  });
});
