import { useCallback, useEffect, useRef, useState } from "react";

import type { GameAction, TileId } from "@engine";

import { loadTutorial, saveTutorial } from "../game/persistence";
import type { LessonId } from "./ids";
import { lessonById, type Lesson } from "./lessons";
import { TutorialRunner, type TutorialSnapshot } from "./runner";

/**
 * Binds one `TutorialRunner` to the component tree.
 *
 * The runner owns the lesson; React only subscribes to it, so a re-render can
 * never advance a step or move an opponent. Deliberately the same arrangement
 * as `useGameSession` — the difference between the tutorial and the table is
 * what they teach, not how they are wired.
 */
export interface TutorialHandle {
  readonly snapshot: TutorialSnapshot;
  readonly act: (action: GameAction) => void;
  readonly identify: (tileId: TileId) => void;
  readonly advance: () => void;
  /**
   * The last rung of the assistance ladder: play the step's own answer. Does
   * nothing until the ladder has actually reached it (#33, §5.4).
   */
  readonly rescue: () => void;
  /** Holds the pacing still while an overlay is open over the table. */
  readonly setPaused: (paused: boolean) => void;
}

export function useTutorialLesson(lessonId: LessonId): TutorialHandle {
  return useTutorialRunner(lessonById(lessonId), false);
}

/**
 * Binds a runner to one lesson or walkthrough phase.
 *
 * `autoAdvance` is what separates the two callers. The #33 first-run phases
 * move themselves on once the player has acted, because §5.3 rules out a Next
 * press after every micro-step; the replayable #30 lessons do not, because
 * their longer explanatory notes were written to be sat with and their reader
 * returns to a menu afterwards anyway.
 */
export function useTutorialRunner(lesson: Lesson, autoAdvance: boolean): TutorialHandle {
  const runnerRef = useRef<TutorialRunner | null>(null);
  const activeRef = useRef<string | null>(null);
  const lessonId = lesson.id;

  if (runnerRef.current === null || activeRef.current !== lessonId) {
    runnerRef.current?.dispose();
    runnerRef.current = new TutorialRunner({ lesson, autoAdvance });
    activeRef.current = lessonId;
  }
  const runner = runnerRef.current;
  const [snapshot, setSnapshot] = useState<TutorialSnapshot>(() => runner.snapshot());

  useEffect(() => {
    const current = runnerRef.current;
    if (current === null) return undefined;
    setSnapshot(current.snapshot());
    return current.subscribe(setSnapshot);
  }, [lessonId]);

  useEffect(() => () => { runnerRef.current?.dispose(); }, []);

  return {
    snapshot,
    act: useCallback((action: GameAction) => { runnerRef.current?.act(action); }, []),
    identify: useCallback((tileId: TileId) => { runnerRef.current?.identify(tileId); }, []),
    advance: useCallback(() => { runnerRef.current?.advance(); }, []),
    rescue: useCallback(() => { runnerRef.current?.rescue(); }, []),
    setPaused: useCallback((paused: boolean) => { runnerRef.current?.setPaused(paused); }, []),
  };
}

export interface TutorialProgress {
  readonly completed: ReadonlySet<LessonId>;
  readonly finished: boolean;
  readonly complete: (id: LessonId) => void;
  readonly finish: () => void;
}

/**
 * Which lessons the player has finished (#30), read once at startup and
 * written back on every change.
 *
 * Progress is recorded but never required: nothing in the app reads this to
 * decide whether the player may reach the table. It exists so a lesson list
 * can say what is done and so Learn to Play can be picked up where it was left.
 */
export function useTutorialProgress(): TutorialProgress {
  const [stored, setStored] = useState(loadTutorial);

  const complete = useCallback((id: LessonId) => {
    setStored((current) =>
      current.completed.includes(id)
        ? current
        : { ...current, completed: [...current.completed, id] },
    );
  }, []);

  const finish = useCallback(() => {
    setStored((current) => (current.finished ? current : { ...current, finished: true }));
  }, []);

  useEffect(() => { saveTutorial(stored); }, [stored]);

  return {
    completed: new Set(stored.completed),
    finished: stored.finished,
    complete,
    finish,
  };
}
