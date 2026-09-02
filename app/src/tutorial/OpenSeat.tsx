import type { JSX } from "react";

import type { PublicPlayerState, Tile as TileType } from "@engine";

import { MeldGroup } from "../components/MeldGroup";
import { seatPositionName, windName, type SeatPosition } from "../game/labels";
import { Tile } from "../tiles/Tile";

/**
 * One opponent's hand, face up, inside the Peek overlay.
 *
 * Not `SeatCard` with a flag bolted on. The production seat deliberately shows
 * a *count* rather than thirteen tiles (DESIGN.md §11) because the count is
 * the whole of the information a real game gives you, and putting an escape
 * hatch into that component would make the table's most sensitive rule a
 * matter of which prop a caller happened to pass. Learn to Play draws its own
 * panel instead, so the production seat stays incapable of showing a hand it
 * should not.
 *
 * It lives on the Peek surface rather than in the seat rail because a rail on
 * a phone is 13-16px wide per tile, which is a picture of a tile rather than a
 * tile. Peek owns the whole viewport, so these are drawn at a size worth
 * reading (`--peek-tile-w`, from the geometry engine).
 *
 * The tiles come from the tutorial runner's `openHands`, which is a plain map
 * from the engine's named hidden-information accessor — never from the
 * redacted view, which does not contain them at all. A lesson that reveals
 * nothing produces no map entry, so no panel is drawn for that seat and there
 * is no code path here that could invent one.
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
  /** The seat's concealed tiles. Only ever the ones the lesson reveals. */
  readonly open: readonly TileType[];
}): JSX.Element {
  const where = seatPositionName(position);
  const wind = windName(player.seatWind);

  return (
    <section
      className={`openseat openseat--${position}`}
      data-active={active}
      aria-label={`${where} opponent, ${wind} seat${active ? ", to play" : ""}`}
    >
      <div className="openseat__head">
        <span className="seat__wind" aria-hidden="true">
          {{ east: "東", south: "南", west: "西", north: "北" }[player.seatWind]}
        </span>
        <span className="seat__where">{where}</span>
        {/* Whose turn it is, in words as well as in the brass rule above the
            panel: state in this product is never carried by hue alone (§7). */}
        {active && <span className="openseat__turn">to play</span>}
      </div>

      <div
        className="openseat__hand"
        role="group"
        aria-label={`${where} opponent's hand, shown for teaching: ${String(open.length)} tiles`}
      >
        {open.map((tile) => (
          <Tile key={tile.id} kind={tile.kind} variant="opponent" />
        ))}
      </div>

      {player.melds.length > 0 && (
        <div className="openseat__melds">
          {player.melds.map((meld, index) => (
            <MeldGroup key={index} meld={meld} variant="opponent" />
          ))}
        </div>
      )}
    </section>
  );
}
