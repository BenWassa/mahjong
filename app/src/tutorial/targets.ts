import type { OrdinaryTileKind, PublicGameState, TileId } from "@engine";

import type { ClaimAction } from "../game/interaction";

/**
 * The vocabulary of things onboarding can point at (#33).
 *
 * A teaching target is a CSS selector for a real production element, not a
 * teaching mock-up of one. That is the same rule the #30 lessons already
 * follow with components — what the learner is taught to look at has to be the
 * thing they will still be looking at five minutes later — extended to the
 * attention layer: the spotlight measures the live element, so it stays
 * correct across every layout tier, orientation and safe area without a single
 * hardcoded coordinate.
 *
 * The attributes are stamped by the production components themselves. Nothing
 * here injects markup, and a target that does not currently exist — a claim
 * button before the claim is offered, the offered tile before it is thrown —
 * simply measures to nothing, which the attention layer treats as "not yet".
 */

/** Stable regions of the table. */
export type TeachKey =
  | "hand"
  | "hand-melds"
  | "discard-well"
  | "offer"
  | "claims"
  | "seat-left"
  | "seat-across"
  | "seat-right"
  | "menu";

export function teachSelector(key: TeachKey): string {
  return `[data-teach="${key}"]`;
}

/**
 * One tile in the player's own hand.
 *
 * Quoted by hand rather than run through `CSS.escape`, which does not exist
 * outside a browser — these selectors are built in plain unit tests as well as
 * in the app. Inside a double-quoted attribute selector only the quote and the
 * backslash need escaping, and that is the whole of what a tile id could
 * contain that would break one.
 */
export function tileSelector(tileId: TileId): string {
  const quoted = tileId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `[data-teach-tile="${quoted}"]`;
}

/** One button in the claim band. */
export function claimSelector(type: ClaimAction["type"]): string {
  return `[data-teach-claim="${type}"]`;
}

/**
 * Every tile of the given kinds in the player's hand, as selectors.
 *
 * Steps name shapes by kind rather than by id because a scenario's ids are an
 * implementation detail of the deal, and a step that named them would break
 * the moment the wall was rearranged. `limit` caps how many tiles of one kind
 * are lit: a step about a pair should light two, even if the hand holds three.
 */
export function handTiles(
  view: PublicGameState,
  kinds: readonly OrdinaryTileKind[],
  limit?: number,
): readonly string[] {
  const hand = view.players[view.viewer].concealed ?? [];
  const wanted = new Set<string>(kinds);
  const matched = hand.filter((tile) => wanted.has(tile.kind));
  const capped = limit === undefined ? matched : matched.slice(0, limit);
  return capped.map((tile) => tileSelector(tile.id));
}

/**
 * What a step is pointing at, and what the sentence beside it says.
 *
 * `targets` is a function of the view so a step can name a shape rather than a
 * position — "the two tiles that match the offered discard" is stable, "the
 * fourth and ninth slots" is not.
 *
 * `protect` names the live decision inputs the callout must not cover on top
 * of the target itself. It is deliberately per-step: the claim band is a
 * decision input while a claim is offered and empty space the rest of the
 * time, and treating it as permanently sacred would push every callout down a
 * rung for no gain (`ONBOARDING_DESIGN.md` §5.5, §5.6).
 */
export interface StepFocus {
  readonly targets: (view: PublicGameState) => readonly string[];
  /** The anchored sentence. Short: it has to fit beside a tile. */
  readonly callout: string;
  readonly protect?: readonly TeachKey[];
}
