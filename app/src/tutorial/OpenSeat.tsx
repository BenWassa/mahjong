import type { JSX } from "react";

import type { PublicPlayerState, Tile as TileType } from "@engine";

import { MeldGroup } from "../components/MeldGroup";
import { seatPositionName, windName, type SeatPosition } from "../game/labels";
import { Tile } from "../tiles/Tile";

/**
 * One opponent during a lesson, with the option of their hand face up.
 *
 * Not `SeatCard` with a flag bolted on. The production seat deliberately shows
 * a *count* rather than thirteen tiles (DESIGN.md §11) because the count is
 * the whole of the information a real game gives you, and putting an escape
 * hatch into that component would make the table's most sensitive rule a
 * matter of which prop a caller happened to pass. Learn to Play draws its own
 * seat instead, so the production one stays incapable of showing a hand it
 * should not.
 *
 * The tiles come from the tutorial runner's `openHands`, which is a plain map
 * from the engine's named hidden-information accessor — never from the
 * redacted view, which does not contain them at all.
 */
export function OpenSeat({
  player,
  position,
  active,
  open,
}: {
  readonly player: PublicPlayerState;
  readonly position: SeatPosition;
  readonly active: boolean;
  /** The seat's concealed tiles when the lesson is teaching with them shown. */
  readonly open: readonly TileType[] | null;
}): JSX.Element {
  const where = seatPositionName(position);
  const wind = windName(player.seatWind);

  return (
    <section
      className={`seat seat--${position} openseat`}
      data-active={active}
      data-open={open !== null}
      aria-label={`${where} opponent, ${wind} seat${active ? ", to play" : ""}`}
    >
      <div className="seat__head">
        <span className="seat__wind" aria-hidden="true">
          {{ east: "東", south: "南", west: "西", north: "北" }[player.seatWind]}
        </span>
        <span className="seat__where">{where}</span>
      </div>

      {open === null ? (
        <p className="seat__concealed">
          <span className="seat__stack" aria-hidden="true" />
          <span className="tabular">{player.concealedCount}</span>
          <span className="visually-hidden">tiles in hand</span>
        </p>
      ) : (
        <div
          className="openseat__hand"
          role="group"
          aria-label={`${where} opponent's hand, shown for teaching: ${String(open.length)} tiles`}
        >
          {open.map((tile) => (
            <Tile key={tile.id} kind={tile.kind} variant="opponent" />
          ))}
        </div>
      )}

      {player.melds.length > 0 && (
        <div className="seat__melds">
          {player.melds.map((meld, index) => (
            <MeldGroup key={index} meld={meld} variant="opponent" />
          ))}
        </div>
      )}
    </section>
  );
}
