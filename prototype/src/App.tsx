import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { ClaimControls } from "./components/ClaimControls.tsx";
import { Hand } from "./components/Hand.tsx";
import { SettingsPanel } from "./components/SettingsPanel.tsx";
import { TableTop } from "./components/TableTop.tsx";
import { TopBar } from "./components/TopBar.tsx";
import {
  decisionTileIds,
  initialState,
  reduce,
  type InteractionEvent,
  type InteractionState,
} from "./model/interaction.ts";
import { SCENARIOS } from "./model/scenarios.ts";
import {
  DEFAULT_SETTINGS,
  MAX_HAND_TILES,
  type HandMetrics,
  type PrototypeSettings,
} from "./model/settings.ts";

export function App(): React.JSX.Element {
  const [settings, setSettings] = useState<PrototypeSettings>(DEFAULT_SETTINGS);
  const [state, dispatch] = useReducer(
    (current: InteractionState, event: InteractionEvent) => reduce(current, event, settings.model),
    undefined,
    () => initialState(0),
  );
  const [handMetrics, setHandMetrics] = useState<HandMetrics | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const portrait = usePortrait();

  const { table, selectedTileId, resolution } = state;
  // Portrait always uses the band layout: a right rail would cost a third of a
  // portrait screen, and the orientation comparison is only worth anything if
  // portrait is shown at its best.
  const placement = portrait ? "band" : settings.placement;
  const decisions = useMemo(() => decisionTileIds(table), [table]);
  const handActive = table.phase === "discard" && resolution === null;

  const onTap = useCallback((tileId: string) => {
    dispatch({ type: "tap-hand-tile", tileId, at: performance.now() });
  }, []);
  const onFlick = useCallback((tileId: string) => {
    dispatch({ type: "flick-hand-tile", tileId, at: performance.now() });
  }, []);

  return (
    <div className={`app app--${placement}${portrait ? " app--portrait" : ""}`}>
      <TopBar
        table={table}
        scenarioIndex={state.scenarioIndex}
        scenarioCount={SCENARIOS.length}
        handMetrics={handMetrics}
        onPrev={() => {
          dispatch({ type: "goto-scenario", index: state.scenarioIndex - 1 });
        }}
        onNext={() => {
          dispatch({ type: "goto-scenario", index: state.scenarioIndex + 1 });
        }}
        onMisfire={() => {
          dispatch({ type: "report-misfire" });
        }}
        onOpenSettings={() => {
          setSettingsOpen(true);
        }}
      />

      {portrait && (
        <p className="portrait-note" role="status">
          Portrait comparison, shown at its best: claim controls move above the hand so portrait
          keeps the full width. Turn the phone back to compare.
        </p>
      )}

      <main className="table">
        <div className="table__felt">
          <p className="probe">
            <strong>{table.title}.</strong> {table.probe}
          </p>
          <TableTop table={table} labels={settings.labels} />
        </div>
        <ClaimControls
          claims={table.claims}
          placement={placement}
          enabled={table.phase === "claim" && resolution === null}
          onClaim={(claimId) => {
            dispatch({ type: "claim", claimId });
          }}
          onPass={() => {
            dispatch({ type: "pass" });
          }}
        />
      </main>

      <footer className="handbar">
        <Hand
          hand={table.hand}
          sizingCount={MAX_HAND_TILES - table.melds.length * 3}
          drawnTileId={table.drawnTileId}
          selectedTileId={selectedTileId}
          decisionTileIds={decisions}
          settings={settings}
          active={handActive}
          onTap={onTap}
          onFlick={onFlick}
          onMeasured={setHandMetrics}
        />
        <p className="handbar__hint">{hint(state, settings)}</p>
      </footer>

      {resolution !== null && (
        <div className="resolution" role="status">
          <span>{describe(state)}</span>
          <button
            type="button"
            className="chip"
            onClick={() => {
              dispatch({ type: "replay-scenario" });
            }}
          >
            replay
          </button>
          <button
            type="button"
            className="chip chip--primary"
            onClick={() => {
              dispatch({ type: "goto-scenario", index: state.scenarioIndex + 1 });
            }}
          >
            next scenario ›
          </button>
        </div>
      )}

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          metrics={state.metrics}
          handMetrics={handMetrics}
          log={state.log}
          onChange={setSettings}
          onResetMetrics={() => {
            dispatch({ type: "reset-metrics" });
          }}
          onClose={() => {
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}

function hint(state: InteractionState, settings: PrototypeSettings): string {
  if (state.resolution !== null) return "decision recorded — replay or move on";
  switch (state.table.phase) {
    case "discard":
      if (settings.model === "flick") {
        return state.selectedTileId === null
          ? "flick a tile upwards to discard it"
          : "lifted — flick upwards to discard";
      }
      return state.selectedTileId === null
        ? "tap a tile to lift it"
        : "tap the lifted tile again to discard it";
    case "claim":
      return "your hand is locked while a claim is on offer";
    case "waiting":
      return "waiting for the other seats";
  }
}

function describe(state: InteractionState): string {
  const resolution = state.resolution;
  if (resolution === null) return "";
  switch (resolution.kind) {
    case "discard":
      return `Discarded ${resolution.label}.`;
    case "claim":
      return `Claimed ${resolution.claim.gloss}${
        resolution.claim.detail === null ? "" : ` — ${resolution.claim.detail}`
      }.`;
    case "pass":
      return "Passed.";
  }
}

function usePortrait(): boolean {
  const [portrait, setPortrait] = useState(
    () => typeof window !== "undefined" && window.innerHeight > window.innerWidth,
  );
  useEffect(() => {
    const update = () => {
      setPortrait(window.innerHeight > window.innerWidth);
    };
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return portrait;
}
