import { describe, expect, it } from "vitest";

import {
  DEFAULT_HINT_TIMING,
  hintLevelAt,
  nextHintDeadline,
  type HintLevel,
} from "./hints";

/**
 * The timed assistance ladder of `ONBOARDING_DESIGN.md` §5.4.
 *
 * The rule the tests pin down is the shape, not the seconds: §5.4 says the
 * numbers have to be tuned on real players, so every assertion below either
 * passes its own timing in or reads the constant rather than repeating 5000.
 * What must not change is the order — a learner who can work the answer out is
 * given the chance to, and a learner who cannot is not left stuck.
 */

const { softMs, explicitMs, rescueMs } = DEFAULT_HINT_TIMING;

/** A tuned-down ladder, to prove the escalation is not welded to the defaults. */
const BRISK = { softMs: 2000, explicitMs: 4000, rescueMs: 8000 };

function levelsAt(idles: readonly number[]): HintLevel[] {
  return idles.map((idle) => hintLevelAt(idle));
}

describe("the assistance ladder for a step the learner should reason out", () => {
  it("says nothing at first, because working the answer out is the evidence", () => {
    // §5.4 step 1: do not reveal the answer while the player is supposed to be
    // deciding. Opening at the explicit level would teach hunting, not play.
    expect(levelsAt([0, 1, softMs - 1])).toEqual([0, 0, 0]);
  });

  it("narrows the search space once the player has hesitated", () => {
    // §5.4 step 2: a soft hint strengthens the target's outline. It says where
    // to look, still not what to do.
    expect(levelsAt([softMs, softMs + 1, explicitMs - 1])).toEqual([1, 1, 1]);
  });

  it("names the action once hesitation has become being stuck", () => {
    // §5.4 step 3: leader plus concrete action language or a suggested tile.
    expect(levelsAt([explicitMs, explicitMs + 1, rescueMs - 1])).toEqual([2, 2, 2]);
  });

  it("offers a way out rather than repeating itself indefinitely", () => {
    // §5.4 step 4: the rescue. It is the top of the ladder and it stays there.
    expect(levelsAt([rescueMs, rescueMs + 1, rescueMs * 10])).toEqual([3, 3, 3]);
  });

  it("escalates in the order the design lists, never skipping or falling back", () => {
    let previous = hintLevelAt(0);
    for (let idle = 0; idle <= rescueMs + 5000; idle += 250) {
      const level = hintLevelAt(idle);
      expect(level, `${String(idle)}ms`).toBeGreaterThanOrEqual(previous);
      expect(level - previous, `${String(idle)}ms`).toBeLessThanOrEqual(1);
      previous = level;
    }
    expect(previous).toBe(3);
  });
});

describe("the assistance ladder for a step that teaches a control", () => {
  /*
   * §5.4's exception: tap once to lift, tap again to discard is a private
   * interface convention. There is nothing to reason out and no comprehension
   * to demonstrate, so withholding the instruction is a puzzle nobody set.
   */

  it("opens at the explicit level instead of making the player guess", () => {
    expect(hintLevelAt(0, DEFAULT_HINT_TIMING, true)).toBe(2);
    expect(hintLevelAt(softMs, DEFAULT_HINT_TIMING, true)).toBe(2);
    expect(hintLevelAt(explicitMs, DEFAULT_HINT_TIMING, true)).toBe(2);
  });

  it("still reaches the rescue, because being shown is not the same as being able", () => {
    expect(hintLevelAt(rescueMs - 1, DEFAULT_HINT_TIMING, true)).toBe(2);
    expect(hintLevelAt(rescueMs, DEFAULT_HINT_TIMING, true)).toBe(3);
    expect(hintLevelAt(rescueMs * 3, DEFAULT_HINT_TIMING, true)).toBe(3);
  });
});

describe("the next moment the cue would strengthen", () => {
  it("counts down to each rung in turn", () => {
    // The React layer schedules one timer from this rather than polling, so
    // the remaining time has to be relative to now, not absolute.
    expect(nextHintDeadline(0)).toBe(softMs);
    expect(nextHintDeadline(softMs - 1)).toBe(1);
    expect(nextHintDeadline(softMs)).toBe(explicitMs - softMs);
    expect(nextHintDeadline(explicitMs)).toBe(rescueMs - explicitMs);
  });

  it("stops asking to be woken once the ladder is exhausted", () => {
    // Null is what lets the caller cancel its timer at the rescue rung instead
    // of re-rendering a hint that can no longer change.
    expect(nextHintDeadline(rescueMs)).toBeNull();
    expect(nextHintDeadline(rescueMs + 1)).toBeNull();
  });

  it("skips straight to the rescue for a control-teaching step", () => {
    // Such a step is already at the explicit level, so the soft and explicit
    // marks are not rungs it has left to climb.
    expect(nextHintDeadline(0, DEFAULT_HINT_TIMING, true)).toBe(rescueMs);
    expect(nextHintDeadline(softMs, DEFAULT_HINT_TIMING, true)).toBe(rescueMs - softMs);
    expect(nextHintDeadline(explicitMs, DEFAULT_HINT_TIMING, true)).toBe(rescueMs - explicitMs);
    expect(nextHintDeadline(rescueMs, DEFAULT_HINT_TIMING, true)).toBeNull();
  });

  it("lands exactly on the moment the level changes", () => {
    // A deadline that undershot would fire a timer that changed nothing; one
    // that overshot would leave a stuck learner waiting past their rung.
    for (const idle of [0, 1234, softMs, softMs + 10, explicitMs, rescueMs - 1]) {
      const remaining = nextHintDeadline(idle);
      expect(remaining, `${String(idle)}ms`).not.toBeNull();
      if (remaining === null) continue;
      expect(hintLevelAt(idle + remaining), `${String(idle)}ms`).toBeGreaterThan(
        hintLevelAt(idle + remaining - 1),
      );
    }
  });
});

describe("timings the product may retune", () => {
  it("honours a ladder passed in rather than the shipped defaults", () => {
    expect(hintLevelAt(1999, BRISK)).toBe(0);
    expect(hintLevelAt(2000, BRISK)).toBe(1);
    expect(hintLevelAt(4000, BRISK)).toBe(2);
    expect(hintLevelAt(8000, BRISK)).toBe(3);
  });

  it("counts down against the ladder it was given", () => {
    expect(nextHintDeadline(0, BRISK)).toBe(2000);
    expect(nextHintDeadline(2000, BRISK)).toBe(2000);
    expect(nextHintDeadline(4000, BRISK)).toBe(4000);
    expect(nextHintDeadline(8000, BRISK)).toBeNull();
    expect(nextHintDeadline(0, BRISK, true)).toBe(8000);
  });

  it("ships defaults in the order §5.4 describes", () => {
    // Roughly five, ten, and prolonged. The exact seconds are provisional; the
    // ordering is not, and a retune that inverted it would break the ladder.
    expect(softMs).toBeLessThan(explicitMs);
    expect(explicitMs).toBeLessThan(rescueMs);
  });
});
