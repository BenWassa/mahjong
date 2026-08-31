/**
 * Core engine types. No DOM, no React, no storage, no timers, no network.
 */

import type { RulesProfile } from './config.js';
import type { Meld } from './melds.js';
import type { Seat, TileId, TileKind, Wind } from './tiles.js';

export interface SeatState {
  /** Ascending by kind then id. Tiles inside melds are not here. */
  concealed: TileId[];
  melds: Meld[];
  /** Revealed flowers and seasons, in reveal order. */
  bonus: TileId[];
  score: number;
}

/** One tile in the central discard area, in the order it was discarded. */
export interface DiscardEntry {
  tile: TileId;
  seat: Seat;
}

/** What a seat declared during a claim window. */
export type ClaimDeclaration =
  | { t: 'pass' }
  | { t: 'chow'; low: TileKind }
  | { t: 'pung' }
  | { t: 'kong' }
  | { t: 'win' };

export type Phase =
  /** `seat` holds a live tile and must discard, kong, or win. */
  | { t: 'action'; seat: Seat }
  /** A discard is on the table; `eligible` seats must each declare. */
  | { t: 'claims'; tile: TileId; from: Seat; eligible: Seat[]; declared: Record<number, ClaimDeclaration> }
  /** An added kong is exposed; `eligible` seats may only rob it. §4.6 */
  | { t: 'rob'; tile: TileId; from: Seat; eligible: Seat[]; declared: Record<number, ClaimDeclaration> }
  | { t: 'hand-over' }
  | { t: 'match-over' };

export type WinKind = 'self-draw' | 'discard' | 'robbed-kong' | 'flower-instant';

/** Facts about *how* a hand was won. Everything §5.C needs. */
export interface WinContext {
  seat: Seat;
  kind: WinKind;
  /** Discarder, or the robbed kong declarer. Null on a self-draw. */
  from: Seat | null;
  /** The winning tile. Null for a bonus-tile instant win. */
  tile: TileId | null;
  seatWind: Wind;
  roundWind: Wind;
  isDealer: boolean;
  /** 槓上開花 — the winning tile was a kong replacement. §5.C5 */
  onKongReplacement: boolean;
  /** 海底撈月 — self-draw of the final wall tile. §5.C3 */
  onLastWallTile: boolean;
  /** 河底撈魚 — win on the discard made with an empty wall. §5.C4 */
  onLastDiscard: boolean;
  /** 天糊 §5.E4 */
  heavenly: boolean;
  /** 地糊 §5.E5 */
  earthly: boolean;
  /** Set for 花糊 / 八仙過海. §6.3 */
  bonusInstant: 'seven-flowers' | 'eight-immortals' | null;
}

/** One line of the end-of-hand explanation. */
export interface FaanLine {
  /** Stable identifier from docs/HKOS_RULES.md, e.g. `A2`, `C1`, `E1`. */
  id: string;
  name: string;
  chinese: string;
  faan: number;
  /** True when the line is excluded from the minimum-faan test. §7.1 */
  bonusTile: boolean;
}

export interface FaanBreakdown {
  lines: FaanLine[];
  /** Sum of all lines, capped at the ceiling. §7.2 */
  totalFaan: number;
  /** Sum excluding bonus-tile lines. Used only for the minimum test. §7.1 */
  qualifyingFaan: number;
  /** True when a limit hand replaced the whole breakdown. §5.E */
  limitHand: boolean;
  /** 2^totalFaan. §7.3 */
  basePoints: number;
}

export type HandOutcome = 'win' | 'exhaustive-draw';

export interface HandResult {
  handNumber: number;
  roundWind: Wind;
  dealer: Seat;
  outcome: HandOutcome;
  win: WinContext | null;
  breakdown: FaanBreakdown | null;
  /** Per-seat point delta for this hand. Always sums to 0. */
  payments: [number, number, number, number];
  scoresAfter: [number, number, number, number];
  /** True when the dealer keeps the deal. §8.1 */
  dealerContinues: boolean;
}

export type Action =
  | { type: 'discard'; seat: Seat; tile: TileId }
  | { type: 'concealed-kong'; seat: Seat; kind: TileKind }
  | { type: 'added-kong'; seat: Seat; kind: TileKind }
  | { type: 'win'; seat: Seat }
  | { type: 'chow'; seat: Seat; low: TileKind }
  | { type: 'pung'; seat: Seat }
  | { type: 'kong'; seat: Seat }
  | { type: 'pass'; seat: Seat }
  /** Deal the next hand of the match. Legal only in `hand-over`. */
  | { type: 'next-hand' };

export type GameEvent =
  | { t: 'hand-start'; dealer: Seat; roundWind: Wind; handNumber: number }
  | { t: 'draw'; seat: Seat; tile: TileId; replacement: boolean }
  | { t: 'bonus'; seat: Seat; tile: TileId }
  | { t: 'discard'; seat: Seat; tile: TileId }
  | { t: 'meld'; seat: Seat; meld: Meld }
  | { t: 'kong'; seat: Seat; meld: Meld; robbable: boolean }
  | { t: 'kong-robbed'; seat: Seat; by: Seat }
  | { t: 'pass'; seat: Seat }
  | { t: 'claim-lapsed'; seat: Seat }
  | { t: 'win'; result: HandResult }
  | { t: 'exhaustive-draw'; result: HandResult }
  | { t: 'match-over' };

/**
 * Where the current live tile came from. Reset on every draw or claim, and read
 * when a win is declared.
 */
export interface LiveTileContext {
  /** The tile just drawn or claimed, or null after a claim that melds. */
  tile: TileId | null;
  fromKongReplacement: boolean;
  wasLastWallTile: boolean;
  /** True while the hand has seen no discard, kong or claim at all. §5.E4 */
  firstUninterruptedTurn: boolean;
}

export interface GameState {
  readonly config: RulesProfile;
  readonly seed: string;
  /** The shuffled wall for the current hand. Never exposed publicly. */
  wall: TileId[];
  /** Index of the next normal draw. §3.2 */
  head: number;
  /** One past the index of the next replacement draw. §3.2 */
  tail: number;
  seats: [SeatState, SeatState, SeatState, SeatState];
  dealer: Seat;
  roundWind: Wind;
  /** The seat whose dealership started the current round. §8.3 */
  roundStartDealer: Seat;
  /** How many dealerships have completed in this round, 0–4. §8.3 */
  dealsThisRound: number;
  handNumber: number;
  phase: Phase;
  live: LiveTileContext;
  /**
   * The central discard area, in order. A claimed tile leaves the pile and
   * joins the claimant's meld, exactly as it does on a real table.
   */
  discardPile: DiscardEntry[];
  /** Discards made in the current hand, including claimed ones. Drives 地糊. */
  discardCount: number;
  /** Result of the hand that just ended, else null. */
  handResult: HandResult | null;
  /** Every completed hand of the match. */
  results: HandResult[];
  /** Events produced by the most recent `act` call. */
  lastEvents: GameEvent[];
}

export function tilesLeft(state: GameState): number {
  return state.tail - state.head;
}
