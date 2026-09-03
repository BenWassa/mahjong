import type { GameRecord, RulesProfile } from "@engine";

import type { CornerLabelMode } from "../tiles/Tile";
import { isLessonId, type LessonId } from "../tutorial/ids";
import { isExperiencePath, type ExperiencePath, type OnboardingPath } from "./experience";
import { isTableMode, type TableMode } from "./modes";

/**
 * Local-only persistence (#10). Everything here talks to `window.localStorage`
 * directly and nothing else: no network, no accounts, no telemetry. Every
 * read is defensive — corrupt or incompatible data is discarded and replaced
 * with a safe default rather than thrown, because a bad save must never
 * corrupt engine state or crash the app on launch.
 */

const KEY_PREFIX = "mahjong:v1:";
const SETTINGS_KEY = `${KEY_PREFIX}settings`;
const CURRENT_GAME_KEY = `${KEY_PREFIX}current-game`;
const COMPLETED_GAMES_KEY = `${KEY_PREFIX}completed-games`;
const TUTORIAL_KEY = `${KEY_PREFIX}tutorial`;

/** Keeps history bounded on disk; stats read the whole list, so this is generous. */
const MAX_COMPLETED_GAMES = 500;

export interface PersistedSettings {
  readonly version: 3;
  readonly cornerLabel: CornerLabelMode;
  readonly assistOn: boolean;
  readonly explainOn: boolean;
  /**
   * The answer to the one-time first-launch question, or null when it has
   * never been asked (#33).
   *
   * This is the field that records "already asked", and it is the only one:
   * two fields can disagree with each other, and "asked but somehow unset" is
   * not a state this app should be able to represent. It used to be `mode`,
   * which asked a novice to pick a rules profile before they knew what a turn
   * was — `ONBOARDING_DESIGN.md` §3 replaces that question with this one.
   *
   * It is read once, when it is answered, to settle the fields below. Nothing
   * re-reads it to decide what the table does: a player who chose "new" and
   * then switched to the full table is on the full table.
   */
  readonly experience: ExperiencePath | null;
  /**
   * Which table the player is on. Settled from `experience` when the question
   * is answered and owned by the player from the menu thereafter; the value
   * while `experience` is null has never been shown to anybody.
   */
  readonly mode: TableMode;
  /**
   * Whether the claim band offers Chow and Kong. Beginner starts with them
   * hidden and the player switches them on when they want them, which is the
   * only honest reading of "once they have some experience": the player is
   * the only party who can tell, and a hidden hand-counter would change the
   * table under someone who never asked it to.
   */
  readonly showAllClaims: boolean;
}

export const DEFAULT_SETTINGS: PersistedSettings = Object.freeze({
  version: 3,
  cornerLabel: "rank",
  assistOn: true,
  explainOn: true,
  experience: null,
  mode: "standard",
  showAllClaims: true,
});

/**
 * Storage can throw (disabled storage, private browsing, a full quota) or
 * simply be absent (SSR, headless test runners without jsdom). Every access
 * goes through these two so the rest of the module never has to guard twice.
 */
function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage full or unavailable: the in-memory session carries on, it just
    // will not survive a reload. Nothing here should ever throw into gameplay.
  }
}

function removeRaw(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do: if remove fails, the next read will re-validate anyway.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCornerLabelMode(value: unknown): value is CornerLabelMode {
  return value === "off" || value === "rank" || value === "rank-suit";
}

/**
 * The v1 settings shape, kept only so a blob written by an earlier build can
 * be recognised and carried forward rather than silently discarded.
 */
interface PersistedSettingsV1 {
  readonly version: 1;
  readonly cornerLabel: CornerLabelMode;
  readonly assistOn: boolean;
  readonly explainOn: boolean;
}

function isPersistedSettingsV1(value: unknown): value is PersistedSettingsV1 {
  if (!isRecord(value)) return false;
  return (
    value.version === 1 &&
    isCornerLabelMode(value.cornerLabel) &&
    typeof value.assistOn === "boolean" &&
    typeof value.explainOn === "boolean"
  );
}

/**
 * The v2 settings shape: the same fields, but with `mode` doubling as the
 * record of whether the first-launch question had been answered.
 */
interface PersistedSettingsV2 {
  readonly version: 2;
  readonly cornerLabel: CornerLabelMode;
  readonly assistOn: boolean;
  readonly explainOn: boolean;
  readonly mode: TableMode | null;
  readonly showAllClaims: boolean;
}

function isPersistedSettingsV2(value: unknown): value is PersistedSettingsV2 {
  if (!isRecord(value)) return false;
  return (
    value.version === 2 &&
    isCornerLabelMode(value.cornerLabel) &&
    typeof value.assistOn === "boolean" &&
    typeof value.explainOn === "boolean" &&
    (value.mode === null || isTableMode(value.mode)) &&
    typeof value.showAllClaims === "boolean"
  );
}

function isPersistedSettings(value: unknown): value is PersistedSettings {
  if (!isRecord(value)) return false;
  return (
    value.version === 3 &&
    isCornerLabelMode(value.cornerLabel) &&
    typeof value.assistOn === "boolean" &&
    typeof value.explainOn === "boolean" &&
    (value.experience === null || isExperiencePath(value.experience)) &&
    isTableMode(value.mode) &&
    typeof value.showAllClaims === "boolean"
  );
}

/**
 * Brings a stored blob of any known version up to the current shape, or
 * returns null when it is not a settings blob at all.
 *
 * The migration is not optional. `isPersistedSettings` is a strict shape
 * check, so without a v1 branch here every existing player's toggles would be
 * silently discarded and replaced with defaults the moment this build shipped.
 *
 * A v1 or v2 blob means someone who has already played this app, so they are
 * never shown the first-launch question and never routed into onboarding:
 * their table must not change under them because a new version arrived. #33
 * makes that promise load-bearing rather than merely polite — the new first
 * run is a scripted walkthrough, and dropping an existing player into one
 * would be the worst possible reading of "we redesigned onboarding".
 */
function migrateSettings(value: unknown): PersistedSettings | null {
  if (isPersistedSettings(value)) return value;
  if (isPersistedSettingsV2(value)) {
    return {
      version: 3,
      cornerLabel: value.cornerLabel,
      assistOn: value.assistOn,
      explainOn: value.explainOn,
      // A v2 blob carrying a mode is somebody who has already answered the old
      // question and is playing. They are not shown the new one and are not
      // put through onboarding: "confident" is what an existing player is,
      // whatever they answered a year ago, and their stored table and aids are
      // carried across untouched rather than reset to that path's defaults.
      experience: value.mode === null ? null : "confident",
      mode: value.mode ?? "standard",
      showAllClaims: value.showAllClaims,
    };
  }
  if (isPersistedSettingsV1(value)) {
    return {
      version: 3,
      cornerLabel: value.cornerLabel,
      assistOn: value.assistOn,
      explainOn: value.explainOn,
      experience: "confident",
      mode: "standard",
      showAllClaims: true,
    };
  }
  return null;
}

export function loadSettings(): PersistedSettings {
  const raw = readRaw(SETTINGS_KEY);
  if (raw === null) return DEFAULT_SETTINGS;
  try {
    const parsed: unknown = JSON.parse(raw);
    const migrated = migrateSettings(parsed);
    if (migrated !== null) return migrated;
  } catch {
    // Fall through to the safe default below.
  }
  removeRaw(SETTINGS_KEY);
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: PersistedSettings): void {
  writeRaw(SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Shallow shape check only. This is the storage boundary, not the engine
 * boundary: it confirms the blob looks like a game record worth handing to
 * `replayGame`, which is the actual source of truth for whether a seed plus
 * its action log is trustworthy (RULE/ENGINE-REPLAY). A record that passes
 * this check can still fail replay, and callers must treat that as corrupt
 * data too.
 */
function isRulesProfileShape(value: unknown): value is RulesProfile {
  if (!isRecord(value)) return false;
  return (
    (value.tileSetSize === 136 || value.tileSetSize === 144) &&
    (value.minimumFaan === 0 || value.minimumFaan === 1 || value.minimumFaan === 3) &&
    (value.matchLength === "single-hand" ||
      value.matchLength === "east-round" ||
      value.matchLength === "four-rounds")
  );
}

function isGameRecordShape(value: unknown): value is GameRecord {
  if (!isRecord(value)) return false;
  return (
    value.version === 1 &&
    typeof value.seed === "string" &&
    isRulesProfileShape(value.config) &&
    Array.isArray(value.actions) &&
    Array.isArray(value.events) &&
    Array.isArray(value.hands) &&
    typeof value.completed === "boolean"
  );
}

/**
 * Returns the stored in-progress record's raw shape, or null when there is
 * none or it is unreadable. Callers still owe this to `replayGame` before
 * trusting it as engine state — this function only clears storage that is
 * not even shaped like a record; a shaped-but-tampered record is the
 * caller's problem to detect and clear via `clearCurrentGame`.
 */
export function loadCurrentGame(): GameRecord | null {
  const raw = readRaw(CURRENT_GAME_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isGameRecordShape(parsed)) return parsed;
  } catch {
    // Fall through to discard below.
  }
  removeRaw(CURRENT_GAME_KEY);
  return null;
}

export function saveCurrentGame(record: GameRecord): void {
  writeRaw(CURRENT_GAME_KEY, JSON.stringify(record));
}

export function clearCurrentGame(): void {
  removeRaw(CURRENT_GAME_KEY);
}

/**
 * Individually-validated so one corrupt entry (a hand-edited file, a bug in
 * an earlier build) cannot erase the rest of a player's history. Only a
 * blob that is not even valid JSON, or not an array, resets the whole key.
 */
export function loadCompletedGames(): readonly GameRecord[] {
  const raw = readRaw(COMPLETED_GAMES_KEY);
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    removeRaw(COMPLETED_GAMES_KEY);
    return [];
  }
  if (!Array.isArray(parsed)) {
    removeRaw(COMPLETED_GAMES_KEY);
    return [];
  }
  const valid = parsed.filter(isGameRecordShape);
  if (valid.length !== parsed.length) {
    // Drop the entries that did not survive validation, but keep the rest.
    writeRaw(COMPLETED_GAMES_KEY, JSON.stringify(valid));
  }
  return valid;
}

export function appendCompletedGame(record: GameRecord): readonly GameRecord[] {
  const existing = loadCompletedGames();
  const updated = [...existing, record].slice(-MAX_COMPLETED_GAMES);
  writeRaw(COMPLETED_GAMES_KEY, JSON.stringify(updated));
  return updated;
}

/**
 * Learn to Play progress (#30). This is a record of what the player has
 * already been taught, so it is deliberately small and additive: which
 * lessons are finished and whether they reached the end of the course. It
 * holds no lesson content and no engine state, because the lesson catalogue
 * can be rewritten between builds and a stored copy of it would only go stale.
 */
export interface PersistedTutorial {
  readonly version: 2;
  /** Lessons the player has finished, in no particular order. */
  readonly completed: readonly LessonId[];
  /** True once the player has reached the end of the replayable lessons. */
  readonly finished: boolean;
  /**
   * The first-run walkthrough in progress (#33), or null when none is.
   *
   * `ONBOARDING_DESIGN.md` §3.3 settles the unit of resume as the **phase**,
   * not the step: a phase is a short deterministic scenario, so replaying one
   * from its start costs a few seconds and is always coherent, where storing
   * mid-scenario engine state would have to survive a schema change to stay
   * correct and would drop the learner into a half-finished position they have
   * lost the context for.
   *
   * The phase id is a bare string on purpose — the same reasoning as
   * `completed` below. A build that renames a phase must fall back to the
   * start of the walkthrough rather than fail to load.
   */
  readonly onboarding: {
    readonly path: OnboardingPath;
    readonly phase: string;
  } | null;
  /**
   * True once a first-run walkthrough has been finished or deliberately left.
   * It stops the walkthrough being re-offered; it never gates the table, and
   * the replayable lessons stay reachable from the menu either way.
   */
  readonly onboardingDone: boolean;
  /**
   * What the player has demonstrated they can do, for the scaffolding fade
   * (§7.3, `game/scaffold.ts`).
   *
   * Durable rather than per-hand on purpose: "you have thrown two tiles by
   * yourself" is a fact about the player, and re-teaching the discard gesture
   * at the start of every hand because the counter reset is exactly the
   * repetition §7.3 exists to stop.
   */
  readonly competence: {
    readonly unpromptedTurns: number;
    readonly hasClaimed: boolean;
  };
}

export const DEFAULT_TUTORIAL: PersistedTutorial = Object.freeze({
  version: 2,
  // Frozen as well as the object around it: this default is handed straight
  // back to every caller that has no saved progress, so a caller that pushed
  // onto it would be editing the default for everyone else in the session.
  completed: Object.freeze([]),
  finished: false,
  onboarding: null,
  onboardingDone: false,
  competence: Object.freeze({ unpromptedTurns: 0, hasClaimed: false }),
});

/**
 * What a tutorial blob has to look like before its contents are worth
 * inspecting. `completed` is checked only for being an array here — the ids
 * inside it are filtered afterwards rather than validated as a group, because
 * a single unrecognised id must not be grounds for discarding the blob.
 */
interface StoredTutorialShape {
  readonly version: 1 | 2;
  readonly completed: readonly unknown[];
  readonly finished: boolean;
  /** Absent in v1, and checked at the point of use rather than here. */
  readonly onboardingDone?: unknown;
  /** Absent in v1, and read defensively rather than validated here. */
  readonly competence?: unknown;
}

function isStoredTutorialShape(value: unknown): value is StoredTutorialShape {
  if (!isRecord(value)) return false;
  return (
    (value.version === 1 || value.version === 2) &&
    Array.isArray(value.completed) &&
    typeof value.finished === "boolean"
  );
}

/**
 * The stored competence counters, clamped and defaulted.
 *
 * Read leniently, like everything else in this module: a v1 blob has none, and
 * a nonsensical count costs the player a repeated sentence rather than their
 * progress. Clamped so a corrupt large value cannot be carried around forever.
 */
function readCompetence(value: unknown): PersistedTutorial["competence"] {
  const stored: unknown = isRecord(value) ? value.competence : null;
  if (!isRecord(stored)) return { unpromptedTurns: 0, hasClaimed: false };
  const turns = typeof stored.unpromptedTurns === "number" && Number.isFinite(stored.unpromptedTurns)
    ? Math.min(Math.max(Math.floor(stored.unpromptedTurns), 0), 9999)
    : 0;
  return {
    unpromptedTurns: turns,
    hasClaimed: stored.hasClaimed === true,
  };
}

function isOnboardingPath(value: unknown): value is OnboardingPath {
  return value === "novice" || value === "refresher";
}

/**
 * The stored walkthrough position, or null.
 *
 * Read leniently for the same reason lesson ids are: a v1 blob has no such
 * field, and a build that renames a phase must land the player at the start of
 * the walkthrough rather than refuse to load their progress. Neither case is
 * an error worth discarding the rest of the blob over.
 */
function readOnboarding(value: unknown): PersistedTutorial["onboarding"] {
  if (!isRecord(value)) return null;
  const stored: unknown = value.onboarding;
  if (!isRecord(stored)) return null;
  if (!isOnboardingPath(stored.path)) return null;
  if (typeof stored.phase !== "string" || stored.phase === "") return null;
  return { path: stored.path, phase: stored.phase };
}

/**
 * Keeps the lesson ids this build still recognises, in stored order, with
 * duplicates collapsed.
 *
 * Filtering rather than rejecting is the whole point. Lessons get renamed,
 * split and retired between builds, and a player who finished four of them
 * should not lose all four because the fifth no longer exists under that name.
 * Duplicates are dropped in the same pass so that a double-write by an earlier
 * build cannot make a lesson look completed twice to anything that counts.
 */
function keepKnownLessons(stored: readonly unknown[]): readonly LessonId[] {
  const known = new Set<LessonId>();
  for (const entry of stored) {
    if (isLessonId(entry)) known.add(entry);
  }
  return [...known];
}

export function loadTutorial(): PersistedTutorial {
  const raw = readRaw(TUTORIAL_KEY);
  if (raw === null) return DEFAULT_TUTORIAL;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isStoredTutorialShape(parsed)) {
      const onboarding = readOnboarding(parsed);
      return {
        version: 2,
        completed: keepKnownLessons(parsed.completed),
        finished: parsed.finished,
        onboarding,
        // A v1 blob predates the walkthrough entirely. Somebody who finished
        // the old five lessons has demonstrably been taught the game, so they
        // are not offered a first run; somebody who did not is treated as
        // having no walkthrough behind them, which is true.
        onboardingDone:
          typeof parsed.onboardingDone === "boolean" ? parsed.onboardingDone : parsed.finished,
        competence: readCompetence(parsed),
      };
    }
  } catch {
    // Fall through to the safe default below.
  }
  // The blob is not tutorial progress at all, so it is cleared rather than
  // left to fail validation again on every launch. Losing the record only
  // costs the player a repeated lesson; keeping it costs nothing but noise.
  removeRaw(TUTORIAL_KEY);
  return DEFAULT_TUTORIAL;
}

export function saveTutorial(progress: PersistedTutorial): void {
  writeRaw(TUTORIAL_KEY, JSON.stringify(progress));
}

export function clearTutorial(): void {
  removeRaw(TUTORIAL_KEY);
}
