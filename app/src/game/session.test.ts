import { describe, expect, it } from "vitest";

import type { GameAction, Seat } from "@engine";

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
