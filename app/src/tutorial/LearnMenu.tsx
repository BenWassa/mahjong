import { useEffect, useRef, type JSX } from "react";

import type { TableMode } from "../game/modes";
import type { LessonId } from "./ids";
import { LESSONS } from "./lessons";

/**
 * The Learn to Play menu.
 *
 * Reached from the first-launch question and, forever afterwards, from the
 * portrait menu — #30 requires that skipping never locks a player out and that
 * lessons stay replayable, so this surface has no completion gate of any kind.
 * A finished lesson is marked and can be run again; an unfinished one can be
 * started out of order.
 *
 * Laid out as a single centred column with no breakpoint, for the same reason
 * the mode-choice screen is (§24): it has to work in whichever orientation the
 * phone is in.
 */
export function LearnMenu({
  completed,
  firstRun,
  onStart,
  onPlay,
}: {
  readonly completed: ReadonlySet<LessonId>;
  /**
   * True when this was reached from the first-launch question rather than from
   * the menu. It changes only the way out is worded: "skip" is the promise a
   * new player needs to see, and it is the wrong word for somebody who came
   * back to replay a lesson and now wants their table again.
   */
  readonly firstRun: boolean;
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
          {firstRun ? "Skip to the game" : "Back to the game"}
        </button>
      </div>
    </main>
  );
}

/**
 * The door out of Learn to Play and into a real hand.
 *
 * This is the only place the tutorial names the difference between the two
 * tables, and it has to: the lessons are taught under the standard rules, so a
 * player arriving at Beginner needs to be told which rule was relaxed for them
 * and that it is a starting setting rather than the game. #30 asks for exactly
 * that distinction where the two behave differently.
 */
export function LearnFinish({
  onChoose,
}: {
  readonly onChoose: (mode: TableMode) => void;
}): JSX.Element {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  return (
    <main className="choice" aria-labelledby="finish-title">
      <div className="choice__column">
        <h1 className="choice__title" id="finish-title">
          <span className="choice__han" aria-hidden="true">糊</span>
          That is the game
        </h1>
        <p className="choice__lede">
          Now a real hand, against the same three opponents, with nothing
          scripted. The game will still suggest a discard and explain what just
          happened — both of those switch off from the menu whenever you want.
        </p>

        <button
          ref={firstRef}
          type="button"
          className="choice__option"
          onClick={() => { onChoose("beginner"); }}
        >
          <span className="choice__label">Start on the beginner table</span>
          <span className="choice__detail">
            One rule is relaxed: any completed hand may be declared. The full
            game asks a hand to be worth at least one faan first, which is the
            rule most likely to leave you holding a finished hand you cannot
            end. Everything else is the same, and you can switch at any time.
          </span>
        </button>

        <button
          type="button"
          className="choice__option"
          onClick={() => { onChoose("standard"); }}
        >
          <span className="choice__label">Start on the full table</span>
          <span className="choice__detail">
            Hong Kong Old Style exactly as the lessons taught it, minimum faan
            included.
          </span>
        </button>
      </div>
    </main>
  );
}
