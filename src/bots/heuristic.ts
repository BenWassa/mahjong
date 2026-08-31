import { createSeededRandom, type DeterministicRandom } from "../engine/random.js";
import type { GameAction, PublicGameState, Seat, Tile, TileKind } from "../engine/types.js";
import { handShanten } from "./shanten.js";

export interface BotController {
  chooseAction(state: PublicGameState, legalActions: readonly GameAction[]): GameAction;
}

export interface HeuristicBotOptions { readonly seat: Seat; readonly seed: string }

export function createHeuristicBot(options: HeuristicBotOptions): BotController {
  const random = createSeededRandom(options.seed);
  return {
    chooseAction(state, legalActions) {
      if (state.viewer !== options.seat) throw new Error("Bot received another seat's public view");
      const own = state.players[options.seat];
      if (own.concealed === null) throw new Error("Bot public view omitted its own concealed tiles");
      const hand = own.concealed;
      const actions = legalActions.filter((action) => action.type === "continue" || action.seat === options.seat);
      if (actions.length === 0) throw new Error("Bot received no legal action");

      const win = actions.find((action) => action.type === "win");
      if (win !== undefined) return win;
      const discards = actions.filter(isDiscard);
      if (discards.length > 0) return chooseDiscard(discards, hand, state, own.melds.length, random);

      const kong = actions.filter((action) => action.type === "declare-concealed-kong" || action.type === "declare-added-kong");
      if (kong.length > 0 && state.wallCount > 8) return chooseTied(kong, random);

      const claims = actions.filter(isClaim);
      if (claims.length > 0) {
        const beneficial = claims.filter((action) => claimIsBeneficial(action, hand, own.melds.length, state));
        if (beneficial.length > 0) {
          const bestRank = Math.max(...beneficial.map(claimRank));
          return chooseTied(beneficial.filter((action) => claimRank(action) === bestRank), random);
        }
      }
      return actions.find((action) => action.type === "pass") ?? chooseTied(actions, random);
    },
  };
}

function isDiscard(action: GameAction): action is Extract<GameAction, { type: "discard" }> { return action.type === "discard"; }
function isClaim(action: GameAction): action is Extract<GameAction, { type: "claim-chow" | "claim-pung" | "claim-kong" }> {
  return action.type === "claim-chow" || action.type === "claim-pung" || action.type === "claim-kong";
}

function chooseDiscard(actions: readonly Extract<GameAction, { type: "discard" }>[], hand: readonly Tile[], state: PublicGameState, melds: number, random: DeterministicRandom): GameAction {
  const byId = new Map(hand.map((tile) => [tile.id, tile]));
  const scored = actions.map((action) => {
    const tile = byId.get(action.tileId);
    if (tile === undefined) throw new Error(`Legal discard ${action.tileId} absent from public hand`);
    const remaining = hand.filter((candidate) => candidate.id !== tile.id);
    return { action, score: discardScore(tile, remaining, state, melds) };
  });
  const best = Math.max(...scored.map(({ score }) => score));
  return chooseTied(scored.filter(({ score }) => score === best).map(({ action }) => action), random);
}

function discardScore(tile: Tile, remaining: readonly Tile[], state: PublicGameState, melds: number): number {
  let score = -handShanten(remaining, melds) * 100;
  score += faanPotential(remaining, state.viewer, state) * 4;
  score -= usefulness(tile, remaining) * 3;
  if (state.wallCount <= 28) score += dangerSafety(tile.kind, state) * 20;
  return score;
}

function usefulness(tile: Tile, hand: readonly Tile[]): number {
  let value = 0;
  for (const other of hand) {
    if (other.kind === tile.kind) value += 4;
    const a = suited(tile.kind); const b = suited(other.kind);
    if (a !== null && b !== null && a.suit === b.suit) {
      const gap = Math.abs(a.rank - b.rank);
      if (gap === 1) value += 3;
      if (gap === 2) value += 1;
    }
  }
  return value;
}

function faanPotential(hand: readonly Tile[], seat: Seat, state: PublicGameState): number {
  const suitCounts = new Map<string, number>();
  let honours = 0; let tripletWeight = 0;
  const kinds = new Map<TileKind, number>();
  for (const tile of hand) {
    const parsed = suited(tile.kind);
    if (parsed === null) honours += 1;
    else suitCounts.set(parsed.suit, (suitCounts.get(parsed.suit) ?? 0) + 1);
    kinds.set(tile.kind, (kinds.get(tile.kind) ?? 0) + 1);
  }
  for (const [kind, count] of kinds) {
    if (count >= 2 && (kind.startsWith("dragon-") || kind === `wind-${state.players[seat].seatWind}` || kind === `wind-${state.roundWind}`)) tripletWeight += count;
  }
  const dominant = Math.max(0, ...suitCounts.values());
  return dominant - (hand.length - dominant - honours) * 2 + honours + tripletWeight;
}

function dangerSafety(kind: TileKind, state: PublicGameState): number {
  let safety = 0;
  for (const opponent of state.players) {
    if (opponent.seat === state.viewer) continue;
    const recent = state.discards.filter((discard) => discard.seat === opponent.seat).slice(-6);
    if (recent.some((discard) => discard.tile.kind === kind)) safety += 2;
  }
  const visible = state.discards.filter((discard) => discard.tile.kind === kind).length;
  return safety + visible;
}

function claimIsBeneficial(action: Extract<GameAction, { type: "claim-chow" | "claim-pung" | "claim-kong" }>, hand: readonly Tile[], fixedMelds: number, state: PublicGameState): boolean {
  const removed = new Set(action.tileIds);
  const afterClaim = hand.filter((tile) => !removed.has(tile.id));
  const afterDiscard = action.type === "claim-kong"
    ? handShanten(afterClaim, fixedMelds + 1)
    : afterClaim.length === 0 ? 13 : Math.min(...afterClaim.map((tile) => handShanten(afterClaim.filter((candidate) => candidate.id !== tile.id), fixedMelds + 1)));
  const before = handShanten(hand, fixedMelds);
  if (afterDiscard < before) return true;
  if (action.type === "claim-chow") return false;
  const pending = state.phase.kind === "awaiting-claims" ? state.phase.pendingTile.kind : null;
  const valuableHonour = pending !== null && (pending.startsWith("dragon-") || pending === `wind-${state.players[state.viewer].seatWind}` || pending === `wind-${state.roundWind}`);
  return afterDiscard === before && valuableHonour;
}

function claimRank(action: Extract<GameAction, { type: "claim-chow" | "claim-pung" | "claim-kong" }>): number {
  return action.type === "claim-kong" ? 3 : action.type === "claim-pung" ? 2 : 1;
}

function chooseTied<T>(values: readonly T[], random: DeterministicRandom): T {
  const value = values[random.nextInt(values.length)];
  if (value === undefined) throw new Error("Cannot choose from an empty list");
  return value;
}

function suited(kind: TileKind): { suit: string; rank: number } | null {
  const match = /^(characters|bamboo|dots)-([1-9])$/.exec(kind);
  if (match === null || match[1] === undefined || match[2] === undefined) return null;
  return { suit: match[1], rank: Number(match[2]) };
}
