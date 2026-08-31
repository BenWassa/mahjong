import { Tile, TileBack } from "./Tile.tsx";
import { SEAT_LABEL, type OpponentView, type Seat, type TableState } from "../model/table.ts";
import type { LabelMode } from "../model/settings.ts";

export interface TableTopProps {
  readonly table: TableState;
  readonly labels: LabelMode;
}

export function TableTop({ table, labels }: TableTopProps): React.JSX.Element {
  return (
    <div className="tabletop">
      <div className="tabletop__opponents">
        {table.opponents.map((opponent) => (
          <Opponent
            key={opponent.seat}
            opponent={opponent}
            labels={labels}
            active={table.turn === opponent.seat}
          />
        ))}
      </div>

      <div className="tabletop__centre">
        <div className="well" aria-label="Discard pile">
          {table.discardPile.map((kind, index) => (
            <Tile
              key={`${kind}-${String(index)}`}
              tile={{ id: `pile-${String(index)}`, kind }}
              labels={labels}
              size="pile"
            />
          ))}
        </div>

        {table.lastDiscard !== null && (
          <div className="focus" aria-label="Tile on offer">
            <p className="focus__from">{SEAT_LABEL[table.lastDiscard.from]} discarded</p>
            <Tile tile={table.lastDiscard.tile} labels={labels} size="focus" highlighted />
          </div>
        )}
      </div>

      {table.melds.length > 0 && (
        <div className="tabletop__mine" aria-label="Your exposed melds">
          <span className="tabletop__mineLabel">Your melds</span>
          {table.melds.map((meld, index) => (
            <span className="meld" key={`${meld.kind}-${String(index)}`}>
              {meld.tiles.map((tile) => (
                <Tile key={tile.id} tile={tile} labels={labels} size="meld" />
              ))}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Opponent({
  opponent,
  labels,
  active,
}: {
  opponent: OpponentView;
  labels: LabelMode;
  active: boolean;
}): React.JSX.Element {
  return (
    <div className={`opponent${active ? " is-active" : ""}`}>
      <span className="opponent__seat">
        {seatName(opponent.seat)} · {opponent.wind}
      </span>
      <span className="opponent__concealed">
        <TileBack />
        <span className="opponent__count">{opponent.concealedCount}</span>
      </span>
      {opponent.melds.map((meld, index) => (
        <span className="meld" key={`${meld.kind}-${String(index)}`}>
          {meld.tiles.map((tile) => (
            <Tile key={tile.id} tile={tile} labels={labels} size="meld" />
          ))}
        </span>
      ))}
    </div>
  );
}

function seatName(seat: Seat): string {
  return SEAT_LABEL[seat];
}
