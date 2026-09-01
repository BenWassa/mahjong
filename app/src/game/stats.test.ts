import type { FaanBreakdown, GameRecord, HandResult, Seat } from "@engine";
import { describe, expect, it } from "vitest";

import { PLAYER_SEAT } from "./session";
import { computeStats } from "./stats";

/**
 * Pure stats reads (#10): built from hand-crafted records rather than a
 * played-out game, so each scenario (a player win, a loss, a deal-in, a
 * draw) is exact and the derivation can be checked arithmetically.
 */

type WinResult = Extract<HandResult, { readonly outcome: "win" }>;
type DrawResult = Extract<HandResult, { readonly outcome: "draw" }>;

const OPPONENT = 1;

function faan(totalFaan: number, items: FaanBreakdown["items"] = []): FaanBreakdown {
  return {
    qualifyingFaan: totalFaan,
    totalFaan,
    items,
    basePoints: totalFaan,
    payments: [0, 0, 0, 0],
    limitHand: null,
  };
}

function playerWin(handIndex: number, totalFaan: number, items: FaanBreakdown["items"] = []): WinResult {
  return {
    outcome: "win",
    handIndex,
    roundWind: "east",
    dealer: 0,
    winner: PLAYER_SEAT,
    fromSeat: null,
    source: "self-draw",
    winningTile: null,
    structure: null,
    circumstances: {
      lastWallTile: false,
      lastDiscard: false,
      openingDealerHand: false,
      dealerFirstDiscard: false,
    },
    scoring: faan(totalFaan, items),
  };
}

function opponentWin(handIndex: number, fromSeat: Seat | null = null): WinResult {
  return {
    outcome: "win",
    handIndex,
    roundWind: "east",
    dealer: 0,
    winner: OPPONENT,
    fromSeat,
    source: fromSeat === null ? "self-draw" : "discard",
    winningTile: null,
    structure: null,
    circumstances: {
      lastWallTile: false,
      lastDiscard: false,
      openingDealerHand: false,
      dealerFirstDiscard: false,
    },
    scoring: faan(3),
  };
}

function draw(handIndex: number): DrawResult {
  return {
    outcome: "draw",
    handIndex,
    roundWind: "east",
    dealer: 0,
    reason: "wall-exhausted",
    scoring: null,
  };
}

function record(hands: readonly HandResult[], completed = true): GameRecord {
  return {
    version: 1,
    seed: "stats-test",
    config: { tileSetSize: 144, minimumFaan: 1, matchLength: "east-round" },
    actions: [],
    events: [],
    hands,
    completed,
  };
}

describe("computeStats", () => {
  it("is all zeros with no completed records", () => {
    const stats = computeStats([]);
    expect(stats.handsPlayed).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.averageFaan).toBe(0);
    expect(stats.mostFrequentPatterns).toEqual([]);
    expect(stats.dealInCount).toBe(0);
  });

  it("ignores hands from a record that is not yet completed", () => {
    const inProgress = record([playerWin(0, 3)], false);
    expect(computeStats([inProgress]).handsPlayed).toBe(0);
  });

  it("counts hands played and won across multiple completed records", () => {
    const first = record([playerWin(0, 3), draw(1)]);
    const second = record([opponentWin(0)]);
    const stats = computeStats([first, second]);
    expect(stats.handsPlayed).toBe(3);
    expect(stats.handsWon).toBe(1);
    expect(stats.winRate).toBeCloseTo(1 / 3);
  });

  it("averages faan over the player's own wins only", () => {
    const games = [record([playerWin(0, 3), playerWin(1, 7), opponentWin(2)])];
    expect(computeStats(games).averageFaan).toBeCloseTo(5);
  });

  it("tallies the player's scoring patterns by frequency", () => {
    const allPungs = { id: "all-pungs", name: "All Pungs", chineseName: "筒筒", faan: 3 };
    const seatWind = { id: "seat-wind", name: "Seat Wind", chineseName: "圓風", faan: 1 };
    const games = [
      record([
        playerWin(0, 4, [allPungs, seatWind]),
        playerWin(1, 3, [allPungs]),
      ]),
    ];
    const [top, second] = computeStats(games).mostFrequentPatterns;
    expect(top).toEqual({ id: "all-pungs", name: "All Pungs", count: 2 });
    expect(second).toEqual({ id: "seat-wind", name: "Seat Wind", count: 1 });
  });

  it("counts a deal-in when the player's own discard was claimed for the win", () => {
    const games = [record([opponentWin(0, PLAYER_SEAT), opponentWin(1, null)])];
    expect(computeStats(games).dealInCount).toBe(1);
  });

  it("does not count a self-drawn opponent win as a deal-in", () => {
    const games = [record([opponentWin(0, null)])];
    expect(computeStats(games).dealInCount).toBe(0);
  });

  it("does not count a draw toward wins, faan or deal-ins", () => {
    const games = [record([draw(0)])];
    const stats = computeStats(games);
    expect(stats.handsPlayed).toBe(1);
    expect(stats.handsWon).toBe(0);
    expect(stats.averageFaan).toBe(0);
    expect(stats.dealInCount).toBe(0);
  });
});
