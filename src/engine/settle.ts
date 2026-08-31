/**
 * Payment settlement. docs/HKOS_RULES.md §7.5–7.7.
 *
 * Mechanical given the base points: who pays what depends only on how the hand
 * was won. Values come from the scorer.
 */

import type { Seat } from './tiles.js';
import type { FaanBreakdown, WinContext } from './types.js';

export type Payments = [number, number, number, number];

/**
 * Per-seat point deltas. Always sums to zero: nothing enters or leaves the
 * table. RULE-PAY-1..4
 */
export function settle(win: WinContext, breakdown: FaanBreakdown): Payments {
  const b = breakdown.basePoints;
  const payments: Payments = [0, 0, 0, 0];

  // A robbed kong settles exactly like a discard, with the kong declarer as the
  // discarder. RULE-PAY-3
  const paysDouble = win.kind === 'discard' || win.kind === 'robbed-kong' ? win.from : null;

  if (paysDouble === null) {
    // Self-draw and bonus-tile instant wins: 2B from each of the three. §7.5
    for (let s = 0; s < 4; s++) {
      if (s === win.seat) continue;
      payments[s] = -2 * b;
    }
  } else {
    for (let s = 0; s < 4; s++) {
      if (s === win.seat) continue;
      payments[s] = s === paysDouble ? -2 * b : -b;
    }
  }

  payments[win.seat] = -(payments[0] + payments[1] + payments[2] + payments[3]);
  return payments;
}

/** An exhaustive draw moves no points. RULE-DRAW-1 */
export function noPayments(): Payments {
  return [0, 0, 0, 0];
}

export function applyPayments(
  scores: readonly number[],
  payments: Payments,
): [number, number, number, number] {
  return [
    scores[0]! + payments[0],
    scores[1]! + payments[1],
    scores[2]! + payments[2],
    scores[3]! + payments[3],
  ];
}

export function seatOf(index: number): Seat {
  return index as Seat;
}
