import type { GameAction, TileId } from "@engine";

/**
 * The accepted #7 interaction model, kept as a pure reducer so "tap the same
 * tile again to discard" stays verifiable without a device.
 *
 * Tap once to lift a tile. Tap it again to discard it. Tap a different tile to
 * move the selection. There is no confirmation dialog: the lifted state is the
 * confirmation, and an accidental discard is a release-blocking bug rather than
 * a polish item (PRD §7).
 */

export interface HandInteraction {
  readonly selected: TileId | null;
}

export const initialInteraction: HandInteraction = { selected: null };

export type InteractionEvent =
  | { readonly type: "tap-tile"; readonly tileId: TileId }
  | { readonly type: "clear" };

export interface InteractionResult {
  readonly state: HandInteraction;
  /** Set only when the tap committed a discard. */
  readonly discard: TileId | null;
}

export function reduceInteraction(
  state: HandInteraction,
  event: InteractionEvent,
  discardableTiles: ReadonlySet<TileId>,
): InteractionResult {
  switch (event.type) {
    case "clear":
      return { state: initialInteraction, discard: null };
    case "tap-tile": {
      if (!discardableTiles.has(event.tileId)) {
        // Tapping a tile that cannot legally be discarded must not silently
        // arm a discard that will then be refused. Selection does not move.
        return { state, discard: null };
      }
      if (state.selected === event.tileId) {
        return { state: initialInteraction, discard: event.tileId };
      }
      return { state: { selected: event.tileId }, discard: null };
    }
  }
}

/** Tile ids the player may legally discard right now. */
export function discardableTiles(actions: readonly GameAction[]): ReadonlySet<TileId> {
  const ids = new Set<TileId>();
  for (const action of actions) {
    if (action.type === "discard") ids.add(action.tileId);
  }
  return ids;
}

/**
 * Claim actions, ordered for display. Win leads and Pass trails, with the meld
 * claims between them, so the destructive choice is never adjacent to the
 * irreversible one (PRD §7).
 */
const CLAIM_ORDER: Record<string, number> = {
  win: 0,
  "claim-kong": 1,
  "declare-concealed-kong": 1,
  "declare-added-kong": 1,
  "claim-pung": 2,
  "claim-chow": 3,
  pass: 9,
};

export type ClaimAction = Extract<
  GameAction,
  {
    type:
      | "claim-chow"
      | "claim-pung"
      | "claim-kong"
      | "win"
      | "pass"
      | "declare-concealed-kong"
      | "declare-added-kong";
  }
>;

export function claimActions(actions: readonly GameAction[]): readonly ClaimAction[] {
  const claims = actions.filter((action): action is ClaimAction =>
    action.type !== "discard" && action.type !== "continue",
  );
  return [...claims].sort(
    (left, right) => (CLAIM_ORDER[left.type] ?? 5) - (CLAIM_ORDER[right.type] ?? 5),
  );
}

/**
 * The claim types Beginner's reduced band hides.
 *
 * Win is the point of the game and Pass is the only way out of a claim
 * window, so neither is ever hidden. Chow and the three kong declarations are:
 * they are the shapes that most reliably stall a first-time player, who has to
 * weigh them before understanding what either one costs.
 */
const HIDDEN_CLAIMS: ReadonlySet<GameAction["type"]> = new Set([
  "claim-chow",
  "claim-kong",
  "declare-concealed-kong",
  "declare-added-kong",
]);

export interface ReducedActions {
  readonly shown: readonly GameAction[];
  /**
   * Set only when the reduction left the player with nothing to do but pass,
   * so the session can answer the claim window on their behalf.
   *
   * This is load-bearing rather than a convenience. The engine holds a claim
   * window open until every responder answers, so hiding a player's only real
   * option without answering for them would stall the table for good.
   */
  readonly autoPass: GameAction | null;
}

/**
 * Reduces the actions the interface offers the player, without ever adding
 * one.
 *
 * This is a presentation filter over actions the engine has already declared
 * legal. It never re-derives legality, and the engine remains the only
 * authority on what is permitted — a reduced action is still a legal move the
 * player is simply not being shown.
 *
 * The kong case needs no special handling. A concealed or added kong is
 * declared during `awaiting-discard`, where the engine emits no `pass` at all
 * and the player's discards survive the filter, so `shown` can never reduce to
 * a lone pass there. Hiding the kong just leaves them discarding as normal.
 */
export function reducePlayerActions(
  actions: readonly GameAction[],
  showAll: boolean,
): ReducedActions {
  if (showAll) return { shown: actions, autoPass: null };

  const shown = actions.filter((action) => !HIDDEN_CLAIMS.has(action.type));
  if (shown.length === actions.length) return { shown, autoPass: null };

  const pass = shown.find((action) => action.type === "pass");
  if (pass !== undefined && shown.every((action) => action.type === "pass")) {
    // Nothing the player was offered survived the reduction, so the band shows
    // nothing at all rather than flashing up a lone Pass for a decision they
    // were never actually given.
    return { shown: [], autoPass: pass };
  }
  return { shown, autoPass: null };
}
