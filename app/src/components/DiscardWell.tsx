import type { JSX } from "react";

import type { Discard, PublicGameState, Tile as TileType } from "@engine";

import { tileName } from "../game/labels";
import { Tile } from "../tiles/Tile";
import { RoundPlaque } from "./RoundPlaque";

/**
 * The central discard well and, above it, the tile currently on offer.
 *
 * The offered tile is drawn at hand size rather than pile size: it is the one
 * face a claim decision turns on, and a claim made against a 26px tile is a
 * guess. Claimed discards stay in the pile but recede, so the pile keeps its
 * history without competing with the live tile.
 */
export function DiscardWell({
  discards,
  columns,
  rows,
  offered,
  offeredFrom,
  view,
}: {
  readonly discards: readonly Discard[];
  readonly columns: number;
  readonly rows: number;
  readonly offered: TileType | null;
  readonly offeredFrom: string | null;
  readonly view: PublicGameState;
}): JSX.Element {
  // A claimed tile is not in the pile any more: it is in the claimer's exposed
  // meld, which is where a player looks for it. Drawing it in both places gave
  // the pile a greyed-out tile that read as a broken one and duplicated a tile
  // that is already on show a few centimetres away.
  const inPile = discards.filter((discard) => discard.claimedBy === null);

  // Capped at what the well can actually show. Older discards fall off the
  // front: recent history is what a decision uses.
  const capacity = columns * rows;
  const shown = inPile.slice(Math.max(0, inPile.length - capacity));
  const latest = inPile.at(-1);

  return (
    <div className="well">
      {/* The plaque is ambient information and the offered tile is a live
          decision; they do not both need the centre of the table at once. The
          slot reserves the taller of the two so swapping between them does not
          shunt the pile up and down. */}
      <div className="well__focus">
        {offered === null ? (
          <RoundPlaque view={view} />
        ) : (
          <div className="offer" role="status">
            <Tile key={offered.id} kind={offered.kind} variant="offer" state="pending" />
            <span className="offer__label">
              {offeredFrom === null ? "on offer" : `${offeredFrom} discarded`}
            </span>
          </div>
        )}
      </div>

      {shown.length > 0 && (
        <div
          className="well__grid"
          style={{ ["--discard-columns" as string]: String(columns) }}
          role="group"
          aria-label={`Discard pile, ${String(inPile.length)} tiles${
            latest === undefined ? "" : `, most recent ${tileName(latest.tile.kind)}`
          }`}
        >
          {shown.map((discard) => (
            <div
              key={discard.index}
              className="well__cell"
              data-latest={discard.index === latest?.index && offered === null}
            >
              {/* Individually hidden: a screen reader reading thirty tile names
                  in sequence is noise. The group label above carries the count
                  and the live tile. */}
              <div aria-hidden="true">
                <Tile kind={discard.tile.kind} variant="discard" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
