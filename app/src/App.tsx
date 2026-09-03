import { useCallback, useEffect, useState, type JSX } from "react";

import { ExperienceChoice } from "./components/ExperienceChoice";
import { MenuSheet, nextCornerLabel } from "./components/MenuSheet";
import { RotateNotice } from "./components/RotateNotice";
import { RulesReference } from "./components/RulesReference";
import { StatsView } from "./components/StatsView";
import { TableView } from "./components/TableView";
import {
  EXPERIENCE_DEFAULTS,
  isExperiencePath,
  type ExperiencePath,
  type OnboardingPath,
} from "./game/experience";
import { useLearningProgress } from "./game/explain";
import { reducePlayerActions } from "./game/interaction";
import { isTableMode, MODE_RULES, type TableMode } from "./game/modes";
import {
  loadSettings,
  loadTutorial,
  saveSettings,
  saveTutorial,
  type PersistedSettings,
} from "./game/persistence";
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
 * `?learn=1` opens the replayable lesson menu on load; `?learn=<lesson id>`
 * opens that lesson directly.
 *
 * It exists for the same reason `?mode=` does: the rendered QA sweep and the
 * accessibility check need to reach a surface a fresh browser profile
 * otherwise only reaches through several taps. Like `?mode=`, it is never
 * written to storage, so a link cannot reconfigure a real player's app.
 */
function urlLearn(): { open: boolean; lesson: LessonId | null } {
  const value = new URLSearchParams(window.location.search).get("learn");
  if (value === null) return { open: false, lesson: null };
  if (isLessonId(value)) return { open: true, lesson: value };
  return { open: value === "1", lesson: null };
}

function urlMode(): TableMode | null {
  const value = new URLSearchParams(window.location.search).get("mode");
  return isTableMode(value) ? value : null;
}

/**
 * `?experience=new|rusty|confident`, alongside `?mode=` and `?seed=`.
 *
 * Answers the first-launch question the way a tap would, including routing
 * into the walkthrough — which is what lets the QA sweep, the accessibility
 * check and a human tester reach a first-run path on demand instead of having
 * to clear local storage between attempts. Like `?mode=`, it is never written
 * to storage: a link can open a path, it cannot reconfigure somebody's app.
 */
function urlExperience(): ExperiencePath | null {
  const value = new URLSearchParams(window.location.search).get("experience");
  return isExperiencePath(value) ? value : null;
}

interface Opening {
  readonly experience: ExperiencePath | null;
  readonly mode: TableMode;
  readonly showAllClaims: boolean;
  readonly cornerLabel: CornerLabelMode;
  readonly assistOn: boolean;
  readonly explainOn: boolean;
  /** The walkthrough to open on, or null to go straight to a table. */
  readonly onboarding: OnboardingPath | null;
}

/**
 * What to open on.
 *
 * A stored answer wins, and a stored answer means the question is not asked
 * again — an existing player must never be dropped into a walkthrough because
 * a new version arrived. Failing that, `?experience=` and then `?mode=` stand
 * in for the tap that was never made. Only when none of those exists is the
 * question put.
 */
function opening(settings: PersistedSettings): Opening {
  const stored = {
    mode: settings.mode,
    showAllClaims: settings.showAllClaims,
    cornerLabel: settings.cornerLabel,
    assistOn: settings.assistOn,
    explainOn: settings.explainOn,
  };

  if (settings.experience !== null) {
    // §3.3: a walkthrough resumes only while one is genuinely in progress.
    // Once it has been finished or skipped, the entry path is spent and the
    // replayable lessons are the way back to teaching material.
    const progress = loadTutorial();
    const resuming =
      progress.onboarding !== null && !progress.onboardingDone
        ? progress.onboarding.path
        : null;
    return { experience: settings.experience, ...stored, onboarding: resuming };
  }

  const fromUrl = urlExperience();
  if (fromUrl !== null) {
    return { experience: fromUrl, ...defaultsFor(fromUrl) };
  }

  const modeFromUrl = urlMode();
  if (modeFromUrl !== null) {
    // A `?mode=` link is somebody who has said which table they want, which is
    // the confident path with the table overridden. It has to stand in for the
    // whole of the tap, claim band included, or the link would produce a
    // "beginner" table that still offered Chow and Kong.
    return {
      experience: "confident",
      ...stored,
      mode: modeFromUrl,
      showAllClaims: modeFromUrl === "standard",
      onboarding: null,
    };
  }

  // `?learn=` stands in for reaching the replayable lessons, which needs a
  // table behind it but is not an answer to the experience question.
  if (urlLearn().open) {
    return { experience: "confident", ...stored, mode: "beginner", showAllClaims: false, onboarding: null };
  }

  return { experience: null, ...stored, onboarding: null };
}

function defaultsFor(path: ExperiencePath): Omit<Opening, "experience"> {
  const preset = EXPERIENCE_DEFAULTS[path];
  return {
    mode: preset.mode,
    showAllClaims: preset.showAllClaims,
    cornerLabel: preset.cornerLabel,
    assistOn: preset.assistOn,
    explainOn: preset.explainOn,
    onboarding: preset.onboarding,
  };
}

export function App(): JSX.Element {
  const [settings] = useState(loadSettings);
  const [start] = useState(() => opening(settings));

  const [experience, setExperience] = useState<ExperiencePath | null>(start.experience);
  const [onboarding, setOnboarding] = useState<OnboardingPath | null>(start.onboarding);
  const [mode, setMode] = useState<TableMode>(start.mode);
  const [cornerLabel, setCornerLabel] = useState<CornerLabelMode>(start.cornerLabel);
  const [assistOn, setAssistOn] = useState(start.assistOn);
  const [explainOn, setExplainOn] = useState(start.explainOn);
  const [showAllClaims, setShowAllClaims] = useState(start.showAllClaims);

  const [learnEntry] = useState(urlLearn);
  const [surface, setSurface] = useState<Surface>(learnEntry.open ? "learn" : "table");
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * True for the hand immediately after a walkthrough or the lessons. It only
   * raises the guidance the table already has; it never changes a rule, and
   * the player still makes every decision.
   */
  const [guided, setGuided] = useState(false);
  /** Whether the lessons were opened by the first-launch question. */
  const [learnFirstRun, setLearnFirstRun] = useState(false);

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

  const leaveLearning = useCallback(
    (next: TableMode | null, wasGuided: boolean) => {
      if (next !== null) chooseMode(next);
      if (wasGuided) {
        setAssistOn(true);
        setExplainOn(true);
      }
      setGuided(wasGuided);
      setSurface("table");
    },
    [chooseMode],
  );

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
      learnEntry={learnEntry.lesson}
      learnFirstRun={learnFirstRun}
      onOpenMenu={() => { setMenuOpen(true); }}
      onCloseMenu={() => { setMenuOpen(false); }}
      onSurface={setSurface}
      onFinishOnboarding={finishOnboarding}
      onGuidedHandEnded={() => { setGuided(false); }}
      onLeaveLearning={leaveLearning}
      onChooseMode={chooseMode}
      onCycleLabel={() => { setCornerLabel(nextCornerLabel); }}
      onToggleAssist={() => { setAssistOn((current) => !current); }}
      onToggleExplain={() => { setExplainOn((current) => !current); }}
      onToggleAllClaims={() => { setShowAllClaims((current) => !current); }}
      onLearnFromMenu={() => {
        setLearnFirstRun(false);
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
  learnFirstRun,
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
  readonly learnFirstRun: boolean;
  readonly onOpenMenu: () => void;
  readonly onCloseMenu: () => void;
  readonly onSurface: (surface: Surface) => void;
  readonly onFinishOnboarding: (completed: boolean) => void;
  readonly onGuidedHandEnded: () => void;
  readonly onLeaveLearning: (mode: TableMode | null, guided: boolean) => void;
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
        <Learn
          cornerLabel={cornerLabel}
          openAt={learnEntry}
          firstRun={learnFirstRun}
          onLeave={() => { onLeaveLearning(null, false); }}
          onGraduate={(next) => { onLeaveLearning(next, true); }}
        />
        {menu}
      </>
    );
  }

  /*
   * Portrait, while a table or a walkthrough is live.
   *
   * Only the render swaps: the session, the hand, any pending claim and the
   * walkthrough's phase are all still mounted behind this, so rotating back
   * returns the exact position that was there. That is the difference between
   * a holding state and navigation, and it is the whole of what §4.2 asks for.
   */
  if (!landscape) {
    return (
      <>
        <RotateNotice
          onMenu={onOpenMenu}
          beginner={mode === "beginner"}
          teaching={onboarding !== null}
        />
        {menu}
      </>
    );
  }

  if (onboarding !== null) {
    return (
      <>
        <Onboarding
          path={onboarding}
          cornerLabel={cornerLabel}
          onFinish={onFinishOnboarding}
          onMenu={onOpenMenu}
        />
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
