/**
 * The timed assistance ladder (`ONBOARDING_DESIGN.md` §5.4).
 *
 * Pure, so the escalation can be asserted without waiting out real seconds.
 *
 * The shape of the rule matters more than the numbers, which §5.4 says must be
 * tuned on real players: **do not open with the most prescriptive hint.** A
 * learner who can work out the answer should be allowed to, because working it
 * out is the evidence the step exists to produce; a learner who cannot must
 * not be left stuck. So the cue strengthens with hesitation rather than
 * arriving fully formed.
 *
 * The exception is a step whose subject is a private interface convention —
 * tap once to lift, tap again to discard. There is nothing to reason out and
 * no comprehension to demonstrate, so those steps open at the explicit level.
 * Making a novice discover an interaction convention by trial and error is not
 * teaching, it is a puzzle nobody set.
 */

export type HintLevel = 0 | 1 | 2 | 3;

export interface HintTiming {
  /** Strengthen the target's outline / narrow the search space. */
  readonly softMs: number;
  /** Leader plus concrete action language or a named tile. */
  readonly explicitMs: number;
  /** Offer "Show me". Taking it is not evidence of comprehension. */
  readonly rescueMs: number;
}

export const DEFAULT_HINT_TIMING: HintTiming = Object.freeze({
  softMs: 5000,
  explicitMs: 10000,
  rescueMs: 20000,
});

/**
 * The level owed after `idleMs` without a player action on this step.
 *
 * `immediate` is the control-teaching case above: it starts at the explicit
 * level and still escalates to a rescue, because a player who cannot perform a
 * gesture they have been shown needs a way out rather than the same sentence
 * again.
 */
export function hintLevelAt(
  idleMs: number,
  timing: HintTiming = DEFAULT_HINT_TIMING,
  immediate = false,
): HintLevel {
  if (idleMs >= timing.rescueMs) return 3;
  if (immediate) return 2;
  if (idleMs >= timing.explicitMs) return 2;
  if (idleMs >= timing.softMs) return 1;
  return 0;
}

/** The next moment the level would change, or null once it cannot rise again. */
export function nextHintDeadline(
  idleMs: number,
  timing: HintTiming = DEFAULT_HINT_TIMING,
  immediate = false,
): number | null {
  const marks = immediate ? [timing.rescueMs] : [timing.softMs, timing.explicitMs, timing.rescueMs];
  for (const mark of marks) {
    if (idleMs < mark) return mark - idleMs;
  }
  return null;
}
