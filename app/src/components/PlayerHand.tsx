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
  tapAction = "discard",
  marked,
}: {
  readonly tiles: readonly TileType[];
  readonly melds: readonly PublicMeld[];
  readonly selected: TileId | null;
  /** The tiles this hand will respond to a tap on. */
  readonly discardable: ReadonlySet<TileId>;
  readonly cornerLabel: CornerLabelMode;
  readonly onTapTile: (tileId: TileId) => void;
  /**
   * What a tap does here.
   *
   * The table's own model is tap-to-lift then tap-again-to-discard (#7), and
   * that is the default. Learn to Play's first lesson (#30) asks the player to
   * *point* at a shape in a hand that is not going anywhere, which is one tap
   * and no lift — and a screen reader has to be told which of the two it is,
   * or the hand promises a discard that pointing will not deliver.
   */
  readonly tapAction?: "discard" | "identify";
  /** Tiles the tutorial has lit up as the shape the player just named. */
  readonly marked?: ReadonlySet<TileId>;
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
        /* Onboarding's attention layer measures the real element rather than
           storing a coordinate for it (#33, tutorial/targets.ts). Stamping the
           production component is what makes the spotlight correct at every
           tier and inset; nothing reads these outside a teaching surface. */
        data-teach="hand"
      >
        {tiles.map((tile) => {
          const isSelected = selected === tile.id;
          const canDiscard = discardable.has(tile.id);
          const isMarked = marked?.has(tile.id) ?? false;
          return (
            <button
              key={tile.id}
              type="button"
              className="hand__slot"
              data-teach-tile={tile.id}
              data-selected={isSelected}
              data-discardable={!choosing || canDiscard}
              data-marked={isMarked}
              aria-pressed={tapAction === "identify" ? isMarked : isSelected}
              disabled={!canDiscard}
              aria-label={
                isSelected
                  ? `${tileName(tile.kind)}, selected. Tap again to discard.`
                  : isMarked
                    ? `${tileName(tile.kind)}, part of the shape you named.`
                    : tileName(tile.kind)
              }
              onClick={() => { onTapTile(tile.id); }}
            >
              <Tile
                kind={tile.kind}
                variant="hand"
                state={isSelected || isMarked ? "selected" : "rest"}
                cornerLabel={cornerLabel}
              />
            </button>
          );
        })}
      </div>

      {melds.length > 0 && (
        <div
          className="hand__melds"
          role="group"
          aria-label="Your exposed melds"
          data-teach="hand-melds"
        >
          {melds.map((meld, index) => (
            <MeldGroup key={index} meld={meld} variant="meld" />
          ))}
        </div>
      )}
    </div>
  );
}
