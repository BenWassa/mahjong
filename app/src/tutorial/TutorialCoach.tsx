import { useEffect, useRef, type JSX } from "react";

import { seatPosition, seatPositionName } from "../game/labels";
import { TUTORIAL_SEAT, type TutorialSnapshot } from "./runner";

/**
 * The one piece of chrome Learn to Play adds: a strip above the table holding
 * the current instruction, the answer to what the player just did, and the
 * control that moves on.
 *
 * It is a strip rather than a modal on purpose. #30 asks for concise
 * contextual teaching instead of slideshow screens, and a panel that covers
 * the table would be a slideshow with extra steps — the player has to be able
 * to look at the tiles the sentence is about while they read it.
 *
 * Only ever one voice at a time: the prompt until the player answers, then the
 * note about what they did. A correction replaces neither permanently — it
 * appears alongside the prompt, because the prompt is still the thing to do.
 */
export function TutorialCoach({
  snapshot,
  onAdvance,
  onQuit,
}: {
  readonly snapshot: TutorialSnapshot;
  readonly onAdvance: () => void;
  readonly onQuit: () => void;
}): JSX.Element {
  const { step, feedback, stepSatisfied, stepIndex, stepCount, title, waitingOn } = snapshot;
  const canContinue = stepSatisfied || step.kind === "note";
  const correction = feedback?.tone === "correction" ? feedback.text : null;
  const note = feedback?.tone === "note" ? feedback.text : null;
  // Named while an opponent is mid-move, so the pause reads as somebody
  // thinking rather than as the lesson having stopped responding.
  const waiting =
    waitingOn === null
      ? null
      : `${seatPositionName(seatPosition(waitingOn, TUTORIAL_SEAT))} is playing`;

  /*
   * Focus moves to Next the moment the player satisfies a step.
   *
   * The coach sits above the table, so a keyboard player who has just tapped a
   * tile or a claim would otherwise have to walk backwards past the whole hand
   * to find the only control left. It is the same judgement the result sheet
   * makes about its own Continue button (§16), and it fires only on the
   * transition — arriving at a step never takes focus off whatever the player
   * was on.
   */
  const goRef = useRef<HTMLButtonElement>(null);
  const wasSatisfied = useRef(stepSatisfied);
  useEffect(() => {
    if (stepSatisfied && !wasSatisfied.current) goRef.current?.focus();
    wasSatisfied.current = stepSatisfied;
  }, [stepSatisfied]);

  return (
    <header className="coach" data-tone={correction !== null ? "correction" : "prompt"}>
      <div className="coach__head">
        <span className="coach__lesson">{title}</span>
        <span className="coach__steps" aria-hidden="true">
          {stepIndex + 1}/{stepCount}
        </span>
        <span className="visually-hidden">
          Step {stepIndex + 1} of {stepCount}
        </span>
        <button type="button" className="coach__quit" onClick={onQuit}>
          Leave
        </button>
      </div>

      {/*
        A live region, so a player using a screen reader is told the new
        instruction without having to go looking for it. Polite rather than
        assertive: nothing here is urgent, and nothing here gates a move.
      */}
      <div className="coach__body" role="status" aria-live="polite">
        {/*
          One voice at a time. The note is the answer to a step the player has
          finished, so it replaces the instruction rather than stacking under
          it — on a 320px-tall phone the pair together took half the screen,
          and the second half of it was telling the player to do something they
          had already done. A correction is the opposite case: the instruction
          still stands, so it stays and the correction joins it.
        */}
        {note === null ? (
          <p className="coach__prompt">{step.prompt}</p>
        ) : (
          <p className="coach__note">{note}</p>
        )}
        {correction !== null && <p className="coach__correction">{correction}</p>}
        {note === null && correction === null && waiting !== null && (
          <p className="coach__waiting">{waiting}…</p>
        )}
      </div>

      {canContinue && (
        <button ref={goRef} type="button" className="coach__go" onClick={onAdvance}>
          {stepIndex + 1 === stepCount ? "Finish" : "Next"}
        </button>
      )}
    </header>
  );
}
