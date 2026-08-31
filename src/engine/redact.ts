/**
 * The redacted view of a game. docs/HKOS_RULES.md §11.
 *
 * This is the ONLY thing the UI and the bots are given. If a fact is not in
 * this structure, nothing outside the engine can act on it.
 *
 * RULE-REDACT-1: another seat's concealed tiles never appear.
 * RULE-REDACT-2: the wall's contents and order never appear.
 * RULE-REDACT-3: another seat's concealed kong appears as a count, not tiles.
 * RULE-REDACT-4: bots consume exactly this structure.
 */

import type { RulesProfile } from './config.js';
import type { Meld } from './melds.js';
import { WINDS, seatDistance, type Seat, type TileId, type TileKind, type Wind } from './tiles.js';
import { tilesLeft, type DiscardEntry, type GameState, type HandResult, type Phase } from './types.js';

/** A meld as the rest of the table can see it. */
export type PublicMeld =
  | { kind: 'chow' | 'pung' | 'kong-exposed' | 'kong-added'; tiles: TileId[]; low: TileKind; claimedFrom: Seat | null }
  /** A concealed kong: everyone knows it exists, nobody else knows of what. */
  | { kind: 'kong-concealed'; tiles: null; low: null; claimedFrom: null };

export interface PublicSeat {
  seat: Seat;
  wind: Wind;
  /** How many tiles this seat holds concealed. Visible on a real table. */
  concealedCount: number;
  melds: PublicMeld[];
  bonus: TileId[];
  score: number;
  isDealer: boolean;
}

export type PublicPhase =
  | { t: 'action'; seat: Seat }
  | { t: 'claims'; tile: TileId; from: Seat; /** True only for the viewing seat. */ youMayClaim: boolean }
  | { t: 'rob'; tile: TileId; from: Seat; youMayClaim: boolean }
  | { t: 'hand-over' }
  | { t: 'match-over' };

export interface PublicState {
  /** The seat this view belongs to. */
  you: Seat;
  /** Your concealed tiles, ascending. */
  hand: TileId[];
  /** Your own melds in full, including your concealed kongs. */
  yourMelds: Meld[];
  seats: [PublicSeat, PublicSeat, PublicSeat, PublicSeat];
  discardPile: DiscardEntry[];
  /** Count only. The wall's contents are never exposed. RULE-REDACT-2 */
  wallRemaining: number;
  dealer: Seat;
  roundWind: Wind;
  yourWind: Wind;
  handNumber: number;
  phase: PublicPhase;
  config: RulesProfile;
  /** The result of the hand that just ended, else null. */
  handResult: HandResult | null;
  results: HandResult[];
}

function publicMeld(meld: Meld, own: boolean): PublicMeld {
  if (meld.kind === 'kong-concealed' && !own) {
    return { kind: 'kong-concealed', tiles: null, low: null, claimedFrom: null };
  }
  if (meld.kind === 'kong-concealed') {
    return { kind: 'kong-exposed', tiles: [...meld.tiles], low: meld.low, claimedFrom: null };
  }
  return { kind: meld.kind, tiles: [...meld.tiles], low: meld.low, claimedFrom: meld.claimedFrom };
}

function publicPhase(phase: Phase, you: Seat): PublicPhase {
  switch (phase.t) {
    case 'action':
      return { t: 'action', seat: phase.seat };
    case 'claims':
      return {
        t: 'claims',
        tile: phase.tile,
        from: phase.from,
        youMayClaim: phase.eligible.includes(you) && !phase.declared[you],
      };
    case 'rob':
      return {
        t: 'rob',
        tile: phase.tile,
        from: phase.from,
        youMayClaim: phase.eligible.includes(you) && !phase.declared[you],
      };
    case 'hand-over':
      return { t: 'hand-over' };
    case 'match-over':
      return { t: 'match-over' };
  }
}

/**
 * Build the view for one seat. Everything here is either that seat's own, or
 * something every player at a real table can see.
 */
export function redact(state: GameState, you: Seat): PublicState {
  const seats = [0, 1, 2, 3].map((index) => {
    const seat = index as Seat;
    const s = state.seats[seat];
    const view: PublicSeat = {
      seat,
      wind: WINDS[seatDistance(state.dealer, seat)]!,
      concealedCount: s.concealed.length,
      melds: s.melds.map((m) => publicMeld(m, seat === you)),
      bonus: [...s.bonus],
      score: s.score,
      isDealer: seat === state.dealer,
    };
    return view;
  }) as [PublicSeat, PublicSeat, PublicSeat, PublicSeat];

  return {
    you,
    hand: [...state.seats[you].concealed],
    yourMelds: state.seats[you].melds.map((m) => ({ ...m, tiles: [...m.tiles] })),
    seats,
    discardPile: state.discardPile.map((d) => ({ ...d })),
    wallRemaining: tilesLeft(state),
    dealer: state.dealer,
    roundWind: state.roundWind,
    yourWind: WINDS[seatDistance(state.dealer, you)]!,
    handNumber: state.handNumber,
    phase: publicPhase(state.phase, you),
    config: state.config,
    handResult: state.handResult,
    results: state.results,
  };
}
