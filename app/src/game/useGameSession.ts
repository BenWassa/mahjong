import { useCallback, useEffect, useRef, useState } from "react";

import type { GameAction, RulesProfile } from "@engine";

import type { ReducedActions } from "./interaction";
import { appendCompletedGame, clearCurrentGame, loadCurrentGame, saveCurrentGame } from "./persistence";
import { GameSession, type SessionSnapshot } from "./session";

export type ActionReducer = (actions: readonly GameAction[]) => ReducedActions;

export interface SessionHandle {
  readonly snapshot: SessionSnapshot;
  readonly act: (action: GameAction) => void;
  readonly advance: () => void;
  readonly restart: (seed: string) => void;
  readonly scoreBreakdown: ReturnType<GameSession["scoreBreakdown"]>;
}

/**
 * Persists the session's current record after every change (#10). A record
 * that has reached `completed` moves into history and the in-progress slot
 * is cleared, so a stale finished match can never be resumed; anything still
 * in progress simply overwrites the single in-progress slot — this app plays
 * one table at a time.
 */
function persist(session: GameSession): void {
  const record = session.gameRecord();
  if (record.completed) {
    appendCompletedGame(record);
    clearCurrentGame();
  } else {
    saveCurrentGame(record);
  }
}

function createSession(
  seed: string,
  rules: RulesProfile,
  reduceActions: ActionReducer,
): GameSession {
  const resumeFrom = loadCurrentGame();
  return new GameSession(
    resumeFrom === null
      ? { seed, rules, reduceActions }
      : { seed, rules, reduceActions, resumeFrom },
  );
}

/**
 * Binds one GameSession to the component tree. The session owns the turn loop;
 * React only subscribes to it, so a re-render can never advance the game.
 */
export function useGameSession(
  initialSeed: string,
  rules: RulesProfile,
  reduceActions: ActionReducer,
): SessionHandle {
  const [seed, setSeed] = useState(initialSeed);

  // Read only when a new session is constructed, never to rebuild the live
  // one. Changing the rules profile mid-match must not reroll the hand the
  // player is in the middle of: a switch applies to the next match, and the
  // menu says so. Do not "fix" this into an effect keyed on `rules`.
  const rulesRef = useRef(rules);
  const reduceRef = useRef(reduceActions);
  useEffect(() => {
    rulesRef.current = rules;
  }, [rules]);
  // The reducer, unlike the profile, does take effect immediately: hiding a
  // claim button is presentation, and the session re-reads this on every
  // snapshot. The indirection keeps a new closure each render from being
  // mistaken for a reason to rebuild the session.
  useEffect(() => {
    reduceRef.current = reduceActions;
  }, [reduceActions]);
  const stableReduce = useCallback<ActionReducer>(
    (actions) => reduceRef.current(actions),
    [],
  );

  const sessionRef = useRef<GameSession | null>(null);
  if (sessionRef.current === null) {
    sessionRef.current = createSession(seed, rulesRef.current, stableReduce);
  }
  const session = sessionRef.current;
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => session.snapshot());

  useEffect(() => {
    const current = sessionRef.current;
    if (current === null) return undefined;
    setSnapshot(current.snapshot());
    // Durable as of mount/resume, not only after the next action — a reload
    // with zero further input must still find exactly where it left off.
    persist(current);
    return current.subscribe((next) => {
      setSnapshot(next);
      persist(current);
    });
  }, [seed]);

  useEffect(() => () => { sessionRef.current?.dispose(); }, []);

  const act = useCallback((action: GameAction) => {
    sessionRef.current?.act(action);
  }, []);

  const advance = useCallback(() => {
    sessionRef.current?.continue();
  }, []);

  const restart = useCallback(
    (nextSeed: string) => {
      sessionRef.current?.dispose();
      // A restart is the one moment a mode switch takes effect on the rules:
      // this is a new match, so it deals under whatever profile is current.
      sessionRef.current = new GameSession({
        seed: nextSeed,
        rules: rulesRef.current,
        reduceActions: stableReduce,
      });
      persist(sessionRef.current);
      setSeed(nextSeed);
    },
    [stableReduce],
  );

  return {
    snapshot,
    act,
    advance,
    restart,
    scoreBreakdown: session.scoreBreakdown(),
  };
}
