/**
 * How much help a player who has just finished onboarding still gets, and how
 * it goes away (`ONBOARDING_DESIGN.md` §7).
 *
 * Pure, so the fade can be asserted without playing hands in a browser.
 *
 * The first unscripted hand is where onboarding finds out whether it created a
 * usable model, so §7.1 removes the scripted apparatus the moment it starts —
 * forced choices, step counters, the scrim, scripted opponents, Next. That
 * happens by leaving the walkthrough surface entirely; there is nothing to
 * decide about it here.
 *
 * What this decides is §7.3: the remaining aids fading **as competence is
 * demonstrated** rather than on a timer or a hand count. The distinction
 * matters. A hand counter fades help from a player who has been guessing, and
 * keeps it in front of a player who worked it out in thirty seconds; neither
 * is what was asked for. So the input is what the player has actually done.
 *
 * Nothing here can remove a legal move, and nothing here is a rule. Every aid
 * it fades is one the player can switch straight back on from the menu — the
 * "all three learning aids disable independently" constraint in `PRD` §9 and
 * `DESIGN.md` §21 runs in both directions.
 */

/**
 * How many unprompted turns of their own a player has to take before the
 * tap-tap discard instruction stops being repeated.
 *
 * §7.3 says two. Two is enough to have done it deliberately rather than by
 * accident, and few enough that a player who has understood it is not told
 * again for a whole hand.
 */
export const TURNS_TO_LEARN_THE_CONTROL = 2;

export interface DemonstratedCompetence {
  /** Discards the player has made themselves, outside a scripted phase. */
  readonly unpromptedTurns: number;
  /** Whether they have ever taken a claim. */
  readonly hasClaimed: boolean;
}

export const NO_COMPETENCE: DemonstratedCompetence = Object.freeze({
  unpromptedTurns: 0,
  hasClaimed: false,
});

export interface Scaffolding {
  /**
   * Whether Assist's discard suggestion should still spell the gesture out
   * ("Tap X twice to discard") rather than simply naming the tile.
   *
   * This is the "basic draw one / discard one instruction" §7.3 retires. It is
   * the right thing to say to somebody who threw their first tile ninety
   * seconds ago and the wrong thing to keep saying afterwards: a suggestion
   * that re-explains the controls every turn reads as the app not believing
   * the player, which is its own kind of noise.
   */
  readonly explainDiscardGesture: boolean;
  /**
   * Whether a claim offer should still carry its own explanation, or can rely
   * on the normal interface plus Assist.
   *
   * §7.3 ties this to having claimed once, not to having read about claiming
   * once — the Explain banner already fires on first occurrence, and this is
   * about what happens on the second.
   */
  readonly explainClaims: boolean;
}

/**
 * What is still owed, given what the player has shown they can do.
 *
 * `beginner` is not competence, it is a table: a player may switch to Beginner
 * after fifty hands. So it does not extend the scaffolding — it only decides
 * whether the gesture instruction was ever appropriate to lead with, which is
 * the judgement the Beginner assist hint already made before #33.
 */
export function scaffoldingFor(
  competence: DemonstratedCompetence,
  beginner: boolean,
): Scaffolding {
  return {
    explainDiscardGesture:
      beginner && competence.unpromptedTurns < TURNS_TO_LEARN_THE_CONTROL,
    explainClaims: !competence.hasClaimed,
  };
}
