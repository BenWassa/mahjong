import { useCallback, useEffect, useState, type JSX } from "react";

import { ExperienceChoice } from "./components/ExperienceChoice";
import { MenuSheet, nextCornerLabel } from "./components/MenuSheet";
import { RotateNotice } from "./components/RotateNotice";
import { RulesReference } from "./components/RulesReference";
import { StatsView } from "./components/StatsView";
import { TableView } from "./components/TableView";
import {
  EXPERIENCE_DEFAULTS,
  type ExperiencePath,
  type OnboardingPath,
} from "./game/experience";
import { useLearningProgress } from "./game/explain";
import { reducePlayerActions } from "./game/interaction";
import { MODE_RULES, type TableMode } from "./game/modes";
import { loadSettings, loadTutorial, saveSettings, saveTutorial } from "./game/persistence";
import { openingFor, parseLaunchQuery } from "./game/routing";
import { newMatchSeed } from "./game/seed";
import { useGameSession, type ActionReducer } from "./game/useGameSession";
import { useIsLandscape } from "./game/useOrientation";
import type { CornerLabelMode } from "./tiles/Tile";
import { isLessonId, type LessonId } from "./tutorial/ids";
import { Learn } from "./tutorial/Learn";
import { Onboarding } from "./tutorial/Onboarding";

/**
 * The app's surfaces, and the rule that chooses between them (#33).
 *
 * `ONBOARDING_DESIGN.md` §4.2 replaces this app's old navigation model. It
 * used to be the phone's orientation: landscape was the table, portrait was
 * the menu, settings, Learn, rules and stats. That is an unusual thing for a
 * game to do and nothing announces it — a player holding a live table had no
 * visible route to the rest of the product, and rotating the hardware changed
 * not just the layout but the entire information architecture.
 *
 * The new rule is one line:
 *
 *   > screen state chooses the surface; orientation only affects how that
 *   > surface lays out.
 *
 * So a `Surface` below is chosen by what the player pressed. Landscape remains
 * the table's orientation — fourteen readable tiles is a hard constraint and
 * #33 does not reopen it — but portrait no longer navigates: it holds the
 * table's state and asks for the phone back (`RotateNotice`), while the
 * secondary surfaces lay out in either orientation because landscape is the
 * grip the player is already in.
 */
type Surface = "table" | "rules" | "stats" | "learn";

function initialSeed(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("seed") ?? newMatchSeed();
}

/**
 * `?learn=<lesson id>` opens one replayable lesson directly; the rest of the
 * launch query is read by `game/routing.ts`.
 *
 * These exist for the same reason `?mode=` does: the rendered QA sweep, the
 * accessibility check and a human tester need to reach a surface a fresh
 * browser profile otherwise only reaches through several taps. None of them is
 * ever written to storage, so a link cannot reconfigure a real player's app.
 */
function urlLesson(): LessonId | null {
  const value = new URLSearchParams(window.location.search).get("learn");
  return isLessonId(value) ? value : null;
}

export function App(): JSX.Element {
  const [start] = useState(() =>
    openingFor(loadSettings(), loadTutorial(), parseLaunchQuery(window.location.search)),
  );

  const [experience, setExperience] = useState<ExperiencePath | null>(start.experience);
  const [onboarding, setOnboarding] = useState<OnboardingPath | null>(start.onboarding);
  const [mode, setMode] = useState<TableMode>(start.mode);
  const [cornerLabel, setCornerLabel] = useState<CornerLabelMode>(start.cornerLabel);
  const [assistOn, setAssistOn] = useState(start.assistOn);
  const [explainOn, setExplainOn] = useState(start.explainOn);
  const [showAllClaims, setShowAllClaims] = useState(start.showAllClaims);

  const [learnEntry] = useState(urlLesson);
  const [surface, setSurface] = useState<Surface>(start.learn ? "learn" : "table");
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * True for the hand immediately after a walkthrough or the lessons. It only
   * raises the guidance the table already has; it never changes a rule, and
   * the player still makes every decision.
   */
  const [guided, setGuided] = useState(false);
  /**
   * Switching table later. Beginner sets the learning aids on and reduces the
   * claim band; it does not lock any of them, because DESIGN.md §21 carries
   * "all three learning aids disable independently" as an exit criterion and
   * PRD §9 makes it a constraint.
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

  /**
   * Answering the first-launch question (#33).
   *
   * One tap settles the table, the claim band and every aid, because §3.2
   * asks for smart defaults rather than a setup step: a novice never chooses a
   * rules profile, and a player who said they do not want instruction does not
   * get a table that suggests their discards. From here on the player owns all
   * of it from the menu and the path never overrides them again.
   */
  const chooseExperience = useCallback((path: ExperiencePath) => {
    const preset = EXPERIENCE_DEFAULTS[path];
    setExperience(path);
    setMode(preset.mode);
    setShowAllClaims(preset.showAllClaims);
    setAssistOn(preset.assistOn);
    setExplainOn(preset.explainOn);
    setCornerLabel(preset.cornerLabel);
    setOnboarding(preset.onboarding);
    setSurface("table");
    if (preset.onboarding === null) {
      // Nothing to resume later: this player answered by declining teaching.
      const stored = loadTutorial();
      saveTutorial({ ...stored, onboarding: null, onboardingDone: true });
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
      version: 3,
      cornerLabel,
      assistOn,
      explainOn,
      experience,
      mode,
      showAllClaims,
    });
  }, [cornerLabel, assistOn, explainOn, experience, mode, showAllClaims]);

  /**
   * The end of a walkthrough, by finishing it or by skipping it.
   *
   * §6 N5: no graduation screen and no rules-profile question. The table the
   * entry choice already settled is dealt straight away, with the scaffolding
   * a first real hand keeps — which is the whole of what "hands directly into
   * unscripted play" means.
   */
  const finishOnboarding = useCallback((completed: boolean) => {
    setOnboarding(null);
    setGuided(completed);
    setSurface("table");
  }, []);

  if (experience === null) {
    return <ExperienceChoice onChoose={chooseExperience} />;
  }

  return (
    <Shell
      onboarding={onboarding}
      surface={surface}
      menuOpen={menuOpen}
      mode={mode}
      cornerLabel={cornerLabel}
      assistOn={assistOn}
      explainOn={explainOn}
      showAllClaims={showAllClaims}
      guided={guided}
      learnEntry={learnEntry}
      onOpenMenu={() => { setMenuOpen(true); }}
      onCloseMenu={() => { setMenuOpen(false); }}
      onSurface={setSurface}
      onFinishOnboarding={finishOnboarding}
      onGuidedHandEnded={() => { setGuided(false); }}
      onLeaveLearning={() => { setSurface("table"); }}
      onChooseMode={chooseMode}
      onCycleLabel={() => { setCornerLabel(nextCornerLabel); }}
      onToggleAssist={() => { setAssistOn((current) => !current); }}
      onToggleExplain={() => { setExplainOn((current) => !current); }}
      onToggleAllClaims={() => { setShowAllClaims((current) => !current); }}
      onLearnFromMenu={() => {
        setSurface("learn");
        setMenuOpen(false);
      }}
    />
  );
}

/**
 * The app once the experience question is settled: the session, the surfaces,
 * and the menu that reaches all of them.
 *
 * Split out from App so the game session is constructed only after the answer
 * is known. Building it first would deal the opening hand under a default
 * profile and then persist it, and the player's answer would arrive too late
 * to matter.
 */
function Shell({
  onboarding,
  surface,
  menuOpen,
  mode,
  cornerLabel,
  assistOn,
  explainOn,
  showAllClaims,
  guided,
  learnEntry,
  onOpenMenu,
  onCloseMenu,
  onSurface,
  onFinishOnboarding,
  onGuidedHandEnded,
  onLeaveLearning,
  onChooseMode,
  onCycleLabel,
  onToggleAssist,
  onToggleExplain,
  onToggleAllClaims,
  onLearnFromMenu,
}: {
  readonly onboarding: OnboardingPath | null;
  readonly surface: Surface;
  readonly menuOpen: boolean;
  readonly mode: TableMode;
  readonly cornerLabel: CornerLabelMode;
  readonly assistOn: boolean;
  readonly explainOn: boolean;
  readonly showAllClaims: boolean;
  readonly guided: boolean;
  readonly learnEntry: LessonId | null;
  readonly onOpenMenu: () => void;
  readonly onCloseMenu: () => void;
  readonly onSurface: (surface: Surface) => void;
  readonly onFinishOnboarding: (completed: boolean) => void;
  readonly onGuidedHandEnded: () => void;
  readonly onLeaveLearning: () => void;
  readonly onChooseMode: (mode: TableMode) => void;
  readonly onCycleLabel: () => void;
  readonly onToggleAssist: () => void;
  readonly onToggleExplain: () => void;
  readonly onToggleAllClaims: () => void;
  readonly onLearnFromMenu: () => void;
}): JSX.Element {
  const landscape = useIsLandscape();
  const [seed] = useState(initialSeed);

  const reduceActions = useCallback<ActionReducer>(
    (actions) => reducePlayerActions(actions, showAllClaims),
    [showAllClaims],
  );
  // The guided hand is paced for reading rather than for play. It is the only
  // thing the flag changes about the engine loop: no rule moves, and no
  // decision is taken away.
  const session = useGameSession(seed, MODE_RULES[mode], reduceActions, guided ? 1.7 : 1);
  const learning = useLearningProgress();

  const menu = menuOpen ? (
    <MenuSheet
      mode={mode}
      cornerLabel={cornerLabel}
      assistOn={assistOn}
      explainOn={explainOn}
      showAllClaims={showAllClaims}
      onClose={onCloseMenu}
      onChooseMode={onChooseMode}
      onCycleLabel={onCycleLabel}
      onToggleAssist={onToggleAssist}
      onToggleExplain={onToggleExplain}
      onToggleAllClaims={onToggleAllClaims}
      onRestart={() => { session.restart(newMatchSeed()); onCloseMenu(); }}
      onLearn={onLearnFromMenu}
      onRules={() => { onSurface("rules"); onCloseMenu(); }}
      onStats={() => { onSurface("stats"); onCloseMenu(); }}
    />
  ) : null;

  /*
   * The secondary surfaces lay out in either orientation and are reached by a
   * press rather than by a rotation (§4.2). Rotating while one of them is open
   * keeps it open, which is the other half of the same promise: orientation
   * must not silently navigate away from the surface the player is on.
   */
  if (surface === "rules") {
    return (
      <>
        <RulesReference onClose={() => { onSurface("table"); }} />
        {menu}
      </>
    );
  }

  if (surface === "stats") {
    return (
      <>
        <StatsView onClose={() => { onSurface("table"); }} />
        {menu}
      </>
    );
  }

  if (surface === "learn") {
    return (
      <>
        <Learn cornerLabel={cornerLabel} openAt={learnEntry} onLeave={onLeaveLearning} />
        {menu}
      </>
    );
  }

  /*
   * Portrait, while a table or a walkthrough is live.
   *
   * Only the render swaps: the session lives here in `Shell`, so the match,
   * the hand and any pending claim are all still mounted behind this and
   * rotating back returns the exact position. That is the difference between a
   * holding state and navigation, and it is the whole of what §4.2 asks for.
   *
   * The walkthrough is deliberately *not* swapped out here. Its engine state
   * lives inside `Onboarding`, so rendering a notice in its place would
   * unmount the runner and silently restart the phase — while the notice said
   * nothing had moved. It stays mounted and draws its own portrait state.
   */
  if (onboarding !== null) {
    return (
      <>
        <Onboarding
          path={onboarding}
          cornerLabel={cornerLabel}
          landscape={landscape}
          onFinish={onFinishOnboarding}
          onMenu={onOpenMenu}
        />
        {menu}
      </>
    );
  }

  if (!landscape) {
    return (
      <>
        <RotateNotice onMenu={onOpenMenu} beginner={mode === "beginner"} />
        {menu}
      </>
    );
  }

  return (
    <>
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
        onMenu={onOpenMenu}
      />
      {menu}
    </>
  );
}
