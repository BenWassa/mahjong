import { useCallback, useState, type JSX } from "react";

import type { CornerLabelMode } from "../tiles/Tile";
import type { LessonId } from "./ids";
import { LearnMenu } from "./LearnMenu";
import { LESSONS } from "./lessons";
import { TutorialView } from "./TutorialView";
import { useTutorialLesson, useTutorialProgress } from "./useTutorial";

type Screen = { readonly kind: "menu" } | { readonly kind: "lesson"; readonly id: LessonId };

/**
 * Learn to Play: the lesson menu and the five replayable lessons.
 *
 * #33 changed what this surface is *for*. It used to be the first-run router —
 * a novice answered the launch question and landed here, on a five-item
 * curriculum they had no schema with which to choose between. First run is now
 * a linear walkthrough (`tutorial/Onboarding.tsx`), and this became what
 * `ONBOARDING_DESIGN.md` §12 asks for: a reference and practice library, reached
 * from the menu, replayable in any order, with completion markers that are
 * informational only.
 *
 * The graduation screen went with it. Finishing the fifth lesson used to ask
 * the player to choose Beginner or Standard, which is the rules-profile
 * question §3 removes from first run — and asking it of somebody who came back
 * to replay a lesson is worse still, because they already have a table and did
 * not come here to change it. Finishing now simply marks the lesson done and
 * returns to the list.
 *
 * Nothing here can trap the player: every screen has a way back to the table,
 * and a lesson can be left in the middle of a step.
 */
export function Learn({
  cornerLabel,
  openAt = null,
  onLeave,
}: {
  readonly cornerLabel: CornerLabelMode;
  /** A lesson to open straight into, from `?learn=<id>`. */
  readonly openAt?: LessonId | null;
  /** Leave for the table that was already there, unchanged. */
  readonly onLeave: () => void;
}): JSX.Element {
  const [screen, setScreen] = useState<Screen>(
    openAt === null ? { kind: "menu" } : { kind: "lesson", id: openAt },
  );
  const progress = useTutorialProgress();

  const onFinishLesson = useCallback(
    (id: LessonId) => {
      progress.complete(id);
      // Finishing the last lesson records that the course has been seen
      // through. It is a marker, not a gate and not a door: §12 makes these
      // informational, and the way back to the table is the same button it is
      // from every other lesson.
      if (id === LESSONS[LESSONS.length - 1]?.id) progress.finish();
      setScreen({ kind: "menu" });
    },
    [progress],
  );

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
