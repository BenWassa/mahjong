import type { GameRecord, HandResult } from "@engine";

import { PLAYER_SEAT } from "./session";

/**
 * Basic stats (#10), a pure read over completed game records. Nothing here
 * touches storage or the live session: it cannot affect gameplay because it
 * never sees anything but records already marked `completed`.
 */

export interface ScoringPatternCount {
  readonly id: string;
  readonly name: string;
  readonly count: number;
}

export interface Stats {
  readonly handsPlayed: number;
  readonly handsWon: number;
  readonly winRate: number;
  readonly averageFaan: number;
  readonly mostFrequentPatterns: readonly ScoringPatternCount[];
  readonly dealInCount: number;
}

const EMPTY_STATS: Stats = Object.freeze({
  handsPlayed: 0,
  handsWon: 0,
  winRate: 0,
  averageFaan: 0,
  mostFrequentPatterns: [],
  dealInCount: 0,
});

function completedHands(records: readonly GameRecord[]): readonly HandResult[] {
  return records.filter((record) => record.completed).flatMap((record) => record.hands);
}

/** Computed over hands the player themself won. */
function playerWins(hands: readonly HandResult[]): readonly (HandResult & { readonly outcome: "win" })[] {
  return hands.filter(
    (hand): hand is HandResult & { readonly outcome: "win" } =>
      hand.outcome === "win" && hand.winner === PLAYER_SEAT,
  );
}

/**
 * A deal-in is a hand the player lost by supplying the winning tile —
 * `fromSeat` covers both a claimed discard and a robbed kong, both of which
 * are "you fed the winning tile" from the player's point of view.
 */
function isDealIn(hand: HandResult): boolean {
  return hand.outcome === "win" && hand.winner !== PLAYER_SEAT && hand.fromSeat === PLAYER_SEAT;
}

/** Derives per-record stats purely from records already marked completed. */
export function computeStats(records: readonly GameRecord[]): Stats {
  const hands = completedHands(records);
  if (hands.length === 0) return EMPTY_STATS;

  const wins = playerWins(hands);
  const handsWon = wins.length;
  const winRate = handsWon / hands.length;

  const scoredWins = wins.filter((hand) => hand.scoring !== null);
  const averageFaan =
    scoredWins.length === 0
      ? 0
      : scoredWins.reduce((sum, hand) => sum + (hand.scoring?.totalFaan ?? 0), 0) / scoredWins.length;

  const patternCounts = new Map<string, ScoringPatternCount>();
  for (const hand of scoredWins) {
    for (const item of hand.scoring?.items ?? []) {
      const existing = patternCounts.get(item.id);
      patternCounts.set(item.id, {
        id: item.id,
        name: item.name,
        count: (existing?.count ?? 0) + 1,
      });
    }
  }
  const mostFrequentPatterns = [...patternCounts.values()].sort((a, b) => b.count - a.count);

  const dealInCount = hands.filter(isDealIn).length;

  return {
    handsPlayed: hands.length,
    handsWon,
    winRate,
    averageFaan,
    mostFrequentPatterns,
    dealInCount,
  };
}
