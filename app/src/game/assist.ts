import {
  createHeuristicBot,
  handShanten,
  type GameAction,
  type OrdinaryTileKind,
  type Tile,
  type TileId,
} from "@engine";

import type { SessionSnapshot } from "./session";
import { tileName } from "./labels";

/**
 * Assist (#9): a discard suggestion with a short reason, and a plain-language
 * reading of the waiting-tiles hint. Assist is never required to make a legal
 * move — this only decorates options the player could already see and take.
 *
 * The suggestion itself is never a second implementation of the bots'
 * strategy: it is the same heuristic bot every opponent uses, asked to choose
 * from the player's own already-visible hand and the same public state a bot
 * would see for that seat. Only the one-line reason is composed here, from
 * hand-shape facts (shanten distance, adjacency) rather than from the bot's
 * internal scoring weights.
 */

export interface DiscardSuggestion {
  readonly tileId: TileId;
  readonly tileName: string;
  readonly reason: string;
}

export function suggestDiscard(
  snapshot: SessionSnapshot,
  matchSeed: string,
): DiscardSuggestion | null {
  const { view, legalActions } = snapshot;
  const hand = view.players[view.viewer].concealed;
  const discards = legalActions.filter(
    (action): action is Extract<GameAction, { type: "discard" }> => action.type === "discard",
  );
  if (hand === null || discards.length === 0) return null;

  const bot = createHeuristicBot({
    seat: view.viewer,
    seed: `${matchSeed}:assist:${String(view.handIndex)}`,
  });
  const choice = bot.chooseAction(view, legalActions);
  if (choice.type !== "discard") return null;

  const tile = hand.find((candidate) => candidate.id === choice.tileId);
  if (tile === undefined) return null;

  const meldCount = view.players[view.viewer].melds.length;
  return {
    tileId: choice.tileId,
    tileName: tileName(tile.kind),
    reason: discardReason(tile, hand, meldCount),
  };
}

function discardReason(tile: Tile, hand: readonly Tile[], meldCount: number): string {
  const rest = hand.filter((candidate) => candidate.id !== tile.id);
  const before = handShanten(hand, meldCount);
  const after = handShanten(rest, meldCount);
  if (after < before) {
    return "brings your hand a step closer to complete";
  }
  if (!hand.some((other) => other.id !== tile.id && isNeighbour(tile.kind, other.kind))) {
    return "isolated — nothing else in your hand builds with it";
  }
  return "least useful tile to hold onto right now";
}

function isNeighbour(a: OrdinaryTileKind | Tile["kind"], b: Tile["kind"]): boolean {
  if (a === b) return true;
  const left = suited(a);
  const right = suited(b);
  if (left === null || right === null || left.suit !== right.suit) return false;
  return Math.abs(left.rank - right.rank) <= 2;
}

function suited(kind: Tile["kind"]): { suit: string; rank: number } | null {
  const match = /^(characters|bamboo|dots)-([1-9])$/.exec(kind);
  if (match === null || match[1] === undefined || match[2] === undefined) return null;
  return { suit: match[1], rank: Number(match[2]) };
}

/** Short, capped, spoken-name reading of a waiting-tiles hint. */
export function describeWaitingTiles(kinds: readonly OrdinaryTileKind[]): string {
  const MAX_SHOWN = 5;
  const shown = kinds.slice(0, MAX_SHOWN).map((kind) => tileName(kind));
  const extra = kinds.length - shown.length;
  return extra > 0 ? `${shown.join(", ")}, +${String(extra)} more` : shown.join(", ");
}

/**
 * Explain-layer detection (#9): the seat's hand is already a legal winning
 * shape, but the game is not offering Win because it is below the table's
 * minimum faan. Restricted to the player's own discard decision so it never
 * fires for a claim window or for an opponent's turn.
 */
export function isBelowMinimumFaanWin(snapshot: SessionSnapshot): boolean {
  const { view, legalActions, structurallyComplete } = snapshot;
  if (!structurallyComplete) return false;
  if (view.phase.kind !== "awaiting-discard") return false;
  if (view.phase.seat !== view.viewer) return false;
  if (view.phase.source === "claim") return false;
  return !legalActions.some((action) => action.type === "win");
}
