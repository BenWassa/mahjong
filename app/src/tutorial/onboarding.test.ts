import { describe, expect, it } from "vitest";

import type { GameAction } from "@engine";

import {
  NOVICE_PHASES,
  REFRESHER_PHASES,
  phasesFor,
  resumeIndex,
  type OnboardingPhase,
} from "./onboarding";
import { TutorialRunner, TUTORIAL_SEAT, type TutorialSnapshot } from "./runner";

/**
 * The first-run walkthrough, played end to end on the production engine (#33).
 *
 * These prove that the scripted sequence *works* — that every phase reaches
 * its own last step through real engine transitions, that no step offers an
 * action the engine has not ruled legal, and that no opponent's concealed
 * tiles are anywhere the player could reach them.
 *
 * They deliberately prove nothing about comprehension. Whether a novice comes
 * out of this understanding what they are doing is the question
 * `ONBOARDING_DESIGN.md` §14 puts to real people, and no assertion here should
 * ever be cited as having answered it.
 */

/**
 * A synchronous stand-in for the runner's timers, with a clock the hint ladder
 * can be driven against. Draining the queue plays the table forward as fast as
 * the test needs while keeping the ordering the real timer produces.
 */
function createClock(): {
  schedule: (run: () => void, ms: number) => () => void;
  now: () => number;
  advance: (ms: number) => void;
  flush: () => void;
} {
  let time = 0;
  let pending: { run: () => void; at: number }[] = [];
  return {
    schedule(run, ms) {
      const entry = { run, at: time + ms };
      pending.push(entry);
      return () => { pending = pending.filter((candidate) => candidate !== entry); };
    },
    now: () => time,
    advance(ms) {
      time += ms;
      // Only what is genuinely due, so a hint deadline cannot be pulled
      // forward by an unrelated opponent move sitting in the same queue.
      for (let guard = 0; guard < 200; guard += 1) {
        const due = pending.filter((entry) => entry.at <= time);
        if (due.length === 0) break;
        pending = pending.filter((entry) => entry.at > time);
        for (const entry of due) entry.run();
      }
    },
    /*
     * Runs the table forward to wherever it next needs the player — and no
     * further. The horizon matters: opponent pacing is well under a second,
     * while the hint ladder's first rung is five, so draining *everything*
     * would have the test sit through twenty seconds of imaginary hesitation
     * on every step and arrive with the ladder already at the top.
     */
    flush() {
      for (let guard = 0; guard < 500; guard += 1) {
        const horizon = time + 1000;
        const due = pending.filter((entry) => entry.at <= horizon);
        if (due.length === 0) return;
        pending = pending.filter((entry) => entry.at > horizon);
        for (const entry of due) {
          time = Math.max(time, entry.at);
          entry.run();
        }
      }
      throw new Error("Walkthrough pacing never settled");
    },
  };
}

interface Harness {
  readonly runner: TutorialRunner;
  readonly flush: () => void;
  readonly advance: (ms: number) => void;
}

function start(phase: OnboardingPhase, autoAdvance = false): Harness {
  const clock = createClock();
  const runner = new TutorialRunner({
    lesson: phase,
    schedule: clock.schedule,
    now: clock.now,
    autoAdvance,
  });
  clock.flush();
  return { runner, flush: clock.flush, advance: clock.advance };
}

function playStep(harness: Harness): void {
  const before = harness.runner.snapshot();
  const step = before.step;

  if (step.kind === "act") {
    const offered = before.legalActions;
    expect(
      offered.length,
      `${before.lessonId}/${step.id}: nothing was offered`,
    ).toBeGreaterThan(0);
    const { goal } = step;
    const correct = offered.find((action) => goal(action, before.view));
    if (correct === undefined) {
      throw new Error(`${before.lessonId}/${step.id}: no offered action satisfies the goal`);
    }
    harness.runner.act(correct);
    expect(
      harness.runner.snapshot().stepSatisfied,
      `${before.lessonId}/${step.id} not satisfied`,
    ).toBe(true);
  }

  if (step.kind === "identify") {
    throw new Error(`${before.lessonId}/${step.id}: the walkthrough uses no identify steps`);
  }

  harness.runner.advance();
  harness.flush();
}

function playPhase(phase: OnboardingPhase): TutorialSnapshot {
  const harness = start(phase);
  for (let guard = 0; guard < 40; guard += 1) {
    if (harness.runner.snapshot().finished) break;
    playStep(harness);
  }
  expect(harness.runner.snapshot().finished, `${phase.id} did not finish`).toBe(true);
  return harness.runner.snapshot();
}

const ALL_PHASES: readonly OnboardingPhase[] = [...NOVICE_PHASES, ...REFRESHER_PHASES];

describe("every walkthrough phase plays through on real engine transitions", () => {
  for (const phase of ALL_PHASES) {
    it(`completes ${phase.id}`, () => {
      playPhase(phase);
    });
  }
});

describe("the walkthrough is deterministic", () => {
  it("deals an identical opening position every time a phase is started", () => {
    for (const phase of ALL_PHASES) {
      const first = start(phase).runner.snapshot();
      const second = start(phase).runner.snapshot();
      expect(JSON.stringify(first.view), phase.id).toBe(JSON.stringify(second.view));
    }
  });
});

describe("hidden information", () => {
  it("reveals no opponent hand anywhere on the first-run path", () => {
    for (const phase of ALL_PHASES) {
      expect(phase.reveal, `${phase.id} reveals a seat`).toEqual([]);
      const harness = start(phase);
      for (let guard = 0; guard < 40; guard += 1) {
        const snapshot = harness.runner.snapshot();
        // §8.1: Peek is optional teaching material, not part of the mandatory
        // novice information model. An empty map is what makes the control
        // impossible to draw at all, rather than merely hidden.
        expect(snapshot.openHands.size, `${phase.id} opened a hand`).toBe(0);
        for (const seat of [1, 2, 3] as const) {
          expect(
            snapshot.view.players[seat].concealed,
            `${phase.id} seat ${String(seat)}`,
          ).toBeNull();
        }
        if (snapshot.finished) break;
        playStep(harness);
      }
    }
  });
});

describe("a step only ever removes options", () => {
  it("offers nothing the engine has not already ruled legal", () => {
    for (const phase of ALL_PHASES) {
      const harness = start(phase);
      for (let guard = 0; guard < 40; guard += 1) {
        const snapshot = harness.runner.snapshot();
        if (snapshot.finished) break;
        const legalNow = snapshot.legalActions;
        for (const offered of legalNow) {
          // A step narrows the player's own legal actions; it can never reach
          // another seat, and nothing here is allowed to move an opponent.
          expect(
            offered.type === "continue" || offered.seat === TUTORIAL_SEAT,
            `${phase.id}: an offered action was not the player's`,
          ).toBe(true);
        }
        playStep(harness);
      }
    }
  });
});

describe("every teaching step is spatially tethered", () => {
  /*
   * §5.1: an object-specific instruction must not live only in the global
   * coach strip. This asserts the content side of that — every step either
   * names the object it is about, or is one of the genuinely whole-table
   * ideas the design reserves the strip for.
   */
  it("gives every step a focus target", () => {
    for (const phase of ALL_PHASES) {
      for (const step of phase.steps) {
        expect(step.focus, `${phase.id}/${step.id} has no focus`).toBeDefined();
        expect(step.focus?.callout.length ?? 0, `${phase.id}/${step.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("resolves every focus to at least one selector at the moment it is live", () => {
    for (const phase of ALL_PHASES) {
      const harness = start(phase);
      for (let guard = 0; guard < 40; guard += 1) {
        const snapshot = harness.runner.snapshot();
        if (snapshot.finished) break;
        const focus = snapshot.step.focus;
        expect(focus, `${phase.id}/${snapshot.step.id}`).toBeDefined();
        const targets = focus?.targets(snapshot.view) ?? [];
        expect(
          targets.length,
          `${phase.id}/${snapshot.step.id} resolved to no target`,
        ).toBeGreaterThan(0);
        playStep(harness);
      }
    }
  });
});

describe("the independent turn accepts any defensible discard", () => {
  /*
   * §6 N2, as amended after implementation review. This step exists to find
   * out whether the learner reasons about their hand, so it must not reject a
   * sound throw for not being the one the author had in mind — §14.9 lists
   * hunting for the highlighted answer as a critical failure sign, and an
   * exact-match goal is how a tutorial teaches exactly that.
   */
  const phase = NOVICE_PHASES[0];

  function reachIndependentTurn(): Harness {
    const harness = start(phase as OnboardingPhase);
    for (let guard = 0; guard < 40; guard += 1) {
      if (harness.runner.snapshot().step.id === "your-turn") return harness;
      playStep(harness);
    }
    throw new Error("never reached the independent turn");
  }

  function kindOf(action: GameAction, snapshot: TutorialSnapshot): string | null {
    if (action.type !== "discard") return null;
    const hand = snapshot.view.players[TUTORIAL_SEAT].concealed ?? [];
    return hand.find((tile) => tile.id === action.tileId)?.kind ?? null;
  }

  it("accepts each of the three spare tiles", () => {
    for (const spare of ["characters-9", "wind-west", "dots-2"]) {
      const harness = reachIndependentTurn();
      const snapshot = harness.runner.snapshot();
      const action = snapshot.legalActions.find(
        (candidate) => kindOf(candidate, snapshot) === spare,
      );
      expect(action, `${spare} was not offered`).toBeDefined();
      if (action === undefined) continue;
      harness.runner.act(action);
      expect(harness.runner.snapshot().stepSatisfied, spare).toBe(true);
    }
  });

  it("corrects a throw that breaks the pair, and leaves the position untouched", () => {
    const harness = reachIndependentTurn();
    const before = harness.runner.snapshot();
    const action = before.legalActions.find(
      (candidate) => kindOf(candidate, before) === "dragon-red",
    );
    expect(action).toBeDefined();
    if (action === undefined) return;
    harness.runner.act(action);
    const after = harness.runner.snapshot();
    expect(after.stepSatisfied).toBe(false);
    expect(after.feedback?.tone).toBe("correction");
    expect(after.feedback?.text).toMatch(/pair/i);
    // The whole point of refusing rather than applying: a wrong answer must
    // not push the learner into a position nobody designed.
    expect(JSON.stringify(after.view)).toBe(JSON.stringify(before.view));
  });
});

describe("the hint ladder escalates with hesitation", () => {
  const phase = NOVICE_PHASES[0] as OnboardingPhase;

  it("opens silent on a step the learner is meant to reason about", () => {
    const harness = start(phase);
    for (let guard = 0; guard < 40; guard += 1) {
      if (harness.runner.snapshot().step.id === "your-turn") break;
      playStep(harness);
    }
    expect(harness.runner.snapshot().step.id).toBe("your-turn");
    expect(harness.runner.snapshot().hintLevel).toBe(0);
    expect(harness.runner.snapshot().hint).toBeNull();

    harness.advance(5000);
    expect(harness.runner.snapshot().hintLevel).toBe(1);
    expect(harness.runner.snapshot().hint).not.toBeNull();

    harness.advance(5000);
    expect(harness.runner.snapshot().hintLevel).toBe(2);

    harness.advance(10000);
    const stuck = harness.runner.snapshot();
    expect(stuck.hintLevel).toBe(3);
    expect(stuck.rescueOffered).toBe(true);
  });

  it("opens explicit on a step that is only teaching a control", () => {
    const harness = start(phase);
    for (let guard = 0; guard < 40; guard += 1) {
      if (harness.runner.snapshot().step.id === "first-discard") break;
      playStep(harness);
    }
    const snapshot = harness.runner.snapshot();
    expect(snapshot.step.id).toBe("first-discard");
    // Making a novice discover a private interaction convention by trial and
    // error is not teaching (§5.4), so this one does not make them wait.
    expect(snapshot.hintLevel).toBe(2);
    expect(snapshot.hint).not.toBeNull();
  });

  it("marks a rescued answer as rescued rather than as comprehension", () => {
    const harness = start(phase);
    for (let guard = 0; guard < 40; guard += 1) {
      if (harness.runner.snapshot().step.id === "your-turn") break;
      playStep(harness);
    }
    harness.advance(20000);
    expect(harness.runner.snapshot().rescueOffered).toBe(true);
    harness.runner.rescue();
    const after = harness.runner.snapshot();
    expect(after.stepSatisfied).toBe(true);
    expect(after.rescued).toBe(true);
  });

  it("refuses a rescue before the ladder has reached it", () => {
    const harness = start(phase);
    for (let guard = 0; guard < 40; guard += 1) {
      if (harness.runner.snapshot().step.id === "your-turn") break;
      playStep(harness);
    }
    harness.runner.rescue();
    expect(harness.runner.snapshot().stepSatisfied).toBe(false);
  });

  it("does not count time spent behind an overlay as hesitation", () => {
    const harness = start(phase);
    for (let guard = 0; guard < 40; guard += 1) {
      if (harness.runner.snapshot().step.id === "your-turn") break;
      playStep(harness);
    }
    harness.runner.setPaused(true);
    harness.advance(30000);
    expect(harness.runner.snapshot().hintLevel).toBe(0);
    harness.runner.setPaused(false);
    expect(harness.runner.snapshot().hintLevel).toBe(0);
    harness.advance(5000);
    expect(harness.runner.snapshot().hintLevel).toBe(1);
  });
});

describe("a satisfied step advances itself", () => {
  it("moves on after the note has been read, without a Next press", () => {
    const phase = REFRESHER_PHASES[0] as OnboardingPhase;
    const harness = start(phase, true);
    const before = harness.runner.snapshot();
    expect(before.step.id).toBe("tap-tap");
    const { goal } = before.step.kind === "act" ? before.step : { goal: () => false };
    const action = before.legalActions.find((candidate) => goal(candidate, before.view));
    expect(action).toBeDefined();
    if (action === undefined) return;
    harness.runner.act(action);
    expect(harness.runner.snapshot().stepSatisfied).toBe(true);
    expect(harness.runner.snapshot().step.id).toBe("tap-tap");
    harness.advance(3000);
    expect(harness.runner.snapshot().step.id).not.toBe("tap-tap");
  });
});

describe("resume lands on a phase boundary", () => {
  it("returns the stored phase, and the start for anything it cannot place", () => {
    expect(resumeIndex("novice", null)).toBe(0);
    expect(resumeIndex("novice", "claim")).toBe(1);
    expect(resumeIndex("novice", "win")).toBe(2);
    // A phase renamed between builds must cost the learner a restart, never a
    // failure to load (§3.3).
    expect(resumeIndex("novice", "no-such-phase")).toBe(0);
    expect(resumeIndex("refresher", "refresh")).toBe(0);
  });

  it("routes each path to its own phases", () => {
    expect(phasesFor("novice")).toBe(NOVICE_PHASES);
    expect(phasesFor("refresher")).toBe(REFRESHER_PHASES);
  });
});
