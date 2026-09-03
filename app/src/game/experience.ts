import type { CornerLabelMode } from "../tiles/Tile";
import type { TableMode } from "./modes";

/**
 * What the first launch asks, and what each answer configures (#33).
 *
 * The question is about the player, not about the product: "have you played
 * this game before?" is answerable by somebody who has never seen a tile,
 * where "Beginner or Standard?" is not. `ONBOARDING_DESIGN.md` §3 fixes the
 * three meanings; the copy on the buttons may be polished, these may not.
 *
 * A path is not a mode. It is read once, at the moment it is chosen, to settle
 * a mode and a set of aids — after that the player owns every one of those
 * settings from the menu and the path never overrides them again. Storing it
 * is what records that the question was asked at all.
 */
export type ExperiencePath = "new" | "rusty" | "confident";

export function isExperiencePath(value: unknown): value is ExperiencePath {
  return value === "new" || value === "rusty" || value === "confident";
}

/** The scripted first run a path opens on, or null for straight to the table. */
export type OnboardingPath = "novice" | "refresher";

export interface ExperienceDefaults {
  readonly mode: TableMode;
  readonly showAllClaims: boolean;
  readonly assistOn: boolean;
  readonly explainOn: boolean;
  readonly cornerLabel: CornerLabelMode;
  readonly onboarding: OnboardingPath | null;
}

/**
 * `ONBOARDING_DESIGN.md` §3.2, as data.
 *
 * The point of these is that no first run has a setup step. A novice never
 * chooses a rules profile, a claim band or a label mode; they say they are new
 * and the app decides all of it, states the one simplification that matters
 * when it becomes relevant, and lets them change any of it later.
 *
 * **Start playing** is the one that is easy to get wrong. §3.2 asks for "a
 * clean full table rather than unsolicited step-by-step coaching", so the aids
 * are off rather than on: a player who has just said they do not want
 * instruction should not be given a table that suggests their discards. This
 * applies only to a genuinely fresh path — a returning player's stored
 * settings are never overwritten by it, because the question is not asked
 * twice.
 */
export const EXPERIENCE_DEFAULTS: Readonly<Record<ExperiencePath, ExperienceDefaults>> =
  Object.freeze({
    new: Object.freeze({
      mode: "beginner",
      showAllClaims: false,
      assistOn: true,
      explainOn: true,
      cornerLabel: "rank",
      onboarding: "novice",
    }),
    rusty: Object.freeze({
      mode: "standard",
      showAllClaims: true,
      assistOn: true,
      explainOn: true,
      cornerLabel: "rank",
      onboarding: "refresher",
    }),
    confident: Object.freeze({
      mode: "standard",
      showAllClaims: true,
      assistOn: false,
      explainOn: false,
      cornerLabel: "off",
      onboarding: null,
    }),
  });
