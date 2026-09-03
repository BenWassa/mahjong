import { useEffect, useRef, type JSX } from "react";

import type { LessonId } from "./ids";
import { LESSONS } from "./lessons";

/**
 * The Learn to Play menu.
 *
 * Reached from the Menu, and only from the Menu (#33): first run is a linear
 * walkthrough now, so a novice is never dropped onto a curriculum they have no
 * schema with which to choose between. #30 requires that skipping never locks
 * a player out and that lessons stay replayable, so this surface has no
 * completion gate of any kind. A finished lesson is marked and can be run
 * again; an unfinished one can be started out of order.
 *
 * Laid out as a single centred column with no breakpoint, for the same reason
 * the mode-choice screen is (§24): it has to work in whichever orientation the
 * phone is in.
 */
export function LearnMenu({
  completed,
  onStart,
  onPlay,
}: {
  readonly completed: ReadonlySet<LessonId>;
  readonly onStart: (id: LessonId) => void;
  /** Leave for the table. Always available, at every point in the sequence. */
  readonly onPlay: () => void;
}): JSX.Element {
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { nextRef.current?.focus(); }, []);

  const next = LESSONS.find((lesson) => !completed.has(lesson.id)) ?? LESSONS[0];

  return (
    <main className="learn" aria-labelledby="learn-title">
      <div className="learn__column">
        <h1 className="learn__title" id="learn-title">
          <span className="learn__han" aria-hidden="true">學</span>
          Learn to play
        </h1>
        <p className="learn__note">
          Five short lessons, about six minutes. You play each one on a real
          table — there is nothing to read through first.
        </p>

        <ol className="learn__list">
          {LESSONS.map((lesson, index) => {
            const done = completed.has(lesson.id);
            return (
              <li key={lesson.id} className="learn__item">
                <button
                  ref={lesson.id === next?.id ? nextRef : undefined}
                  type="button"
                  className="learn__lesson"
                  data-done={done}
                  onClick={() => { onStart(lesson.id); }}
                  aria-label={`${done ? "Replay" : "Start"} lesson ${String(index + 1)}, ${lesson.title}. ${lesson.summary}`}
                >
                  <span className="learn__index" aria-hidden="true">
                    {done ? "✓" : index + 1}
                  </span>
                  <span className="learn__text">
                    <span className="learn__lessontitle">{lesson.title}</span>
                    <span className="learn__summary">{lesson.summary}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <button type="button" className="learn__skip" onClick={onPlay}>
          Back to the game
        </button>
      </div>
    </main>
  );
}
