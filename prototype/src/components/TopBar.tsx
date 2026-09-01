import type { HandMetrics } from "../model/settings.ts";
import { SEAT_LABEL, type TableState } from "../model/table.ts";

export interface TopBarProps {
  readonly table: TableState;
  readonly scenarioIndex: number;
  readonly scenarioCount: number;
  readonly handMetrics: HandMetrics | null;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onMisfire: () => void;
  readonly onOpenSettings: () => void;
}

export function TopBar({
  table,
  scenarioIndex,
  scenarioCount,
  handMetrics,
  onPrev,
  onNext,
  onMisfire,
  onOpenSettings,
}: TopBarProps): React.JSX.Element {
  return (
    <header className={`topbar topbar--${table.phase}`}>
      <div className="topbar__nav">
        <button type="button" className="chip" onClick={onPrev} aria-label="Previous scenario">
          ‹
        </button>
        <span className="chip chip--count">
          {scenarioIndex + 1}/{scenarioCount}
        </span>
        <button type="button" className="chip" onClick={onNext} aria-label="Next scenario">
          ›
        </button>
      </div>

      <p className="topbar__turn">{turnLine(table)}</p>

      <div className="topbar__meta">
        <span className="topbar__stat">
          {table.roundWind} round · {table.seatWind} seat · wall {table.wallRemaining}
        </span>
        {handMetrics !== null && (
          <span className={`topbar__stat${handMetrics.overflows ? " is-bad" : ""}`}>
            {table.hand.length} tiles · {handMetrics.tileWidth}px ≈ {handMetrics.approxMillimetres}mm
          </span>
        )}
      </div>

      <div className="topbar__actions">
        <button type="button" className="chip chip--warn" onClick={onMisfire}>
          ⚠ misfire
        </button>
        <button type="button" className="chip" onClick={onOpenSettings} aria-label="Open settings">
          ⚙
        </button>
      </div>
    </header>
  );
}

function turnLine(table: TableState): string {
  switch (table.phase) {
    case "discard":
      return "YOUR TURN — discard";
    case "claim":
      return `${SEAT_LABEL[table.turn]} discarded — claim or pass`;
    case "waiting":
      return `${SEAT_LABEL[table.turn]} to play — not your turn`;
  }
}
