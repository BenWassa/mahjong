import { useCallback, useEffect, useRef, useState } from "react";

import { loadTutorial, saveTutorial } from "./persistence";
import { NO_COMPETENCE, type DemonstratedCompetence } from "./scaffold";

/**
 * Watches what the player actually does, so the scaffolding can fade because
 * they demonstrated something rather than because time passed (§7.3).
 *
 * It counts two things and nothing else: unprompted discards of their own, and
 * whether they have ever taken a claim. Both are read off the engine's own
 * public state rather than from a callback on the interface — a discard is a
 * discard whether it arrived by tap, by keyboard, or by Assist's suggestion
 * being followed, and a counter wired to one particular control would quietly
 * disagree with the game.
 *
 * Scripted phases are deliberately not counted: the walkthrough owns its own
 * measure of progress, and a discard the learner was told exactly which tile
 * to make is not evidence of anything §7.3 is asking about.
 */
export interface CompetenceHandle extends DemonstratedCompetence {
  /**
   * Records the position after each of the player's own moves. Safe to call on
   * every snapshot: it only writes when one of the counters actually moves.
   */
  readonly observe: (ownDiscards: number, ownMelds: number) => void;
}

export function useDemonstratedCompetence(): CompetenceHandle {
  const [stored, setStored] = useState<DemonstratedCompetence>(() => {
    const progress = loadTutorial();
    return progress.competence;
  });

  /*
   * The high-water marks within the current hand.
   *
   * Discards reset to zero when a hand ends, so a raw count would be a count
   * of *this* hand rather than of the player's experience. Tracking the
   * previous reading and adding only the increase turns a per-hand number into
   * a durable one without the caller having to know when a hand changed.
   */
  const seenRef = useRef({ discards: 0, melds: 0 });

  const observe = useCallback((ownDiscards: number, ownMelds: number) => {
    const seen = seenRef.current;
    const grewBy = Math.max(0, ownDiscards - seen.discards);
    const claimed = ownMelds > seen.melds;
    seenRef.current = { discards: ownDiscards, melds: ownMelds };
    if (grewBy === 0 && !claimed) return;
    setStored((current) => ({
      unpromptedTurns: current.unpromptedTurns + grewBy,
      hasClaimed: current.hasClaimed || claimed,
    }));
  }, []);

  useEffect(() => {
    const progress = loadTutorial();
    if (
      progress.competence.unpromptedTurns === stored.unpromptedTurns &&
      progress.competence.hasClaimed === stored.hasClaimed
    ) {
      return;
    }
    saveTutorial({ ...progress, competence: stored });
  }, [stored]);

  return { ...stored, observe };
}

export { NO_COMPETENCE };
