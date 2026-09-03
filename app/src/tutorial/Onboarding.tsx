import { useCallback, useEffect, useState, type JSX } from "react";

import { RotateNotice } from "../components/RotateNotice";
import type { OnboardingPath } from "../game/experience";
import { loadTutorial, saveTutorial } from "../game/persistence";
import type { CornerLabelMode } from "../tiles/Tile";
import { phasesFor, resumeIndex, type OnboardingPhase } from "./onboarding";
import { OnboardingView } from "./OnboardingView";
import { useTutorialRunner } from "./useTutorial";

/**
 * The whole first run: every phase of one path, back to back (#33).
 *
 * There is no menu between phases and no graduation screen at the end.
 * `ONBOARDING_DESIGN.md` §6 N5 is explicit that the last scripted action
 * should hand straight into a real hand rather than into a second ceremony —
 * the transition *is* the comprehension test, and interrupting it to ask a
 * novice whether they want Beginner or Standard rules spends the strongest
 * transfer moment the product has on a question they still cannot answer.
 *
 * Progress is recorded per phase (§3.3). A kill or a background termination
 * mid-walkthrough resumes at the start of the phase the learner was in: short,
 * deterministic and always coherent, where persisted mid-scenario engine state
 * would have to survive a schema change to stay correct and would drop them
 * into a half-finished position they have lost the context for.
 *
 * Rotation is not one of those interruptions, and this component owns the
 * portrait case itself rather than letting a caller swap it out. §4.2 requires
 * a live surface to *hold* when the phone turns, and the walkthrough's engine
 * state lives in the runner below — unmounting to render a rotate notice
 * elsewhere would silently restart the phase while the notice claimed nothing
 * had moved. So portrait renders the notice from in here, with the runner
 * still mounted underneath it and its pacing paused, which is the same thing
 * Peek does for the same reason.
 */
export function Onboarding({
  path,
  cornerLabel,
  landscape,
  onFinish,
  onMenu,
}: {
  readonly path: OnboardingPath;
  readonly cornerLabel: CornerLabelMode;
  /** False while the phone is upright; the walkthrough holds rather than ends. */
  readonly landscape: boolean;
  /**
   * Leaving, whether by finishing or by skipping. Either way the learner
   * lands on the table their entry choice selected, and the walkthrough is
   * not offered again — skipping must never cost anybody the game, and the
   * replayable lessons stay one menu action away.
   */
  readonly onFinish: (completed: boolean) => void;
  readonly onMenu: () => void;
}): JSX.Element {
  const phases = phasesFor(path);
  const [index, setIndex] = useState(() => resumeIndex(path, loadTutorial().onboarding?.phase ?? null));
  const phase = phases[Math.min(index, phases.length - 1)] as OnboardingPhase;

  // Written on entering each phase rather than on leaving it: the point of the
  // record is to survive a kill, and a kill does not run cleanup.
  useEffect(() => {
    const stored = loadTutorial();
    saveTutorial({ ...stored, onboarding: { path, phase: phase.id } });
  }, [path, phase.id]);

  const leave = useCallback(
    (completed: boolean) => {
      const stored = loadTutorial();
      saveTutorial({ ...stored, onboarding: null, onboardingDone: true });
      onFinish(completed);
    },
    [onFinish],
  );

  const tutorial = useTutorialRunner(phase, true);

  /*
   * Hold the pacing while the table is not on screen.
   *
   * An opponent moving behind the rotate notice would change the position the
   * learner comes back to, and would do it out of sight; the hint ladder would
   * meanwhile count a phone in a pocket as hesitation. `setPaused` already
   * handles both — it stops the pump and banks the elapsed idle time — and is
   * what Peek uses for exactly this.
   */
  const { setPaused } = tutorial;
  useEffect(() => {
    setPaused(!landscape);
  }, [landscape, setPaused]);

  /*
   * A finished phase rolls straight into the next one, and the last one hands
   * over to a real hand. Driven off the runner's own `finished` flag rather
   * than off a click, so a phase that advances itself (§5.3) ends the same way
   * a phase the player pressed Continue on does.
   */
  const { finished } = tutorial.snapshot;
  useEffect(() => {
    if (!finished) return;
    if (index + 1 < phases.length) setIndex(index + 1);
    else leave(true);
  }, [finished, index, phases.length, leave]);

  if (!landscape) {
    return <RotateNotice onMenu={onMenu} teaching />;
  }

  return (
    <OnboardingView
      tutorial={tutorial}
      cornerLabel={cornerLabel}
      phaseIndex={index}
      phaseCount={phases.length}
      onLeave={() => { leave(false); }}
      onMenu={onMenu}
    />
  );
}
