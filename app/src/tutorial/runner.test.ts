import { describe, expect, it } from "vitest";

import { LESSONS, lessonById, type Lesson } from "./lessons";
import { TutorialRunner, TUTORIAL_SEAT } from "./runner";

/**
 * A synchronous stand-in for the pacing timer. The runner schedules one
 * opponent move at a time, so draining this queue plays the table forward as
 * fast as the test needs while keeping the ordering the real timer produces.
 */
function createClock(): { schedule: (run: () => void, ms: number) => () => void; flush: () => void } {
  let pending: (() => void)[] = [];
  return {
    schedule(run) {
      pending.push(run);
      return () => { pending = pending.filter((entry) => entry !== run); };
    },
    flush() {
      for (let guard = 0; guard < 500 && pending.length > 0; guard += 1) {
        const next = pending.shift();
        next?.();
      }
      if (pending.length > 0) throw new Error("Tutorial pacing never settled");
    },
  };
}

interface Harness {
  readonly runner: TutorialRunner;
  readonly flush: () => void;
}

function start(lesson: Lesson): Harness {
  const clock = createClock();
  const runner = new TutorialRunner({ lesson, schedule: clock.schedule });
  clock.flush();
  return { runner, flush: clock.flush };
}

/** Plays one step the way the interface would, and moves to the next. */
function playStep({ runner, flush }: Harness): void {
  const before = runner.snapshot();
  const step = before.step;

  if (step.kind === "identify") {
    const hand = before.view.players[TUTORIAL_SEAT].concealed ?? [];
    const target = hand.find((tile) =>
      step.groups.some((group) =>
        (group as readonly string[]).includes(tile.kind),
      ),
    );
    if (target === undefined) {
      throw new Error(`${before.lessonId}/${step.id}: no tile matches the step's groups`);
    }
    runner.identify(target.id);
    expect(runner.snapshot().stepSatisfied, `${before.lessonId}/${step.id} not satisfied`).toBe(true);
  }

  if (step.kind === "act") {
    const offered = before.legalActions;
    expect(offered.length, `${before.lessonId}/${step.id}: nothing was offered`).toBeGreaterThan(0);
    const { goal } = step;
    const correct = offered.find((action) => goal(action, before.view));
    if (correct === undefined) {
      throw new Error(`${before.lessonId}/${step.id}: no offered action satisfies the goal`);
    }
    runner.act(correct);
    expect(runner.snapshot().stepSatisfied, `${before.lessonId}/${step.id} not satisfied`).toBe(true);
  }

  runner.advance();
  flush();
}

function playLesson(lesson: Lesson): TutorialRunner {
  const harness = start(lesson);
  for (let guard = 0; guard < 40; guard += 1) {
    if (harness.runner.snapshot().finished) break;
    playStep(harness);
  }
  expect(harness.runner.snapshot().finished, `${lesson.id} did not finish`).toBe(true);
  return harness.runner;
}

describe("every core lesson plays through on real engine transitions", () => {
  for (const lesson of LESSONS) {
    it(`completes ${lesson.id}`, () => {
      playLesson(lesson);
    });
  }
});

describe("lesson determinism", () => {
  it("deals an identical opening hand every time a lesson is started", () => {
    for (const lesson of LESSONS) {
      const first = start(lesson).runner.snapshot();
      const second = start(lesson).runner.snapshot();
      expect(JSON.stringify(first.view)).toBe(JSON.stringify(second.view));
    }
  });
});

describe("hidden information", () => {
  it("never puts an opponent's concealed tiles in the redacted view", () => {
    for (const lesson of LESSONS) {
      const { view } = start(lesson).runner.snapshot();
      for (const seat of [1, 2, 3] as const) {
        expect(view.players[seat].concealed, `${lesson.id} seat ${String(seat)}`).toBeNull();
      }
      expect(view.players[0].concealed).not.toBeNull();
    }
  });

  it("opens only the seats the lesson names, and closes them for the last lesson", () => {
    const claims = start(lessonById("claims")).runner.snapshot();
    expect([...claims.openHands.keys()].sort()).toEqual([1, 2, 3]);
    const win = start(lessonById("win")).runner.snapshot();
    expect(win.openHands.size).toBe(0);
  });
});

describe("a step only ever removes options", () => {
  it("offers nothing the engine has not already ruled legal", () => {
    for (const lesson of LESSONS) {
      const harness = start(lesson);
      for (let guard = 0; guard < 40; guard += 1) {
        const snapshot = harness.runner.snapshot();
        if (snapshot.finished) break;
        for (const offered of snapshot.legalActions) {
          expect(
            offered.type === "continue" || offered.seat === TUTORIAL_SEAT,
            `${lesson.id} offered another seat's action`,
          ).toBe(true);
        }
        playStep(harness);
      }
    }
  });
});

describe("a wrong answer leaves the game exactly where it was", () => {
  it("refuses a legal move that is not the one the step teaches, and says why", () => {
    const harness = start(lessonById("improve"));
    // Step 0 is a note; step 1 is the first discard decision.
    harness.runner.advance();
    harness.flush();

    const before = harness.runner.snapshot();
    expect(before.step.id).toBe("lonely");
    const wrong = before.legalActions.find(
      (action) =>
        action.type === "discard" &&
        (before.view.players[TUTORIAL_SEAT].concealed ?? []).some(
          (tile) => tile.id === action.tileId && tile.kind === "bamboo-7",
        ),
    );
    if (wrong === undefined) throw new Error("The step did not offer the Seven of Bamboo");

    harness.runner.act(wrong);
    const after = harness.runner.snapshot();

    expect(after.stepSatisfied).toBe(false);
    expect(after.feedback?.tone).toBe("correction");
    // The reason is composed from the move, not one line covering every answer.
    expect(after.feedback?.text).toContain("Seven and Eight of Bamboo");
    // Nothing was applied: same hand, same discard pile, same step.
    expect(JSON.stringify(after.view)).toBe(JSON.stringify(before.view));
    expect(after.step.id).toBe("lonely");
  });

  it("accepts the taught move afterwards, so a mistake costs only a retry", () => {
    const harness = start(lessonById("improve"));
    harness.runner.advance();
    harness.flush();

    const before = harness.runner.snapshot();
    const wrong = before.legalActions.find(
      (action) =>
        action.type === "discard" &&
        (before.view.players[TUTORIAL_SEAT].concealed ?? []).some(
          (tile) => tile.id === action.tileId && tile.kind === "wind-east",
        ),
    );
    if (wrong === undefined) throw new Error("The step did not offer the East Wind");
    harness.runner.act(wrong);
    expect(harness.runner.snapshot().stepSatisfied).toBe(false);

    playStep(harness);
    expect(harness.runner.snapshot().step.id).not.toBe("lonely");
  });

  it("ignores an action the step did not offer, rather than playing it", () => {
    const harness = start(lessonById("improve"));
    harness.runner.advance();
    harness.flush();

    const before = harness.runner.snapshot();
    const hidden = (before.view.players[TUTORIAL_SEAT].concealed ?? []).find(
      (tile) => tile.kind === "dragon-green",
    );
    if (hidden === undefined) throw new Error("The lesson's hand changed");
    // Legal by the engine's reckoning, and deliberately not on offer here.
    harness.runner.act({ type: "discard", seat: TUTORIAL_SEAT, tileId: hidden.id });

    expect(JSON.stringify(harness.runner.snapshot().view)).toBe(JSON.stringify(before.view));
  });
});

describe("identify steps", () => {
  it("marks the whole shape the player pointed at, and no more", () => {
    const harness = start(lessonById("shape"));
    harness.runner.advance();
    harness.flush();

    const hand = harness.runner.snapshot().view.players[TUTORIAL_SEAT].concealed ?? [];
    const target = hand.find((tile) => tile.kind === "bamboo-3");
    if (target === undefined) throw new Error("The lesson's hand changed");
    harness.runner.identify(target.id);

    const marked = harness.runner.snapshot();
    expect(marked.identified).toHaveLength(3);
    const kinds = marked.identified.map(
      (id) => hand.find((tile) => tile.id === id)?.kind,
    );
    expect(kinds.sort()).toEqual(["bamboo-2", "bamboo-3", "bamboo-4"]);
  });

  it("corrects a tile that belongs to no shape the step is asking for", () => {
    const harness = start(lessonById("shape"));
    harness.runner.advance();
    harness.flush();

    const hand = harness.runner.snapshot().view.players[TUTORIAL_SEAT].concealed ?? [];
    const target = hand.find((tile) => tile.kind === "dragon-red");
    if (target === undefined) throw new Error("The lesson's hand changed");
    harness.runner.identify(target.id);

    const after = harness.runner.snapshot();
    expect(after.stepSatisfied).toBe(false);
    expect(after.feedback?.tone).toBe("correction");
    expect(after.identified).toHaveLength(0);
  });
});

describe("scenario games stay out of the resumable-game slot", () => {
  it("writes nothing to local storage while a whole lesson is played", () => {
    // A scenario record cannot be rebuilt by replayGame, which derives the wall
    // from the seed, so one written to the resume slot would be read back as a
    // corrupt game. The runner must never touch storage at all.
    window.localStorage.clear();
    for (const lesson of LESSONS) playLesson(lesson);
    expect(window.localStorage.length).toBe(0);
  });
});

describe("holding the lesson still for Peek", () => {
  /**
   * A clock that reports whether the runner is currently waiting on a timer,
   * rather than draining it. Peek's whole promise is that nothing moves while
   * it is open, and the way to assert that is that no move is even scheduled.
   */
  function createPausableClock(): {
    schedule: (run: () => void, ms: number) => () => void;
    pending: () => number;
    tick: () => void;
  } {
    let queue: (() => void)[] = [];
    return {
      schedule(run) {
        queue.push(run);
        return () => { queue = queue.filter((entry) => entry !== run); };
      },
      pending: () => queue.length,
      tick() {
        const next = queue.shift();
        next?.();
      },
    };
  }

  it("cancels the opponent move that was already in flight", () => {
    const clock = createPausableClock();
    const runner = new TutorialRunner({
      lesson: lessonById("claims"),
      schedule: clock.schedule,
    });
    expect(clock.pending()).toBeGreaterThan(0);

    runner.setPaused(true);
    expect(runner.snapshot().paused).toBe(true);
    expect(clock.pending()).toBe(0);
  });

  it("changes nothing about the position it is holding", () => {
    const clock = createPausableClock();
    const runner = new TutorialRunner({
      lesson: lessonById("claims"),
      schedule: clock.schedule,
    });
    const before = runner.snapshot();

    runner.setPaused(true);
    const during = runner.snapshot();

    // The engine state, the step and the revealed hands are all identical:
    // pausing is pacing, not a save and restore of anything.
    expect(during.stepIndex).toBe(before.stepIndex);
    expect(during.view.discards).toEqual(before.view.discards);
    expect(during.view.players[TUTORIAL_SEAT].concealed).toEqual(
      before.view.players[TUTORIAL_SEAT].concealed,
    );
    for (const [seat, tiles] of before.openHands) {
      expect(during.openHands.get(seat)).toEqual(tiles);
    }
  });

  it("picks the table back up where it left it", () => {
    const clock = createPausableClock();
    const runner = new TutorialRunner({
      lesson: lessonById("claims"),
      schedule: clock.schedule,
    });
    const discardsBefore = runner.snapshot().view.discards.length;

    runner.setPaused(true);
    expect(clock.pending()).toBe(0);
    runner.setPaused(false);
    expect(runner.snapshot().paused).toBe(false);
    expect(clock.pending()).toBe(1);

    clock.tick();
    expect(runner.snapshot().view.discards.length).toBeGreaterThanOrEqual(discardsBefore);
  });

  it("is idempotent, so a double close cannot double-schedule the table", () => {
    const clock = createPausableClock();
    const runner = new TutorialRunner({
      lesson: lessonById("claims"),
      schedule: clock.schedule,
    });
    runner.setPaused(true);
    runner.setPaused(true);
    runner.setPaused(false);
    runner.setPaused(false);
    expect(clock.pending()).toBe(1);
  });
});
