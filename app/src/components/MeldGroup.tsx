import type { JSX } from "react";

import type { PublicMeld } from "@engine";

import { tileName } from "../game/labels";
import { Tile } from "../tiles/Tile";

/**
 * One exposed or concealed meld. A concealed kong is shown as its two end
 * tiles face down around its two visible ones, which is the conventional
 * reading and needs no legend beside it.
 */
export function MeldGroup({
  meld,
  variant,
}: {
  readonly meld: PublicMeld;
  readonly variant: "meld" | "opponent";
}): JSX.Element {
  const known = meld.tiles;
  const label =
    known === null
      ? `Concealed ${meld.type}`
      : `${meld.exposure === "concealed" ? "Concealed" : "Exposed"} ${meld.type}: ${known
          .map((tile) => tileName(tile.kind))
          .join(", ")}`;

  return (
    <div
      className={`meld meld--${meld.exposure}`}
      role="group"
      aria-label={label}
    >
      {known === null
        ? Array.from({ length: meld.tileCount }, (_, index) => (
            <Tile key={index} kind="wind-east" variant={variant} facedown />
          ))
        : known.map((tile, index) => (
            <Tile
              key={tile.id}
              kind={tile.kind}
              variant={variant}
              facedown={
                meld.exposure === "concealed" &&
                (index === 0 || index === known.length - 1)
              }
            />
          ))}
    </div>
  );
}
