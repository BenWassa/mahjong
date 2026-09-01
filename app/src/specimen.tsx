import { StrictMode, type JSX } from "react";
import { createRoot } from "react-dom/client";

import type { TileKind } from "@engine";

import { tileName } from "./game/labels";
import { Tile } from "./tiles/Tile";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/table.css";

/**
 * The tile specimen sheet.
 *
 * Not part of the production bundle: Vite's build entry is index.html, so this
 * page exists only under the dev server. It is how the fifty faces get audited
 * at the sizes they are actually played at, which is the only question that
 * matters about a mahjong tile.
 */

const SUITS = ["characters", "bamboo", "dots"] as const;
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

const ROWS: readonly { label: string; kinds: readonly TileKind[] }[] = [
  ...SUITS.map((suit) => ({
    label: suit,
    kinds: RANKS.map((rank) => `${suit}-${String(rank)}` as TileKind),
  })),
  {
    label: "winds",
    kinds: ["wind-east", "wind-south", "wind-west", "wind-north"] as TileKind[],
  },
  {
    label: "dragons",
    kinds: ["dragon-red", "dragon-green", "dragon-white"] as TileKind[],
  },
  {
    label: "flowers",
    kinds: ["flower-1", "flower-2", "flower-3", "flower-4"] as TileKind[],
  },
  {
    label: "seasons",
    kinds: ["season-1", "season-2", "season-3", "season-4"] as TileKind[],
  },
];

/** The three sizes the set is actually read at, in CSS pixels. */
const SIZES = [
  { label: "hand 56px", width: 56 },
  { label: "discard 30px", width: 30 },
  { label: "meld 22px", width: 22 },
];

function Sheet(): JSX.Element {
  return (
    <div className="specimen">
      {SIZES.map((size) => (
        <section key={size.label}>
          <h2 className="specimen__size">{size.label}</h2>
          {ROWS.map((row) => (
            <div className="specimen__row" key={row.label}>
              <span className="specimen__label">{row.label}</span>
              {row.kinds.map((kind) => (
                <span
                  key={kind}
                  className="specimen__cell"
                  title={tileName(kind)}
                  style={{
                    width: `${String(size.width)}px`,
                    height: `${String(Math.round((size.width * 4) / 3))}px`,
                  }}
                >
                  <Tile kind={kind} variant="offer" />
                </span>
              ))}
            </div>
          ))}
        </section>
      ))}
      <section>
        <h2 className="specimen__size">states, 56px</h2>
        <div className="specimen__row">
          <span className="specimen__label">rest / selected / pending / dimmed / back</span>
          {(["rest", "selected", "pending", "dimmed"] as const).map((state) => (
            <span key={state} className="specimen__cell" style={{ width: 56, height: 75 }}>
              <Tile kind="characters-5" variant="offer" state={state} />
            </span>
          ))}
          <span className="specimen__cell" style={{ width: 56, height: 75 }}>
            <Tile kind="characters-5" variant="offer" facedown />
          </span>
          <span className="specimen__cell" style={{ width: 56, height: 75 }}>
            <Tile kind="characters-5" variant="offer" cornerLabel="rank-suit" />
          </span>
        </div>
      </section>
    </div>
  );
}

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root");
createRoot(root).render(
  <StrictMode>
    <Sheet />
  </StrictMode>,
);
