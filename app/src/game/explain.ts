import { useCallback, useMemo, useRef, useState } from "react";

import type { PublicGameState } from "@engine";

import { claimActions } from "./interaction";
import type { SessionSnapshot } from "./session";

/**
 * Explain (#9): a concise, first-occurrence, plain-language explanation for
 * each required gameplay concept. Every concept fires once per session and
 * never again, so routine play is never interrupted after the concept has
 * been shown. Three of the eight required concepts (self-draw vs discard
 * win, the itemised faan breakdown, and an exhaustive draw) are shown inline
 * in the result sheet, where they are already contextual; the rest surface as
 * a small non-blocking banner over the table.
 */

export type ConceptId =
  | "claim-decisions"
  | "flowers-replacement"
  | "minimum-faan"
  | "dealer-rotation"
  | "robbing-kong"
  | "win-sources"
  | "exhaustive-draw"
  | "faan-breakdown";

export const CONCEPTS: Record<ConceptId, { readonly title: string; readonly body: string }> = {
  "claim-decisions": {
    title: "Claiming a discard",
    body:
      "Chow 食 (a run, only from the player to your left), Pung 碰 (pair to " +
      "triplet) and Kong 槓 (four of a kind) let you take a discard to build " +
      "a set. Win 糊 ends the hand. Pass 過 lets play carry on. You never " +
      "have to claim.",
  },
  "flowers-replacement": {
    title: "Flowers and seasons",
    body:
      "Flower and season tiles score bonus points but never form a set. " +
      "They are revealed as soon as you draw one, and a replacement tile is " +
      "drawn from the wall in its place.",
  },
  "minimum-faan": {
    title: "Below the minimum",
    body:
      "Your hand is a complete shape, but Hong Kong Old Style requires a " +
      "minimum faan value to win with. Keep playing until it qualifies.",
  },
  "dealer-rotation": {
    title: "The deal moves on",
    body:
      "A dealer who wins their own hand keeps dealing. Otherwise the deal " +
      "passes to the next seat.",
  },
  "robbing-kong": {
    title: "Robbing a kong",
    body:
      "An opponent is promoting a pung to a kong. If that exact tile would " +
      "complete your hand, you may claim it as a win instead of letting the " +
      "kong stand.",
  },
  "win-sources": {
    title: "Self-draw or discard",
    body:
      "A self-drawn win is paid by all three opponents. A win off a " +
      "discard is paid by the discarder alone.",
  },
  "exhaustive-draw": {
    title: "Exhaustive draw",
    body: "Nobody completed a hand before the wall ran out. No faan is scored, and the deal moves on as usual.",
  },
  "faan-breakdown": {
    title: "Reading the breakdown",
    body: "Each line is a separate scoring pattern. The total is their sum — this is what \"stacking\" means.",
  },
};

function totalBonuses(view: PublicGameState): number {
  return view.players.reduce((sum, player) => sum + player.bonuses.length, 0);
}

/** Banner-worthy concepts true right now, given the previous and current snapshot. */
export function detectConcepts(
  previous: SessionSnapshot | null,
  current: SessionSnapshot,
  belowMinimumFaanWin: boolean,
): readonly ConceptId[] {
  const found: ConceptId[] = [];

  if (claimActions(current.legalActions).length > 0) {
    found.push("claim-decisions");
  }
  if (belowMinimumFaanWin) {
    found.push("minimum-faan");
  }
  if (current.view.phase.kind === "awaiting-rob") {
    found.push("robbing-kong");
  }
  if (previous !== null) {
    if (totalBonuses(current.view) > totalBonuses(previous.view)) {
      found.push("flowers-replacement");
    }
    if (current.view.handIndex > previous.view.handIndex) {
      found.push("dealer-rotation");
    }
  }
  return found;
}

export interface LearningProgress {
  readonly has: (id: ConceptId) => boolean;
  readonly markSeen: (id: ConceptId) => void;
}

/**
 * Tracks which concepts have been shown this session. Backed by a ref, not
 * state, so `has` always reads the current value even mid-render — the
 * result overlay needs to decide "have I shown this before" and mark it seen
 * within the same render pass, before React's next commit.
 */
export function useLearningProgress(): LearningProgress {
  const [, bump] = useState(0);
  const seenRef = useRef<ReadonlySet<ConceptId>>(new Set());
  const markSeen = useCallback((id: ConceptId) => {
    if (seenRef.current.has(id)) return;
    seenRef.current = new Set(seenRef.current).add(id);
    bump((count) => count + 1);
  }, []);
  const has = useCallback((id: ConceptId) => seenRef.current.has(id), []);
  return useMemo(() => ({ has, markSeen }), [has, markSeen]);
}
