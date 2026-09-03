import { useEffect, useRef, type JSX } from "react";

import { seatPosition, seatPositionName } from "../game/labels";
import { TUTORIAL_SEAT, type TutorialSnapshot } from "./runner";

/**
 * The walkthrough's global chrome (#33).
 *
 * Deliberately smaller than the #30 coach strip it replaces. Object-specific
 * instruction has moved next to its object (`Attention`), so what is left here
 * is what `ONBOARDING_DESIGN.md` §5.1 reserves the strip for: whole-table
 * ideas with no single target, the progress readout, and the way out.
 *
 * It also takes the sentence *back* in one case — when the attention layer
 * reports that it bottomed out at the global rung, because the phone had no
 * room to anchor the callout without covering a decision input (§5.6). That is
 * the floor of the ladder, and the spotlight stays on the target throughout,
 * so the learner still knows which object the sentence is about.
 */
export function OnboardingCoach({
  snapshot,
  phaseIndex,
  phaseCount,
  onAdvance,
  onLeave,
  onRescue,
  onMenu,
  /** The callout text, when the attention layer could not anchor it. */
  strandedCallout = null,
}: {
  readonly snapshot: TutorialSnapshot;
  readonly phaseIndex: number;
  readonly phaseCount: number;
  readonly onAdvance: () => void;
  readonly onLeave: () => void;
  readonly onRescue: () => void;
  readonly onMenu: () => void;
  readonly strandedCallout?: string | null;
}): JSX.Element {
  const { step, feedback, stepSatisfied, waitingOn, hint, rescueOffered } = snapshot;
  const canContinue = stepSatisfied || step.kind === "note";
  const correction = feedback?.tone === "correction" ? feedback.text : null;
  const note = feedback?.tone === "note" ? feedback.text : null;
  const waiting =
    waitingOn === null
      ? null
      : `${seatPositionName(seatPosition(waitingOn, TUTORIAL_SEAT))} is playing`;

  /*
   * Focus moves to the continue control the moment the player satisfies a
   * step. The coach sits above the table, so a keyboard player who has just
   * tapped a tile would otherwise have to walk backwards past the whole hand
   * to reach the only control left — the judgement the result sheet already
   * makes about its own Continue button (DESIGN.md §16). It fires only on the
   * transition, so arriving at a step never takes focus off what the player
   * was on.
   */
  const goRef = useRef<HTMLButtonElement>(null);
  const wasSatisfied = useRef(stepSatisfied);
  useEffect(() => {
    if (stepSatisfied && !wasSatisfied.current) goRef.current?.focus();
    wasSatisfied.current = stepSatisfied;
  }, [stepSatisfied]);

  return (
    <header className="coach coach--onboarding" data-tone={correction !== null ? "correction" : "prompt"}>
      <div className="coach__head">
        {/*
          A step counter would be the wrong readout here. #33 replaces a
          five-lesson curriculum with one continuous run, and numbering every
          beat of it turns a game back into a checklist — the exact distinction
          §1 draws between onboarding and a tutorial. The phase name is enough
          to say where you are.
        */}
        <span className="coach__lesson">{snapshot.title}</span>
        <span className="visually-hidden">
          Part {phaseIndex + 1} of {phaseCount}
        </span>
        <button type="button" className="coach__menu" data-teach="menu" onClick={onMenu}>
          Menu
        </button>
        <button type="button" className="coach__quit" onClick={onLeave}>
          Skip
        </button>
      </div>

      {/*
        A live region, so a player using a screen reader is told the new
        instruction without going looking for it. Polite rather than assertive:
        nothing here is urgent and nothing here gates a move.
      */}
      <div className="coach__body" role="status" aria-live="polite">
        {note === null ? (
          <p className="coach__prompt">{step.prompt}</p>
        ) : (
          <p className="coach__note">{note}</p>
        )}
        {/*
          The anchored sentence, taken back only when the phone had nowhere to
          put it (§5.6). Its target is still spotlit, which is what stops this
          being the "read a global instruction and search the screen" failure
          the whole attention system exists to prevent.
        */}
        {note === null && strandedCallout !== null && (
          <p className="coach__anchored">{strandedCallout}</p>
        )}
        {correction !== null && <p className="coach__correction">{correction}</p>}
        {note === null && correction === null && hint !== null && (
          <p className="coach__hint">{hint}</p>
        )}
        {note === null && correction === null && hint === null && waiting !== null && (
          <p className="coach__waiting">{waiting}…</p>
        )}
      </div>

      <div className="coach__controls">
        {/*
          The last rung of the ladder (§5.4). It appears only once the learner
          has genuinely stalled, and taking it is recorded as a rescue rather
          than as having worked the answer out — §14.6 asks for exactly that
          distinction when the human sessions are read.
        */}
        {rescueOffered && !stepSatisfied && (
          <button type="button" className="coach__rescue" onClick={onRescue}>
            Show me
          </button>
        )}
        {canContinue && (
          <button ref={goRef} type="button" className="coach__go" onClick={onAdvance}>
            Continue
          </button>
        )}
      </div>
    </header>
  );
}
