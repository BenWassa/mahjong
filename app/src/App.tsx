import { useCallback, useEffect, useState, type JSX } from "react";

import { ModeChoice } from "./components/ModeChoice";
import { RulesReference } from "./components/RulesReference";
import { StatsView } from "./components/StatsView";
import { TableView } from "./components/TableView";
import { useLearningProgress } from "./game/explain";
import { reducePlayerActions } from "./game/interaction";
import { isTableMode, MODE_RULES, type TableMode } from "./game/modes";
import { loadSettings, saveSettings, type PersistedSettings } from "./game/persistence";
import { newMatchSeed } from "./game/seed";
import { useGameSession, type ActionReducer } from "./game/useGameSession";
import type { CornerLabelMode } from "./tiles/Tile";

/**
 * Orientation is a screen-level property (PRD §7). The table is landscape
 * because fourteen tiles have to be simultaneously readable; the menu is the
 * portrait surface. Neither orientation is forced: the app responds to the one
 * the phone is in, and says plainly what the other one is for.
 */
function useIsLandscape(): boolean {
  const [landscape, setLandscape] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= window.innerHeight,
  );
  useEffect(() => {
    const update = (): void => { setLandscape(window.innerWidth >= window.innerHeight); };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return landscape;
}

const LABEL_MODES: readonly CornerLabelMode[] = ["off", "rank", "rank-suit"];
const LABEL_NAME: Record<CornerLabelMode, string> = {
  off: "Off",
  rank: "Rank",
  "rank-suit": "Rank and suit",
};

function initialSeed(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("seed") ?? newMatchSeed();
}

/**
 * `?mode=beginner|standard`, alongside the existing `?seed=`.
 *
 * It selects the starting mode and counts as an answer to the first-launch
 * question, which is what lets the rendered QA sweep and the accessibility
 * check reach the table at all on a fresh browser profile. It is deliberately
 * never written to storage: a link cannot silently reconfigure a real
 * player's app.
 */
function urlMode(): TableMode | null {
  const value = new URLSearchParams(window.location.search).get("mode");
  return isTableMode(value) ? value : null;
}

/**
 * The mode and claim band to open on.
 *
 * A stored answer wins. Failing that, `?mode=` stands in for the tap the
 * player never made — and it has to stand in for the whole of it, including
 * the reduced claim band, or a link would produce a "beginner" table that
 * still offers Chow and Kong. Only when neither exists is the question asked.
 */
function initialMode(settings: PersistedSettings): {
  mode: TableMode | null;
  showAllClaims: boolean;
} {
  if (settings.mode !== null) {
    return { mode: settings.mode, showAllClaims: settings.showAllClaims };
  }
  const fromUrl = urlMode();
  if (fromUrl !== null) {
    return { mode: fromUrl, showAllClaims: fromUrl === "standard" };
  }
  return { mode: null, showAllClaims: settings.showAllClaims };
}

/**
 * Three independent learning controls (#9), all default on for the initial
 * learning period and each toggled from the portrait menu, which is already
 * this app's settings surface (§ below). None of them is ever required to
 * make a legal move.
 *
 * Their state, and the corner-label mode, persist locally (#10) so a toggle
 * survives a reload; they are read once from storage at startup and written
 * back whenever any of them changes.
 */
export function App(): JSX.Element {
  const [settings] = useState(loadSettings);
  const [opening] = useState(() => initialMode(settings));
  const [mode, setMode] = useState<TableMode | null>(opening.mode);
  const [cornerLabel, setCornerLabel] = useState<CornerLabelMode>(settings.cornerLabel);
  const [assistOn, setAssistOn] = useState(settings.assistOn);
  const [explainOn, setExplainOn] = useState(settings.explainOn);
  const [showAllClaims, setShowAllClaims] = useState(opening.showAllClaims);

  /**
   * Answering the first-launch question, and switching mode later, are the
   * same operation. Beginner sets the learning aids on and reduces the claim
   * band; it does not lock any of them, because DESIGN.md §21 carries "all
   * three learning aids disable independently" as an exit criterion and PRD §9
   * makes it a constraint. Setting them gives the requirement its actual
   * value — nobody plays their first hand with the aids off by accident —
   * without breaking either document.
   */
  const chooseMode = useCallback((next: TableMode) => {
    const beginner = next === "beginner";
    setMode(next);
    setShowAllClaims(!beginner);
    if (beginner) {
      setAssistOn(true);
      setExplainOn(true);
      setCornerLabel((current) => (current === "off" ? "rank" : current));
    }
  }, []);

  // Written on every change, including the one that answers the first-launch
  // question — the answer must survive a kill immediately after the tap.
  //
  // Spelled out field by field rather than spread over DEFAULT_SETTINGS: with
  // a spread, a field added to PersistedSettings later would silently reset to
  // its default here instead of failing to compile.
  useEffect(() => {
    saveSettings({
      version: 2,
      cornerLabel,
      assistOn,
      explainOn,
      mode,
      showAllClaims,
    });
  }, [cornerLabel, assistOn, explainOn, mode, showAllClaims]);

  if (mode === null) {
    return <ModeChoice onChoose={chooseMode} />;
  }

  return (
    <Game
      mode={mode}
      cornerLabel={cornerLabel}
      assistOn={assistOn}
      explainOn={explainOn}
      showAllClaims={showAllClaims}
      onChooseMode={chooseMode}
      onCycleLabel={() => {
        setCornerLabel((current) => {
          const next = LABEL_MODES[(LABEL_MODES.indexOf(current) + 1) % LABEL_MODES.length];
          return next ?? "off";
        });
      }}
      onToggleAssist={() => { setAssistOn((current) => !current); }}
      onToggleExplain={() => { setExplainOn((current) => !current); }}
      onToggleAllClaims={() => { setShowAllClaims((current) => !current); }}
    />
  );
}

/**
 * The app once a mode is settled: the table, the portrait menu, and the two
 * full-screen panels.
 *
 * Split out from App so the game session is constructed only after the mode
 * is known. Building it first would deal the opening hand under a default
 * profile and then persist it, and the player's answer would arrive too late
 * to matter.
 */
function Game({
  mode,
  cornerLabel,
  assistOn,
  explainOn,
  showAllClaims,
  onChooseMode,
  onCycleLabel,
  onToggleAssist,
  onToggleExplain,
  onToggleAllClaims,
}: {
  readonly mode: TableMode;
  readonly cornerLabel: CornerLabelMode;
  readonly assistOn: boolean;
  readonly explainOn: boolean;
  readonly showAllClaims: boolean;
  readonly onChooseMode: (mode: TableMode) => void;
  readonly onCycleLabel: () => void;
  readonly onToggleAssist: () => void;
  readonly onToggleExplain: () => void;
  readonly onToggleAllClaims: () => void;
}): JSX.Element {
  const landscape = useIsLandscape();
  const [seed] = useState(initialSeed);
  const [showRules, setShowRules] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const reduceActions = useCallback<ActionReducer>(
    (actions) => reducePlayerActions(actions, showAllClaims),
    [showAllClaims],
  );
  const session = useGameSession(seed, MODE_RULES[mode], reduceActions);
  const learning = useLearningProgress();

  if (showRules) {
    return <RulesReference onClose={() => { setShowRules(false); }} />;
  }

  if (showStats) {
    return <StatsView onClose={() => { setShowStats(false); }} />;
  }

  if (!landscape) {
    return (
      <div className="portrait" data-beginner={mode === "beginner"}>
        <h1 className="portrait__title">
          <span className="portrait__han" aria-hidden="true">麻雀</span>
          Mahjong
        </h1>
        <p className="portrait__note">Hong Kong Old Style</p>

        <p className="portrait__prompt">
          Turn the phone sideways to play. Fourteen tiles have to be readable at
          once, and portrait cannot seat them at a size worth reading.
        </p>

        <div className="portrait__settings">
          <div className="portrait__setting">
            <span id="table-mode">Table</span>
            <button
              type="button"
              className="portrait__toggle"
              aria-describedby="table-mode"
              onClick={() => { onChooseMode(mode === "beginner" ? "standard" : "beginner"); }}
            >
              {mode === "beginner" ? "Beginner" : "Standard"}
            </button>
          </div>

          {mode === "beginner" && (
            <div className="portrait__setting">
              <span id="claims-mode">Chow and Kong</span>
              <button
                type="button"
                className="portrait__toggle"
                aria-describedby="claims-mode"
                aria-pressed={showAllClaims}
                onClick={onToggleAllClaims}
              >
                {showAllClaims ? "Shown" : "Hidden"}
              </button>
            </div>
          )}

          <div className="portrait__setting">
            <span id="new-match">New match</span>
            <button
              type="button"
              className="portrait__toggle"
              aria-describedby="new-match"
              onClick={() => { session.restart(newMatchSeed()); }}
            >
              Restart
            </button>
          </div>

          <div className="portrait__setting">
            <span id="assist-mode">Assist</span>
            <button
              type="button"
              className="portrait__toggle"
              aria-describedby="assist-mode"
              aria-pressed={assistOn}
              onClick={onToggleAssist}
            >
              {assistOn ? "On" : "Off"}
            </button>
          </div>

          <div className="portrait__setting">
            <span id="explain-mode">Explain</span>
            <button
              type="button"
              className="portrait__toggle"
              aria-describedby="explain-mode"
              aria-pressed={explainOn}
              onClick={onToggleExplain}
            >
              {explainOn ? "On" : "Off"}
            </button>
          </div>

          <div className="portrait__setting">
            <span id="label-mode">Corner labels</span>
            <button
              type="button"
              className="portrait__toggle"
              aria-describedby="label-mode"
              onClick={onCycleLabel}
            >
              {LABEL_NAME[cornerLabel]}
            </button>
          </div>

          <div className="portrait__setting">
            <span id="rules-link">Full rules</span>
            <button
              type="button"
              className="portrait__toggle"
              aria-describedby="rules-link"
              onClick={() => { setShowRules(true); }}
            >
              Reference
            </button>
          </div>

          <div className="portrait__setting">
            <span id="stats-link">Stats</span>
            <button
              type="button"
              className="portrait__toggle"
              aria-describedby="stats-link"
              onClick={() => { setShowStats(true); }}
            >
              View
            </button>
          </div>
        </div>
        <p className="portrait__hint">
          Changing the table changes the rules for your next match, not the one
          you are in — Restart deals a new one straight away. Assist highlights
          legal actions and can suggest a discard. Explain shows a short note
          the first time a rule matters. Corner labels are a learning layer
          over the traditional face. None is ever required to make a legal move.
        </p>
      </div>
    );
  }

  return (
    <TableView
      session={session}
      cornerLabel={cornerLabel}
      matchSeed={seed}
      assistOn={assistOn}
      explainOn={explainOn}
      learning={learning}
      mode={mode}
      claimsReduced={!showAllClaims}
    />
  );
}
