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
 */
export function StatusStrip({ view }: { readonly view: PublicGameState }): JSX.Element {
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
      <span className="status__seat">
        <span className="status__seatlabel">Score</span>
        <span className="tabular">{self.score}</span>
      </span>
      <span className="status__turn" role="status">
        <span
          className="status__turnmark"
          data-self={view.currentSeat === view.viewer}
          aria-hidden="true"
        />
        {turn}
      </span>
    </header>
  );
}
