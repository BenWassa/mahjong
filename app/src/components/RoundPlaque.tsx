import type { JSX } from "react";

import type { PublicGameState } from "@engine";

import { windName } from "../game/labels";

const WIND_GLYPH = { east: "東", south: "南", west: "西", north: "北" } as const;

/**
 * The round marker at the centre of the felt.
 *
 * A real Hong Kong table keeps the prevailing wind in the middle, and putting
 * it there solves a composition problem as well as a product one: the centre
 * of the table is legitimately empty at the start of a hand, and an empty
 * centre with nothing in it reads as a layout that failed rather than as felt.
 *
 * It also removes the duplication that had the round wind and the wall count
 * stated twice, once here and once in the status strip.
 */
export function RoundPlaque({ view }: { readonly view: PublicGameState }): JSX.Element {
  return (
    <div className="plaque">
      <span className="plaque__wind" aria-hidden="true">
        {WIND_GLYPH[view.roundWind]}
      </span>
      <span className="visually-hidden">
        {windName(view.roundWind)} round, hand {view.handIndex + 1},{" "}
        {view.wallCount} tiles left in the wall
      </span>
      <span className="plaque__meta" aria-hidden="true">
        {/* Labelled "round": the round wind and the player's own seat wind are
            often the same, and an unlabelled "East" beside another "East" is
            the kind of ambiguity that teaches the wrong thing. */}
        <span className="plaque__round">{windName(view.roundWind)} round</span>
        <span className="plaque__wall tabular">{view.wallCount}</span>
        <span className="plaque__walllabel">wall</span>
      </span>
    </div>
  );
}
