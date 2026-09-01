import type { JSX } from "react";

import type { PublicMeld, Tile as TileType, TileId } from "@engine";

import { tileName } from "../game/labels";
import { Tile, type CornerLabelMode } from "../tiles/Tile";
import { MeldGroup } from "./MeldGroup";

/**
 * The player's hand, and their own exposed melds beside it.
 *
 * Tap once to lift, tap the same tile again to discard: the accepted #7 model.
 * Every tile is a real button, so the hand is walkable by keyboard and each
 * tile announces both its face and whether tapping it again would discard it.
 */
export function PlayerHand({
  tiles,
  melds,
  selected,
  discardable,
  cornerLabel,
  onTapTile,
}: {
  readonly tiles: readonly TileType[];
  readonly melds: readonly PublicMeld[];
  readonly selected: TileId | null;
  readonly discardable: ReadonlySet<TileId>;
  readonly cornerLabel: CornerLabelMode;
  readonly onTapTile: (tileId: TileId) => void;
}): JSX.Element {
  // When nothing at all is discardable the player is not choosing a discard,
  // they are reading their hand to decide a claim. Dimming every tile then
  // obscures the very tiles the decision depends on: #7 found that defect in
  // the prototype and it must not come back through the disabled styling.
  const choosing = discardable.size > 0;

  return (
    <div className="handrow">
      <div
        className="hand"
        role="group"
        aria-label={`Your hand, ${String(tiles.length)} tiles`}
      >
        {tiles.map((tile) => {
          const isSelected = selected === tile.id;
          const canDiscard = discardable.has(tile.id);
          return (
            <button
              key={tile.id}
              type="button"
              className="hand__slot"
              data-selected={isSelected}
              data-discardable={!choosing || canDiscard}
              aria-pressed={isSelected}
              disabled={!canDiscard}
              aria-label={
                isSelected
                  ? `${tileName(tile.kind)}, selected. Tap again to discard.`
                  : tileName(tile.kind)
              }
              onClick={() => { onTapTile(tile.id); }}
            >
              <Tile
                kind={tile.kind}
                variant="hand"
                state={isSelected ? "selected" : "rest"}
                cornerLabel={cornerLabel}
              />
            </button>
          );
        })}
      </div>

      {melds.length > 0 && (
        <div className="hand__melds" role="group" aria-label="Your exposed melds">
          {melds.map((meld, index) => (
            <MeldGroup key={index} meld={meld} variant="meld" />
          ))}
        </div>
      )}
    </div>
  );
}
