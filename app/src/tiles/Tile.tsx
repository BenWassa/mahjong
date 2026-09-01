import type { JSX } from "react";

import type { TileKind } from "@engine";

import { tileName, tileShortLabel } from "../game/labels";
import { tileFace } from "./faces";

export type TileVariant = "hand" | "discard" | "meld" | "opponent" | "offer";
export type TileState = "rest" | "selected" | "pending" | "dimmed";
export type CornerLabelMode = "off" | "rank" | "rank-suit";

export interface TileProps {
  readonly kind: TileKind;
  readonly variant?: TileVariant;
  readonly state?: TileState;
  readonly cornerLabel?: CornerLabelMode;
  readonly facedown?: boolean;
}

/**
 * One tile. Four layers, exactly as PRD §8 requires: the body, the engraving,
 * an optional corner label that never touches the traditional face, and a
 * state overlay.
 *
 * The body is drawn rather than shaded with a gradient fill: a real tile has a
 * raised rim around a recessed face, and that edge is what makes a lifted tile
 * legible against felt.
 */
export function Tile({
  kind,
  variant = "hand",
  state = "rest",
  cornerLabel = "off",
  facedown = false,
}: TileProps): JSX.Element {
  const label = facedown ? "Face-down tile" : tileName(kind);
  const short = cornerLabel === "off" || facedown ? "" : tileShortLabel(kind, cornerLabel);

  return (
    <svg
      className={`tile tile--${variant} tile--${state}`}
      viewBox="0 0 60 80"
      role="img"
      aria-label={label}
      focusable="false"
    >
      {facedown ? (
        <>
          <rect x={1} y={1} width={58} height={78} rx={5} fill="var(--tile-back)" />
          <rect
            x={4}
            y={4}
            width={52}
            height={72}
            rx={3}
            fill="none"
            stroke="var(--table-edge)"
            strokeWidth={1.4}
            opacity={0.55}
          />
        </>
      ) : (
        <>
          {/* Rim, then the recessed face it surrounds. */}
          <rect x={0.5} y={0.5} width={59} height={79} rx={5} fill="var(--tile-edge)" />
          <rect
            x={2}
            y={1.5}
            width={56}
            height={75}
            rx={4}
            fill={state === "selected" ? "var(--tile-face-lit)" : "var(--tile-face)"}
          />
          {/* A single highlight along the top edge reads as a bevel catching
              the light; without it a bone tile on bone felt goes flat. */}
          <path
            d="M4 3h52"
            stroke="#ffffff"
            strokeWidth={1.6}
            strokeLinecap="round"
            opacity={0.55}
          />
          {tileFace(kind)}
          {short !== "" && (
            <text
              x={5}
              y={11}
              textAnchor="start"
              fontFamily="var(--font-ui)"
              fontSize={11}
              fontWeight={700}
              fill="var(--ink)"
              opacity={0.55}
            >
              {short}
            </text>
          )}
        </>
      )}
    </svg>
  );
}
