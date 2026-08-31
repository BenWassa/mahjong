/**
 * Scoring seam.
 *
 * The engine (issue #3) owns *when* a hand is scored and how the result is
 * settled; the scorer (issue #4) owns *what* it is worth. The engine depends
 * only on this interface, so the two can be built and reviewed separately.
 */

import type { RulesProfile } from '../config.js';
import type { Meld } from '../melds.js';
import type { TileId } from '../tiles.js';
import type { FaanBreakdown, WinContext } from '../types.js';

export interface ScoreInput {
  win: WinContext;
  /** The winner's concealed tiles, *including* the winning tile. */
  concealed: TileId[];
  melds: Meld[];
  /** The winner's revealed flowers and seasons. */
  bonus: TileId[];
  profile: RulesProfile;
}

export type Scorer = (input: ScoreInput) => FaanBreakdown;

/**
 * Structural placeholder used while issue #4 is outstanding.
 *
 * It produces a well-formed, deterministic breakdown worth zero faan, which is
 * enough for the engine to settle a hand, progress the dealer and record a
 * result. It is not a scoring implementation and must not be shipped as one:
 * `createGame` refuses a rules profile with a non-zero minimum faan when this
 * scorer is in use, so a wired-up product cannot silently score every hand at 0.
 */
export const structuralScorer: Scorer = () => ({
  lines: [],
  totalFaan: 0,
  qualifyingFaan: 0,
  limitHand: false,
  basePoints: 1,
});

/** Marks a scorer as the placeholder, so the engine can reject it in product use. */
export const PLACEHOLDER_SCORER = structuralScorer;
