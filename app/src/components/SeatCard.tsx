import type { JSX } from "react";

import type { PublicPlayerState } from "@engine";

import { seatPositionName, tileName, windName, type SeatPosition } from "../game/labels";
import { MeldGroup } from "./MeldGroup";

/**
 * One opponent. All three seats use this same card, so the table reads as one
 * component treated consistently rather than three variations on a theme.
 *
 * The concealed hand is a count with a stack glyph, not thirteen drawn backs:
 * the count is the entire information, and the backs would take the width the
 * exposed melds need in order to stay readable at phone size.
 *
 * Two bands of it are optional, and which ones are shown is the responsive
 * priority policy's decision rather than this component's (game/geometry.ts).
 * The seat's identity — wind, position, turn marker and concealed count — is
 * never optional: that is the public state the player reasons from.
 */
export function SeatCard({
  player,
  position,
  active,
  showMeta = true,
  showMelds = true,
}: {
  readonly player: PublicPlayerState;
  readonly position: SeatPosition;
  readonly active: boolean;
  /** Score readout and bonus-tile count. Dropped on a narrow phone. */
  readonly showMeta?: boolean;
  /** Exposed melds as drawn tiles. Counted instead once the rail is squeezed. */
  readonly showMelds?: boolean;
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
        {/* A labelled zero is a readout of a value that does not exist yet.
            The label stays the moment there is a number to label (F-06); the
            whole readout waits for one. */}
        {showMeta && player.score !== 0 && (
          <span className="seat__score">
            <span className="seat__scorelabel">score </span>
            <span className="tabular">{player.score}</span>
          </span>
        )}
      </div>

      <p className="seat__concealed">
        <span className="seat__stack" aria-hidden="true" />
        <span className="tabular">{player.concealedCount}</span>
        <span className="visually-hidden">tiles in hand</span>
      </p>

      {player.melds.length > 0 &&
        (showMelds ? (
          <div className="seat__melds">
            {player.melds.map((meld, index) => (
              <MeldGroup key={index} meld={meld} variant="opponent" />
            ))}
          </div>
        ) : (
          /*
           * The rail has run out of width for drawn melds. A count is the
           * least-bad substitute — an exposed meld is public information the
           * player reasons about, so it is named rather than dropped, and the
           * discard well the width buys back outranks it (game/geometry.ts).
           */
          <p className="seat__meldcount">
            <span className="tabular">{player.melds.length}</span>
            <span> exposed</span>
            <span className="visually-hidden">
              :{" "}
              {player.melds
                .map((meld) =>
                  meld.tiles === null
                    ? `concealed ${meld.type}`
                    : `${meld.type} of ${meld.tiles.map((tile) => tileName(tile.kind)).join(", ")}`,
                )
                .join("; ")}
            </span>
          </p>
        ))}

      {/* A count, not up to eight drawn faces. This is the same judgement §11
          already makes about an opponent's concealed hand — the count is the
          whole of the information, and the faces spend the width the exposed
          melds need to stay readable. Bonus tiles are settled score the player
          cannot act on, and the result sheet itemises every one of them. */}
      {showMeta && player.bonuses.length > 0 && (
        <p className="seat__bonuscount">
          <span className="tabular">{player.bonuses.length}</span>
          <span> bonus</span>
        </p>
      )}
    </section>
  );
}
