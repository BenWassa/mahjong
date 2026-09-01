import { useCallback, useEffect, useRef, useState } from "react";

import type { GameAction } from "@engine";

import { appendCompletedGame, clearCurrentGame, loadCurrentGame, saveCurrentGame } from "./persistence";
import { GameSession, type SessionSnapshot } from "./session";

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

function createSession(seed: string): GameSession {
  const resumeFrom = loadCurrentGame();
  return new GameSession(resumeFrom === null ? { seed } : { seed, resumeFrom });
}

/**
 * Binds one GameSession to the component tree. The session owns the turn loop;
 * React only subscribes to it, so a re-render can never advance the game.
 */
export function useGameSession(initialSeed: string): SessionHandle {
  const [seed, setSeed] = useState(initialSeed);
  const sessionRef = useRef<GameSession | null>(null);
  if (sessionRef.current === null) {
    sessionRef.current = createSession(seed);
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

  const restart = useCallback((nextSeed: string) => {
    sessionRef.current?.dispose();
    sessionRef.current = new GameSession({ seed: nextSeed });
    persist(sessionRef.current);
    setSeed(nextSeed);
  }, []);

  return {
    snapshot,
    act,
    advance,
    restart,
    scoreBreakdown: session.scoreBreakdown(),
  };
}
