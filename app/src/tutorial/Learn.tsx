import { useCallback, useState, type JSX } from "react";

import type { TableMode } from "../game/modes";
import type { CornerLabelMode } from "../tiles/Tile";
import type { LessonId } from "./ids";
import { LearnFinish, LearnMenu } from "./LearnMenu";
import { LESSONS } from "./lessons";
import { TutorialView } from "./TutorialView";
import { useTutorialLesson, useTutorialProgress } from "./useTutorial";

type Screen = { readonly kind: "menu" } | { readonly kind: "lesson"; readonly id: LessonId } | { readonly kind: "finish" };

/**
 * Learn to Play (#30), end to end: the menu, the five lessons, and the door
 * out to a real hand.
 *
 * Nothing here can trap the player. Every screen has a way back to the table,
 * a lesson can be left in the middle of a step, and the graduation screen is
 * reached by finishing the fifth lesson rather than by completing all five in
 * one sitting — a player who ran three lessons yesterday and two today gets it
 * just the same.
 */
export function Learn({
  cornerLabel,
  openAt = null,
  firstRun,
  onLeave,
  onGraduate,
}: {
  readonly cornerLabel: CornerLabelMode;
  /** A lesson to open straight into, from `?learn=<id>`. */
  readonly openAt?: LessonId | null;
  /** Opened from the first-launch question rather than from the menu. */
  readonly firstRun: boolean;
  /** Leave for the table that was already there, unchanged. */
  readonly onLeave: () => void;
  /** Leave having finished, onto the chosen table with the guided hand. */
  readonly onGraduate: (mode: TableMode) => void;
}): JSX.Element {
  const [screen, setScreen] = useState<Screen>(
    openAt === null ? { kind: "menu" } : { kind: "lesson", id: openAt },
  );
  const progress = useTutorialProgress();

  const onFinishLesson = useCallback(
    (id: LessonId) => {
      progress.complete(id);
      // The fifth lesson is the end of the sequence, so finishing it is what
      // graduation means — not having every earlier one ticked off, which
      // would punish a player who skipped one and make the door unreachable.
      if (id === LESSONS[LESSONS.length - 1]?.id) {
        progress.finish();
        setScreen({ kind: "finish" });
      } else {
        setScreen({ kind: "menu" });
      }
    },
    [progress],
  );

  if (screen.kind === "finish") {
    return <LearnFinish onChoose={onGraduate} />;
  }

  if (screen.kind === "lesson") {
    return (
      <LessonScreen
        id={screen.id}
        cornerLabel={cornerLabel}
        onQuit={() => { setScreen({ kind: "menu" }); }}
        onFinish={() => { onFinishLesson(screen.id); }}
      />
    );
  }

  return (
    <LearnMenu
      completed={progress.completed}
      firstRun={firstRun}
      onStart={(id) => { setScreen({ kind: "lesson", id }); }}
      onPlay={onLeave}
    />
  );
}

/**
 * Split out so the runner is constructed only once a lesson is actually
 * chosen, and torn down when it is left. Building it in `Learn` would deal
 * every lesson's opening hand the moment the menu opened.
 */
function LessonScreen({
  id,
  cornerLabel,
  onQuit,
  onFinish,
}: {
  readonly id: LessonId;
  readonly cornerLabel: CornerLabelMode;
  readonly onQuit: () => void;
  readonly onFinish: () => void;
}): JSX.Element {
  const tutorial = useTutorialLesson(id);
  return (
    <TutorialView
      tutorial={tutorial}
      cornerLabel={cornerLabel}
      onQuit={onQuit}
      onFinish={onFinish}
    />
  );
}
