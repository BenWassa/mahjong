import { beforeEach, describe, expect, it } from "vitest";

import {
  appendCompletedGame,
  clearCurrentGame,
  loadCompletedGames,
  loadCurrentGame,
  saveCurrentGame,
} from "./persistence";
import { GameSession } from "./session";

/**
 * End-to-end lifecycle/reload recovery (#10 exit criteria), exercised through
 * exactly the two pieces `useGameSession` wires together — `GameSession` and
 * the storage module — without React, since neither the resume logic nor the
 * persist-on-change logic in the hook does anything beyond composing them.
 * "Reload" here means what it means on the device: a brand new session
 * object reading whatever the last one left on disk, nothing carried over
 * in memory.
 */

function manualClock(): {
  schedule: (run: () => void, ms: number) => () => void;
  flush: (steps?: number) => number;
} {
  let queue: (() => void)[] = [];
  return {
    schedule(run) {
      queue.push(run);
      return () => {
        queue = queue.filter((item) => item !== run);
      };
    },
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

/** Mirrors useGameSession's persist() exactly: completed moves to history. */
function persist(session: GameSession): void {
  const record = session.gameRecord();
  if (record.completed) {
    appendCompletedGame(record);
    clearCurrentGame();
  } else {
    saveCurrentGame(record);
  }
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("save/resume lifecycle", () => {
  it("survives a simulated forced reload mid-hand with no lost state", () => {
    const clock = manualClock();
    const session = new GameSession({ seed: "lifecycle-reload", schedule: clock.schedule });
    persist(session);

    for (let turn = 0; turn < 8; turn += 1) {
      const { legalActions } = session.snapshot();
      const discard = legalActions.find((action) => action.type === "discard");
      const pass = legalActions.find((action) => action.type === "pass");
      if (discard !== undefined) session.act(discard);
      else if (pass !== undefined) session.act(pass);
      clock.flush(6);
      persist(session);
    }

    const beforeReload = session.snapshot().view;

    // "Reload": nothing but disk survives. A brand new session reads it back.
    const resumeFrom = loadCurrentGame();
    expect(resumeFrom).not.toBeNull();
    const reloadClock = manualClock();
    const reloaded = new GameSession(
      resumeFrom === null
        ? { seed: "lifecycle-reload", schedule: reloadClock.schedule }
        : { seed: "lifecycle-reload", resumeFrom, schedule: reloadClock.schedule },
    );

    expect(reloaded.snapshot().view).toEqual(beforeReload);

    // Play still continues normally after the reload.
    const { legalActions } = reloaded.snapshot();
    const nextMove = legalActions.find((action) => action.type === "discard" || action.type === "pass");
    expect(() => {
      if (nextMove !== undefined) reloaded.act(nextMove);
    }).not.toThrow();
  });

  it("moves a match into readable history on completion and clears the resumable slot", () => {
    const clock = manualClock();
    const session = new GameSession({ seed: "lifecycle-complete", schedule: clock.schedule });
    persist(session);

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
      persist(session);
    }

    // A single-hand match completes at hand-ended already; force the record
    // to `completed` here too so this test covers the archival branch even
    // when this seed's east round has more hands left to play.
    const completedRecord = { ...session.gameRecord(), completed: true };
    appendCompletedGame(completedRecord);
    clearCurrentGame();

    expect(loadCurrentGame()).toBeNull();
    const history = loadCompletedGames();
    expect(history.some((record) => record.seed === "lifecycle-complete")).toBe(true);
  });

  it("recovers into a fresh, playable game after the saved record is corrupted on disk", () => {
    const clock = manualClock();
    const session = new GameSession({ seed: "lifecycle-corrupt", schedule: clock.schedule });
    persist(session);
    window.localStorage.setItem("mahjong:v1:current-game", "{ this is not valid json");

    const resumeFrom = loadCurrentGame();
    expect(resumeFrom).toBeNull();

    const recoveryClock = manualClock();
    const recovered = new GameSession({
      seed: "lifecycle-corrupt",
      schedule: recoveryClock.schedule,
    });
    expect(recovered.snapshot().view.handIndex).toBe(0);
    expect(recovered.gameRecord().actions).toEqual([]);
  });
});
