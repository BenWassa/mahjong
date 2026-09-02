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
import { isLessonId, type LessonId } from "./tutorial/ids";
import { Learn } from "./tutorial/Learn";

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
 * `?learn=1` opens the Learn to Play menu on load; `?learn=<lesson id>` opens
 * that lesson directly.
 *
 * It exists for the same reason `?mode=` does: the rendered QA sweep and the
 * accessibility check need to reach a surface that a fresh browser profile
 * otherwise only reaches through several taps. Like `?mode=`, it is never
 * written to storage, so a link cannot reconfigure a real player's app.
 */
function urlLearn(): { open: boolean; lesson: LessonId | null } {
  const value = new URLSearchParams(window.location.search).get("learn");
  if (value === null) return { open: false, lesson: null };
  if (isLessonId(value)) return { open: true, lesson: value };
  return { open: value === "1", lesson: null };
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
  // `?learn=` stands in for the tap on Learn to Play, which answers the
  // question the same way that tap does — see `startLearning`.
  if (urlLearn().open) {
    return { mode: "beginner", showAllClaims: false };
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
   * Learn to Play (#30). It is a surface, not a mode: the table's own state is
   * untouched while it is up, and leaving it — at any point, from any lesson —
   * lands on exactly the table that was there before. `learnEntry` is read
   * once, so a URL cannot reopen the lessons after the player has left them.
   */
  const [learnEntry] = useState(urlLearn);
  const [learnOpen, setLearnOpen] = useState(learnEntry.open);
  /**
   * True for the hand immediately after finishing the lessons. It only raises
   * the guidance the table already has; it never changes a rule, and the
   * player still makes every decision.
   */
  const [guided, setGuided] = useState(false);
  /** Whether the lessons were opened by the first-launch question. */
  const [learnFirstRun, setLearnFirstRun] = useState(true);

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

  /**
   * Opening Learn to Play from the first-launch question.
   *
   * It answers the question as well as opening the lessons — the player has
   * said they are new, which is the whole of what Beginner is for — so a kill
   * mid-lesson lands them on a table they can learn at rather than back on the
   * question. The graduation screen asks again once they have finished, when
   * the answer means something to them.
   */
  const startLearning = useCallback(() => {
    chooseMode("beginner");
    setLearnFirstRun(true);
    setLearnOpen(true);
  }, [chooseMode]);

  /** Leaving the lessons for a table, with or without having finished them. */
  const leaveLearning = useCallback(
    (next: TableMode | null, wasGuided: boolean) => {
      if (next !== null) chooseMode(next);
      if (wasGuided) {
        // Somebody arriving from the lessons gets the learning aids on
        // whichever table they picked. `chooseMode` only does this for
        // Beginner, and a player who has just been taught the game on the
        // standard rules has earned the same help.
        setAssistOn(true);
        setExplainOn(true);
      }
      setGuided(wasGuided);
      setLearnOpen(false);
    },
    [chooseMode],
  );

  if (mode === null) {
    return <ModeChoice onChoose={chooseMode} onLearn={startLearning} />;
  }

  if (learnOpen) {
    return (
      <Learn
        cornerLabel={cornerLabel}
        openAt={learnEntry.lesson}
        firstRun={learnFirstRun}
        onLeave={() => { leaveLearning(null, false); }}
        onGraduate={(next) => { leaveLearning(next, true); }}
      />
    );
  }

  return (
    <Game
      mode={mode}
      cornerLabel={cornerLabel}
      assistOn={assistOn}
      explainOn={explainOn}
      showAllClaims={showAllClaims}
      guided={guided}
      onGuidedHandEnded={() => { setGuided(false); }}
      onLearn={() => { setLearnFirstRun(false); setLearnOpen(true); }}
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
  guided,
  onGuidedHandEnded,
  onLearn,
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
  /** The guided first hand, straight out of Learn to Play (#30). */
  readonly guided: boolean;
  readonly onGuidedHandEnded: () => void;
  readonly onLearn: () => void;
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
  // The guided hand is paced for reading rather than for play. It is the only
  // thing the flag changes about the engine loop: no rule moves, and no
  // decision is taken away.
  const session = useGameSession(seed, MODE_RULES[mode], reduceActions, guided ? 1.7 : 1);
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
            <span id="learn-link">Learn to play</span>
            <button
              type="button"
              className="portrait__toggle"
              aria-describedby="learn-link"
              onClick={onLearn}
            >
              Lessons
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
          The lessons can be replayed as often as you like and never affect the
          match you are in.
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
      guided={guided}
      onGuidedHandEnded={onGuidedHandEnded}
    />
  );
}
