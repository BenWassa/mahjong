import { useCallback, useEffect, useRef, useState } from "react";

import type { GameAction } from "@engine";

import { GameSession, type SessionSnapshot } from "./session";

export interface SessionHandle {
  readonly snapshot: SessionSnapshot;
  readonly act: (action: GameAction) => void;
  readonly advance: () => void;
  readonly restart: (seed: string) => void;
  readonly scoreBreakdown: ReturnType<GameSession["scoreBreakdown"]>;
}

/**
 * Binds one GameSession to the component tree. The session owns the turn loop;
 * React only subscribes to it, so a re-render can never advance the game.
 */
export function useGameSession(initialSeed: string): SessionHandle {
  const [seed, setSeed] = useState(initialSeed);
  const sessionRef = useRef<GameSession | null>(null);
  if (sessionRef.current === null) {
    sessionRef.current = new GameSession({ seed });
  }
  const session = sessionRef.current;
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => session.snapshot());

  useEffect(() => {
    const current = sessionRef.current;
    if (current === null) return undefined;
    setSnapshot(current.snapshot());
    return current.subscribe(setSnapshot);
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
