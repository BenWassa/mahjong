import { describe, expect, it } from "vitest";

import { replayGame, type GameAction, type GameRecord, type Seat } from "@engine";

import { reducePlayerActions } from "./interaction";
import { GameSession, PLAYER_SEAT } from "./session";

/**
 * The turn loop. Bots are driven through a controllable clock so the whole
 * match can be played without waiting for real timers, and so the ordering
 * guarantees are asserted rather than observed.
 */

/** A schedule that runs pending work only when the test says so. */
function manualClock(): {
  schedule: (run: () => void, ms: number) => () => void;
  flush: (steps?: number) => number;
  pending: () => number;
} {
  let queue: (() => void)[] = [];
  return {
    schedule(run) {
      queue.push(run);
      return () => {
        queue = queue.filter((item) => item !== run);
      };
    },
    pending: () => queue.length,
    flush(steps = 1000) {
      let ran = 0;
      for (let index = 0; index < steps; index += 1) {
        const next = queue.shift();
        if (next === undefined) break;
        next();
        ran += 1;
      }
      return ran;
    },
  };
}

function newSession(seed = "session-test") {
  const clock = manualClock();
  const session = new GameSession({ seed, schedule: clock.schedule });
  return { session, clock };
}

describe("GameSession", () => {
  it("deals the player a hand and offers only their own actions", () => {
    const { session } = newSession();
    const snapshot = session.snapshot();
    expect(snapshot.view.viewer).toBe(PLAYER_SEAT);
    expect(snapshot.view.players[PLAYER_SEAT].concealed).not.toBeNull();
    for (const action of snapshot.legalActions) {
      if (action.type !== "continue") expect(action.seat).toBe(PLAYER_SEAT);
    }
  });

  it("never exposes another seat's concealed tiles to the viewer", () => {
    const { session, clock } = newSession();
    for (let turn = 0; turn < 40; turn += 1) {
      const { view, legalActions } = session.snapshot();
      for (const seat of [1, 2, 3] as Seat[]) {
        expect(view.players[seat].concealed).toBeNull();
      }
      const discard = legalActions.find((action) => action.type === "discard");
      if (discard !== undefined) {
        session.act(discard);
      } else {
        const pass = legalActions.find((action) => action.type === "pass");
        if (pass !== undefined) session.act(pass);
      }
      clock.flush(6);
    }
  });

  it("refuses an action submitted for another seat", () => {
    const { session } = newSession();
    const illegal = { type: "pass", seat: 2 } as GameAction;
    expect(() => { session.act(illegal); }).toThrow(/own seat/i);
  });

  it("does not advance the game without the clock", () => {
    const { session, clock } = newSession("no-auto-advance");
    const before = session.snapshot().view;
    // Opponents move on a timer; nothing may happen while it is held.
    expect(clock.pending()).toBeLessThanOrEqual(1);
    const after = session.snapshot().view;
    expect(after.wallCount).toBe(before.wallCount);
  });

  it("notifies subscribers when the table changes", () => {
    const { session, clock } = newSession();
    let calls = 0;
    const stop = session.subscribe(() => { calls += 1; });
    const discard = session
      .snapshot()
      .legalActions.find((action) => action.type === "discard");
    if (discard !== undefined) session.act(discard);
    clock.flush(4);
    expect(calls).toBeGreaterThan(0);
    stop();
  });

  it("plays a full hand to a result through the public interface alone", () => {
    const { session, clock } = newSession("full-hand");
    let guard = 0;
    while (guard < 4000) {
      guard += 1;
      const { view, legalActions } = session.snapshot();
      if (view.phase.kind === "hand-ended" || view.phase.kind === "match-ended") break;
      const discard = legalActions.find((action) => action.type === "discard");
      const pass = legalActions.find((action) => action.type === "pass");
      if (discard !== undefined) session.act(discard);
      else if (pass !== undefined) session.act(pass);
      else if (clock.flush(1) === 0) break;
    }
    const phase = session.snapshot().view.phase;
    expect(["hand-ended", "match-ended"]).toContain(phase.kind);
  });

  it("stops scheduling once disposed", () => {
    const { session, clock } = newSession();
    session.dispose();
    clock.flush();
    expect(clock.pending()).toBe(0);
  });
});

/**
 * Resume from a persisted record (#10). Android/browser lifecycle
 * interruption must not lose a hand: a session rebuilt from the record of an
 * interrupted one has to land on the exact same table, and a record that
 * cannot be trusted must never be allowed to seed a resumed game.
 */
describe("GameSession resume", () => {
  function playSomeTurns(
    session: GameSession,
    clock: ReturnType<typeof manualClock>,
    turns: number,
  ): void {
    for (let turn = 0; turn < turns; turn += 1) {
      const { legalActions } = session.snapshot();
      const discard = legalActions.find((action) => action.type === "discard");
      const pass = legalActions.find((action) => action.type === "pass");
      if (discard !== undefined) session.act(discard);
      else if (pass !== undefined) session.act(pass);
      clock.flush(6);
    }
  }

  it("reconstructs an identical table from a mid-hand record", () => {
    const { session, clock } = newSession("resume-mid-hand");
    playSomeTurns(session, clock, 10);
    const interrupted = session.gameRecord();

    const resumeClock = manualClock();
    const resumed = new GameSession({
      seed: "resume-mid-hand",
      resumeFrom: interrupted,
      schedule: resumeClock.schedule,
    });
    expect(resumed.gameRecord()).toEqual(interrupted);
    expect(resumed.snapshot().view).toEqual(session.snapshot().view);
  });

  it("keeps extending the same action log after a resume, never rewriting it", () => {
    const { session: original, clock: originalClock } = newSession("resume-continue");
    playSomeTurns(original, originalClock, 6);
    const midpoint = original.gameRecord();

    const clock = manualClock();
    const resumed = new GameSession({
      seed: "resume-continue",
      resumeFrom: midpoint,
      schedule: clock.schedule,
    });
    const discard = resumed
      .snapshot()
      .legalActions.find((action) => action.type === "discard");
    if (discard !== undefined) resumed.act(discard);
    clock.flush(6);

    const after = resumed.gameRecord();
    expect(after.actions.slice(0, midpoint.actions.length)).toEqual(midpoint.actions);
    expect(after.actions.length).toBeGreaterThan(midpoint.actions.length);
  });

  it("falls back to a fresh game rather than throwing when the record is tampered with", () => {
    const { session, clock } = newSession("resume-corrupt");
    playSomeTurns(session, clock, 8);
    const tampered: GameRecord = {
      ...session.gameRecord(),
      actions: [], // seed says otherwise; replay must now disagree with this record
    };

    const fallbackClock = manualClock();
    const build = (): GameSession =>
      new GameSession({ seed: "resume-corrupt", resumeFrom: tampered, schedule: fallbackClock.schedule });
    expect(build).not.toThrow();
    const fallback = build();
    // A fresh game starts at hand 0 with no recorded actions yet, exactly as
    // if resumeFrom had never been supplied.
    expect(fallback.gameRecord().actions).toEqual([]);
    expect(fallback.snapshot().view.handIndex).toBe(0);
  });

  it("ignores a record that is already completed rather than resuming a finished match", () => {
    const { session, clock } = newSession("resume-completed");
    let guard = 0;
    while (guard < 4000) {
      guard += 1;
      const { view, legalActions } = session.snapshot();
      if (view.phase.kind === "hand-ended" || view.phase.kind === "match-ended") break;
      const discard = legalActions.find((action) => action.type === "discard");
      const pass = legalActions.find((action) => action.type === "pass");
      if (discard !== undefined) session.act(discard);
      else if (pass !== undefined) session.act(pass);
      else if (clock.flush(1) === 0) break;
    }
    // Force-mark completed to exercise the guard even if this seed's first
    // hand only reached hand-ended rather than the full match.
    const finished: GameRecord = { ...session.gameRecord(), completed: true };

    const freshClock = manualClock();
    const fresh = new GameSession({
      seed: "resume-completed",
      resumeFrom: finished,
      schedule: freshClock.schedule,
    });
    expect(fresh.gameRecord().actions).toEqual([]);
    expect(fresh.snapshot().view.handIndex).toBe(0);
  });
});

describe("the reduced claim band", () => {
  /**
   * A session whose interface hides Chow and the kongs, as Beginner mode's
   * band does. Everything here goes through the same reducer the app passes.
   */
  function reducedSession(seed: string) {
    const clock = manualClock();
    const session = new GameSession({
      seed,
      schedule: clock.schedule,
      reduceActions: (actions) => reducePlayerActions(actions, false),
    });
    return { session, clock };
  }

  it("never offers the player a hidden claim", () => {
    const { session, clock } = reducedSession("reduced-offers");
    for (let turn = 0; turn < 120; turn += 1) {
      for (const action of session.snapshot().legalActions) {
        expect(action.type).not.toBe("claim-chow");
        expect(action.type).not.toBe("claim-kong");
        expect(action.type).not.toBe("declare-concealed-kong");
        expect(action.type).not.toBe("declare-added-kong");
      }
      const discard = session
        .snapshot()
        .legalActions.find((action) => action.type === "discard");
      if (discard !== undefined) session.act(discard);
      clock.flush(4);
    }
  });

  /**
   * The bug this whole mechanism exists to prevent.
   *
   * The engine holds a claim window open until every responder answers. If the
   * interface hides the player's only real option and nothing answers on their
   * behalf, the table stops forever. A reduced session must therefore always
   * be able to keep running on its own clock.
   */
  it("never stalls: play always advances without the player acting", () => {
    const { session, clock } = reducedSession("reduced-no-stall");
    let advanced = 0;
    for (let turn = 0; turn < 200; turn += 1) {
      const before = session.snapshot();
      const discard = before.legalActions.find((action) => action.type === "discard");
      if (discard !== undefined) {
        session.act(discard);
        advanced += 1;
        continue;
      }
      // The player has nothing to do. Something must still be scheduled, or
      // the match is deadlocked.
      if (before.view.phase.kind === "awaiting-claims") {
        expect(clock.pending()).toBeGreaterThan(0);
      }
      if (clock.flush(1) === 0) break;
      advanced += 1;
    }
    expect(advanced).toBeGreaterThan(20);
  });

  it("records the pass it makes on the player's behalf, so the match replays", () => {
    // replayGame reconstructs a resumed match from the recorded action list,
    // and persistence treats a replay failure as corruption. A pass that
    // happened but was not written down would silently destroy saved games.
    const { session, clock } = reducedSession("reduced-replay");
    for (let turn = 0; turn < 80; turn += 1) {
      const discard = session
        .snapshot()
        .legalActions.find((action) => action.type === "discard");
      if (discard !== undefined) session.act(discard);
      clock.flush(4);
    }
    const record = session.gameRecord();
    expect(record.actions.length).toBeGreaterThan(0);
    expect(() => replayGame(record)).not.toThrow();
  });
});
