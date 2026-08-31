import type { CSSProperties } from "react";
import { tileFace, type Tile as TileModel } from "../model/tiles.ts";
import type { LabelMode } from "../model/settings.ts";

/**
 * Pip rows per rank. Deliberately plain: this prototype tests whether a hand of
 * fourteen is readable at phone size, not whether the artwork is beautiful.
 * Production faces are SVG and belong to #8.
 *
 * Bamboo and dots are laid out separately because a stick reads very differently
 * from a circle: stacked single sticks merge into one long stroke, so bamboo
 * groups horizontally wherever tradition allows it.
 */
const DOT_ROWS: Readonly<Record<number, readonly number[]>> = {
  1: [1],
  2: [1, 1],
  3: [1, 1, 1],
  4: [2, 2],
  5: [2, 1, 2],
  6: [3, 3],
  7: [3, 4],
  8: [4, 4],
  9: [3, 3, 3],
};

const STICK_ROWS: Readonly<Record<number, readonly number[]>> = {
  1: [1],
  2: [1, 1],
  3: [1, 2],
  4: [2, 2],
  5: [2, 1, 2],
  6: [3, 3],
  7: [1, 3, 3],
  8: [4, 4],
  9: [3, 3, 3],
};

export interface TileProps {
  readonly tile: TileModel;
  readonly labels: LabelMode;
  readonly selected?: boolean;
  readonly detached?: boolean;
  readonly highlighted?: boolean;
  readonly size?: "hand" | "meld" | "focus" | "pile";
  readonly onPointerDown?: (event: React.PointerEvent<HTMLElement>) => void;
  readonly onPointerUp?: (event: React.PointerEvent<HTMLElement>) => void;
  readonly interactive?: boolean;
  readonly ariaLabel?: string;
}

export function Tile({
  tile,
  labels,
  selected = false,
  detached = false,
  highlighted = false,
  size = "hand",
  onPointerDown,
  onPointerUp,
  interactive = false,
  ariaLabel,
}: TileProps): React.JSX.Element {
  const face = tileFace(tile.kind);
  const classes = ["tile", `tile--${size}`, `ink--${face.ink}`];
  if (selected) classes.push("is-selected");
  if (detached) classes.push("is-detached");
  if (highlighted) classes.push("is-decision");

  const label = labels === "off" ? null : labels === "rank" ? face.rankLabel : face.shortLabel;

  const Element = interactive ? "button" : "div";

  return (
    <Element
      type={interactive ? "button" : undefined}
      className={classes.join(" ")}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      aria-label={ariaLabel ?? face.name}
      aria-pressed={interactive ? selected : undefined}
    >
      <span className="tile__face">
        {face.pips === null ? (
          <span className="tile__glyphs">
            <span className="tile__glyph">{face.glyph}</span>
            {face.subGlyph !== null && <span className="tile__sub">{face.subGlyph}</span>}
          </span>
        ) : (
          <Pips count={face.pips} shape={face.suit === "bamboo" ? "stick" : "dot"} />
        )}
        {label !== null && <span className="tile__label">{label}</span>}
      </span>
    </Element>
  );
}

function Pips({ count, shape }: { count: number; shape: "dot" | "stick" }): React.JSX.Element {
  const table = shape === "stick" ? STICK_ROWS : DOT_ROWS;
  const rows = table[count] ?? [count];
  const widest = Math.max(...rows);
  const style = { "--pip-cols": String(widest), "--pip-rows": String(rows.length) } as CSSProperties;
  return (
    <span className={`pips pips--${shape}`} style={style}>
      {rows.map((inRow, rowIndex) => (
        <span className="pips__row" key={`${String(rowIndex)}-${String(inRow)}`}>
          {Array.from({ length: inRow }, (_, pipIndex) => (
            <span className="pip" key={pipIndex} />
          ))}
        </span>
      ))}
    </span>
  );
}

/** A face-down tile, used for opponents' concealed hands. */
export function TileBack({ size = "pile" }: { size?: TileProps["size"] }): React.JSX.Element {
  return <div className={`tile tile--${size} tile--back`} aria-hidden="true" />;
}
