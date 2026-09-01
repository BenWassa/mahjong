import { ORDINARY_TILE_KINDS } from "./tiles.js";
import { evaluateWinningHand, meetsMinimumFaan } from "./scoring.js";
import { canStructurallyWin } from "./winning.js";
import type { InternalGameState, OrdinaryTileKind, Seat, Tile, TileId } from "./types.js";

/**
 * Read-only hints for the UI's optional Assist/Explain layer (#9). Every
 * check here reuses the same structural and scoring evaluators the engine
 * itself uses to decide legality; nothing below is a second implementation of
 * a rule. Both functions read only the requesting seat's own hand, which is
 * never hidden information from that seat.
 */

const NO_CIRCUMSTANCES = {
  lastWallTile: false,
  lastDiscard: false,
  openingDealerHand: false,
  dealerFirstDiscard: false,
} as const;

/**
 * Tile kinds that would complete the seat's hand, given its current concealed
 * tiles and melds. Only meaningful when that hand is at a resting count (not
 * mid-turn holding an extra drawn tile, where "waiting on" is not yet
 * defined), so the result is empty outside that moment. Scored from a
 * self-draw context: a representative approximation used only to decide which
 * kinds are worth showing as a hint, not a substitute for the real legality
 * check the engine performs when a tile actually arrives.
 */
export function waitingTiles(
  state: InternalGameState,
  seat: Seat,
): readonly OrdinaryTileKind[] {
  const player = state.players[seat];
  const restingCount = 13 - player.melds.length * 3;
  if (player.concealed.length !== restingCount) {
    return [];
  }

  const waiting: OrdinaryTileKind[] = [];
  for (const kind of ORDINARY_TILE_KINDS) {
    const candidate: Tile = { id: `${kind}-0` as TileId, kind };
    const evaluation = evaluateWinningHand(
      {
        profile: state.config,
        player,
        winner: seat,
        dealer: state.dealer,
        roundWind: state.roundWind,
        source: "self-draw",
        fromSeat: null,
        winningTile: candidate,
        circumstances: NO_CIRCUMSTANCES,
      },
      candidate,
    );
    if (evaluation !== null && meetsMinimumFaan(evaluation.scoring, state.config)) {
      waiting.push(kind);
    }
  }
  return waiting;
}

/**
 * Whether the seat's tiles, exactly as held right now, already form a legal
 * winning shape structurally — independent of the minimum-faan floor. Used to
 * distinguish "not a winning shape yet" from "complete, but below the table's
 * minimum faan", which the UI can only tell apart by asking this question
 * directly rather than re-deriving it.
 */
export function isStructurallyComplete(state: InternalGameState, seat: Seat): boolean {
  const player = state.players[seat];
  return canStructurallyWin(player.concealed, player.melds);
}
