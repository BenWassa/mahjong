import type { JSX } from "react";

import type { PublicGameState } from "@engine";

import { seatPosition, seatPositionName, windName } from "../game/labels";

/**
 * The permanent readout: round wind, the player's own seat wind, tiles left in
 * the wall and whose turn it is.
 *
 * Turn ownership is stated in words and marked with a filled bar. It is the
 * one piece of state the player checks most often, so it is the only thing in
 * the strip that changes weight.
 *
 * It also carries the **Menu** button (#33). `ONBOARDING_DESIGN.md` §4.2
 * requires a visible, conventional route from the landscape table to settings,
 * Learn, the rules and stats, because the previous route was to rotate the
 * phone — a command nothing announced and nobody would guess. The strip is
 * where it belongs: it is the one band that is on screen at every tier, it is
 * already the table's chrome rather than its felt, and a control in the top
 * corner is where a player looks for a menu in any other game.
 */
export function StatusStrip({
  view,
  onMenu = null,
}: {
  readonly view: PublicGameState;
  /**
   * Opens the menu. Null on a surface that has its own way out — the
   * walkthrough carries its own Menu button beside its Skip control.
   */
  readonly onMenu?: (() => void) | null;
}): JSX.Element {
  const self = view.players[view.viewer];
  const turn =
    view.phase.kind === "awaiting-claims"
      ? "Claim open"
      : view.currentSeat === null
        ? "Hand over"
        : view.currentSeat === view.viewer
          ? "Your turn"
          : `${seatPositionName(seatPosition(view.currentSeat, view.viewer))} to play`;

  // The round wind and the wall count live on the centre plaque, where a real
  // table keeps them. Saying them twice was noise competing with the one thing
  // the player checks constantly, which is whose turn it is.
  return (
    <header className="status">
      <span className="status__seat">
        <span className="status__seatlabel">Your seat</span>
        {windName(self.seatWind)}
        {view.dealer === view.viewer ? ", dealer" : ""}
      </span>
      {/* Withheld until it exists. A strip that reads "SCORE 0" before a
          single settlement is a container around nothing (§2.2). */}
      {self.score !== 0 && (
        <span className="status__seat status__seat--score">
          <span className="status__seatlabel">Score</span>
          <span className="tabular">{self.score}</span>
        </span>
      )}
      <span className="status__turn" role="status">
        <span
          className="status__turnmark"
          data-self={view.currentSeat === view.viewer}
          aria-hidden="true"
        />
        {turn}
      </span>
      {onMenu !== null && (
        <button
          type="button"
          className="status__menu"
          onClick={onMenu}
          data-teach="menu"
        >
          Menu
        </button>
      )}
    </header>
  );
}
