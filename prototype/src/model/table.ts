import type { Tile, TileKind } from "./tiles.ts";

/** Seats as laid out on screen in landscape, relative to the player. */
export type Seat = "you" | "right" | "across" | "left";

export const SEAT_LABEL: Readonly<Record<Seat, string>> = {
  you: "You",
  right: "Right",
  across: "Across",
  left: "Left",
};

export type MeldKind = "chow" | "pung" | "kong";

export interface Meld {
  readonly kind: MeldKind;
  readonly tiles: readonly Tile[];
}

/** A contextual control offered to the player, per PRD §7 "Claims". */
export type ClaimKind = "chow" | "pung" | "kong" | "win";

export interface ClaimOption {
  readonly id: string;
  readonly kind: ClaimKind;
  /** Glyph used on the control, per PRD §7. */
  readonly glyph: string;
  /** Short English gloss under the glyph. */
  readonly gloss: string;
  /** Ids of the tiles in hand this claim would consume. */
  readonly usesTileIds: readonly string[];
  /** Disambiguating caption when one claim kind has several shapes. */
  readonly detail: string | null;
}

export interface OpponentView {
  readonly seat: Seat;
  readonly wind: string;
  readonly concealedCount: number;
  readonly melds: readonly Meld[];
}

/**
 * What the player has to act on. `discard` means it is your turn to throw a
 * tile; `claim` means someone else's discard is on offer; `waiting` means the
 * table is not asking you for anything.
 */
export type TablePhase = "discard" | "claim" | "waiting";

export interface TableState {
  readonly id: string;
  readonly title: string;
  /** One line telling the tester what this scenario is probing. */
  readonly probe: string;
  readonly phase: TablePhase;
  readonly turn: Seat;
  readonly roundWind: string;
  readonly seatWind: string;
  readonly wallRemaining: number;
  readonly hand: readonly Tile[];
  /** Id of the just-drawn tile, rendered detached from the sorted hand. */
  readonly drawnTileId: string | null;
  readonly melds: readonly Meld[];
  readonly opponents: readonly OpponentView[];
  readonly discardPile: readonly TileKind[];
  readonly lastDiscard: { readonly tile: Tile; readonly from: Seat } | null;
  readonly claims: readonly ClaimOption[];
}
