import type { GameRecord, RulesProfile } from "@engine";

import type { CornerLabelMode } from "../tiles/Tile";
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

/** Keeps history bounded on disk; stats read the whole list, so this is generous. */
const MAX_COMPLETED_GAMES = 500;

export interface PersistedSettings {
  readonly version: 2;
  readonly cornerLabel: CornerLabelMode;
  readonly assistOn: boolean;
  readonly explainOn: boolean;
  /**
   * Which table the player is on, or null when the one-time first-launch
   * question has never been answered.
   *
   * Deliberately one field rather than a mode plus a separate "has been
   * asked" boolean: two fields can disagree with each other, and "asked but
   * somehow unset" is not a state this app should be able to represent.
   */
  readonly mode: TableMode | null;
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
  version: 2,
  cornerLabel: "rank",
  assistOn: true,
  explainOn: true,
  mode: null,
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

function isPersistedSettings(value: unknown): value is PersistedSettings {
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

/**
 * Brings a stored blob of any known version up to the current shape, or
 * returns null when it is not a settings blob at all.
 *
 * The migration is not optional. `isPersistedSettings` is a strict shape
 * check, so without a v1 branch here every existing player's toggles would be
 * silently discarded and replaced with defaults the moment this build shipped.
 *
 * A v1 blob means someone who has already played this app, so they are put on
 * the standard table with the full claim set and are never shown the
 * new-player question: their table must not change under them because a new
 * version arrived.
 */
function migrateSettings(value: unknown): PersistedSettings | null {
  if (isPersistedSettings(value)) return value;
  if (isPersistedSettingsV1(value)) {
    return {
      version: 2,
      cornerLabel: value.cornerLabel,
      assistOn: value.assistOn,
      explainOn: value.explainOn,
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
