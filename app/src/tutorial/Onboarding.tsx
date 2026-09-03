import { useCallback, useEffect, useState, type JSX } from "react";

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
 */
export function Onboarding({
  path,
  cornerLabel,
  onFinish,
  onMenu,
}: {
  readonly path: OnboardingPath;
  readonly cornerLabel: CornerLabelMode;
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
