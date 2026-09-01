import type { JSX } from "react";

import type { PublicPlayerState } from "@engine";

import { seatPositionName, windName, type SeatPosition } from "../game/labels";
import { Tile } from "../tiles/Tile";
import { MeldGroup } from "./MeldGroup";

/**
 * One opponent. All three seats use this same card, so the table reads as one
 * component treated consistently rather than three variations on a theme.
 *
 * The concealed hand is a count with a stack glyph, not thirteen drawn backs:
 * the count is the entire information, and the backs would take the width the
 * exposed melds need in order to stay readable at phone size.
 */
export function SeatCard({
  player,
  position,
  active,
}: {
  readonly player: PublicPlayerState;
  readonly position: SeatPosition;
  readonly active: boolean;
}): JSX.Element {
  const where = seatPositionName(position);
  const wind = windName(player.seatWind);

  return (
    <section
      className={`seat seat--${position}`}
      data-active={active}
      aria-label={`${where} opponent, ${wind} seat${active ? ", to play" : ""}`}
    >
      <div className="seat__head">
        <span className="seat__wind" aria-hidden="true">
          {{ east: "東", south: "南", west: "西", north: "北" }[player.seatWind]}
        </span>
        <span className="seat__where">{where}</span>
        <span className="seat__score">
          <span className="seat__scorelabel">score </span>
          <span className="tabular">{player.score}</span>
        </span>
      </div>

      <p className="seat__concealed">
        <span className="seat__stack" aria-hidden="true" />
        <span className="tabular">{player.concealedCount}</span>
        <span className="visually-hidden">tiles in hand</span>
      </p>

      {player.melds.length > 0 && (
        <div className="seat__melds">
          {player.melds.map((meld, index) => (
            <MeldGroup key={index} meld={meld} variant="opponent" />
          ))}
        </div>
      )}

      {player.bonuses.length > 0 && (
        <div className="seat__bonuses" role="group" aria-label="Bonus tiles">
          {player.bonuses.map((tile) => (
            <Tile key={tile.id} kind={tile.kind} variant="opponent" />
          ))}
        </div>
      )}
    </section>
  );
}
