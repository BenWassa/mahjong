import type { CornerLabelMode } from "../tiles/Tile";
import {
  EXPERIENCE_DEFAULTS,
  isExperiencePath,
  type ExperiencePath,
  type OnboardingPath,
} from "./experience";
import { isTableMode, type TableMode } from "./modes";
import type { PersistedSettings, PersistedTutorial } from "./persistence";

/**
 * What the app opens on (#33).
 *
 * Pure, and separated from `App` for the same reason `geometry.ts` is separate
 * from the table: this is the decision #33 is actually about — who gets asked
 * the first-launch question, who gets a walkthrough, who goes straight to a
 * table, and what an interrupted walkthrough resumes into — and it has to be
 * assertable without a browser, a render, or a real `localStorage`.
 *
 * The rules, in order of authority:
 *
 * 1. **A stored answer wins, always.** Somebody who has played this app is
 *    never asked again and is never routed into a walkthrough. #33 makes that
 *    load-bearing rather than merely polite: the new first run is a scripted
 *    sequence, and dropping an existing player into one because they updated
 *    the app would be the worst possible reading of "we redesigned onboarding".
 * 2. **A walkthrough resumes only while one is genuinely in progress**, at the
 *    phase it recorded (§3.3). Once finished or skipped it is spent, and the
 *    replayable lessons are the way back to teaching material.
 * 3. **The URL stands in for a tap that was never made**, and only that. Query
 *    parameters are never written to storage, so a link can open a path but
 *    cannot reconfigure somebody's app.
 */

export interface LaunchQuery {
  readonly experience: string | null;
  readonly mode: string | null;
  /** The raw `?learn=` value: "1", a lesson id, or absent. */
  readonly learn: string | null;
}

export interface Opening {
  /** Null means the first-launch question has not been answered: ask it. */
  readonly experience: ExperiencePath | null;
  readonly mode: TableMode;
  readonly showAllClaims: boolean;
  readonly cornerLabel: CornerLabelMode;
  readonly assistOn: boolean;
  readonly explainOn: boolean;
  /** The walkthrough to open on, or null to go straight to a table. */
  readonly onboarding: OnboardingPath | null;
  /** True to open on the replayable lesson surface rather than the table. */
  readonly learn: boolean;
}

export function parseLaunchQuery(search: string): LaunchQuery {
  const params = new URLSearchParams(search);
  return {
    experience: params.get("experience"),
    mode: params.get("mode"),
    learn: params.get("learn"),
  };
}

export function openingFor(
  settings: PersistedSettings,
  progress: PersistedTutorial,
  query: LaunchQuery,
): Opening {
  const stored = {
    mode: settings.mode,
    showAllClaims: settings.showAllClaims,
    cornerLabel: settings.cornerLabel,
    assistOn: settings.assistOn,
    explainOn: settings.explainOn,
  };
  const learn = query.learn !== null;

  if (settings.experience !== null) {
    const resuming =
      progress.onboarding !== null && !progress.onboardingDone
        ? progress.onboarding.path
        : null;
    return {
      experience: settings.experience,
      ...stored,
      // A `?learn=` link opens the lessons over whatever table is already
      // there; it must not cancel a walkthrough somebody is in the middle of,
      // and it must not resume one either.
      onboarding: learn ? null : resuming,
      learn,
    };
  }

  if (isExperiencePath(query.experience)) {
    const preset = EXPERIENCE_DEFAULTS[query.experience];
    return {
      experience: query.experience,
      mode: preset.mode,
      showAllClaims: preset.showAllClaims,
      cornerLabel: preset.cornerLabel,
      assistOn: preset.assistOn,
      explainOn: preset.explainOn,
      onboarding: preset.onboarding,
      learn: false,
    };
  }

  if (isTableMode(query.mode)) {
    // Somebody who has said which table they want: the confident path with the
    // table overridden. It has to stand in for the whole of that tap, claim
    // band included, or the link would produce a "beginner" table that still
    // offered Chow and Kong.
    return {
      experience: "confident",
      ...stored,
      mode: query.mode,
      showAllClaims: query.mode === "standard",
      onboarding: null,
      learn,
    };
  }

  if (learn) {
    // Reaching the replayable lessons needs a table behind them, but it is not
    // an answer to the experience question and must not start a walkthrough.
    return {
      experience: "confident",
      ...stored,
      mode: "beginner",
      showAllClaims: false,
      onboarding: null,
      learn: true,
    };
  }

  return { experience: null, ...stored, onboarding: null, learn: false };
}
