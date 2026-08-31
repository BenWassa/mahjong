import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Tile } from "./Tile.tsx";
import type { Tile as TileModel } from "../model/tiles.ts";
import { measureHand, type HandMetrics, type PrototypeSettings } from "../model/settings.ts";

export interface HandProps {
  readonly hand: readonly TileModel[];
  /**
   * Tile count the row is sized for, which is the widest the hand will get this
   * cycle rather than its width right now. Sizing for the live count would make
   * every tile jump between the 13- and 14-tile halves of a turn, and a hand
   * that changes size cannot answer a legibility question.
   */
  readonly sizingCount: number;
  readonly drawnTileId: string | null;
  readonly selectedTileId: string | null;
  readonly decisionTileIds: ReadonlySet<string>;
  readonly settings: PrototypeSettings;
  readonly active: boolean;
  readonly onTap: (tileId: string) => void;
  readonly onFlick: (tileId: string) => void;
  readonly onMeasured: (metrics: HandMetrics) => void;
}

/** Upward travel, in CSS px, that separates a flick from a tap. */
const FLICK_THRESHOLD = 24;
/** Horizontal slop allowed during a flick before it is read as a drag. */
const FLICK_DRIFT = 44;

export function Hand({
  hand,
  sizingCount,
  drawnTileId,
  selectedTileId,
  decisionTileIds,
  settings,
  active,
  onTap,
  onFlick,
  onMeasured,
}: HandProps): React.JSX.Element {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState(0);
  const viewportHeight = useViewportHeight();
  const pointer = useRef<{ id: number; tileId: string; x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const element = rowRef.current;
    if (element === null) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) setAvailable(entry.contentRect.width);
    });
    observer.observe(element);
    setAvailable(element.clientWidth);
    return () => {
      observer.disconnect();
    };
  }, []);

  // A landscape phone is short: cap `fit` by the vertical room the hand bar has
  // before the 3:4 face would eat the table.
  const heightCap = Math.floor((viewportHeight * 0.42 * 3) / 4);
  const metrics = measureHand(
    available,
    Math.max(hand.length, sizingCount),
    settings,
    drawnTileId !== null,
    heightCap,
  );

  const { tileWidth, tileHeight, overflows, approxMillimetres } = metrics;
  useEffect(() => {
    if (available <= 0) return;
    onMeasured({ tileWidth, tileHeight, overflows, approxMillimetres });
  }, [available, approxMillimetres, onMeasured, overflows, tileHeight, tileWidth]);

  const handleDown = useCallback((event: React.PointerEvent<HTMLElement>, tileId: string) => {
    pointer.current = { id: event.pointerId, tileId, x: event.clientX, y: event.clientY };
  }, []);

  const handleUp = useCallback(
    (event: React.PointerEvent<HTMLElement>, tileId: string) => {
      const start = pointer.current;
      pointer.current = null;
      if (start === null || start.id !== event.pointerId || start.tileId !== tileId) return;
      const travelUp = start.y - event.clientY;
      const drift = Math.abs(start.x - event.clientX);
      if (settings.model === "flick" && travelUp >= FLICK_THRESHOLD && drift <= FLICK_DRIFT) {
        onFlick(tileId);
        return;
      }
      onTap(tileId);
    },
    [onFlick, onTap, settings.model],
  );

  const style = {
    "--tile-w": `${String(metrics.tileWidth)}px`,
    "--tile-h": `${String(metrics.tileHeight)}px`,
    "--tile-gap": `${String(settings.tileGap)}px`,
  } as CSSProperties;

  return (
    <div className={`hand${active ? " hand--active" : ""}`} style={style}>
      <div className="hand__row" ref={rowRef}>
        {hand.map((tile) => (
          <Tile
            key={tile.id}
            tile={tile}
            labels={settings.labels}
            interactive
            selected={selectedTileId === tile.id}
            detached={drawnTileId === tile.id}
            highlighted={settings.showDecisionTiles && decisionTileIds.has(tile.id)}
            onPointerDown={(event) => {
              handleDown(event, tile.id);
            }}
            onPointerUp={(event) => {
              handleUp(event, tile.id);
            }}
          />
        ))}
      </div>
      {metrics.overflows && (
        <p className="hand__overflow" role="status">
          hand does not fit at this size
        </p>
      )}
    </div>
  );
}

function useViewportHeight(): number {
  const [height, setHeight] = useState(() =>
    typeof window === "undefined" ? 800 : window.innerHeight,
  );
  useEffect(() => {
    const update = () => {
      setHeight(window.innerHeight);
    };
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return height;
}
