import { DEFAULT_RULES_PROFILE, newGame, type GameRecord } from "@engine";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SETTINGS,
  DEFAULT_TUTORIAL,
  appendCompletedGame,
  clearCurrentGame,
  clearTutorial,
  loadCompletedGames,
  loadCurrentGame,
  loadSettings,
  loadTutorial,
  saveCurrentGame,
  saveSettings,
  saveTutorial,
} from "./persistence";

/**
 * The storage boundary (#10). Every corrupt-data case here must fail safe —
 * a default value and untouched engine state — never a thrown error, since
 * this is the code standing between whatever a previous, possibly buggy,
 * build wrote to disk and the live table.
 */

function sampleRecord(overrides: Partial<GameRecord> = {}): GameRecord {
  const record = newGame(DEFAULT_RULES_PROFILE, "persistence-test").gameRecord();
  return { ...record, ...overrides };
}

/** The competence counters a player who has done nothing yet carries (§7.3). */
const NO_TURNS = { unpromptedTurns: 0, hasClaimed: false } as const;

beforeEach(() => {
  window.localStorage.clear();
});

describe("settings", () => {
  it("returns the default when nothing is stored", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips a saved value", () => {
    const saved = {
      version: 3,
      cornerLabel: "off",
      assistOn: false,
      explainOn: false,
      experience: "new",
      mode: "beginner",
      showAllClaims: false,
    } as const;
    saveSettings(saved);
    expect(loadSettings()).toEqual(saved);
  });

  it("keeps an unanswered first-launch question as an unanswered one", () => {
    // `experience: null` is a legitimate stored state, not corruption: it is
    // what "has never been asked" looks like on disk, and #33 moved that duty
    // off `mode` — a novice cannot answer a question about rules profiles, so
    // the field that records the answer is no longer a rules profile.
    saveSettings({ ...DEFAULT_SETTINGS, cornerLabel: "off" });
    expect(loadSettings().experience).toBeNull();
    expect(loadSettings().cornerLabel).toBe("off");
  });

  it("migrates a v1 blob onto the standard table, keeping its toggles", () => {
    // Someone with a v1 blob has already played this app. They must not be
    // asked the first-launch question, their table must not change under them,
    // and above all their existing toggles must survive the upgrade.
    window.localStorage.setItem(
      "mahjong:v1:settings",
      JSON.stringify({ version: 1, cornerLabel: "rank-suit", assistOn: false, explainOn: true }),
    );
    expect(loadSettings()).toEqual({
      version: 3,
      cornerLabel: "rank-suit",
      assistOn: false,
      explainOn: true,
      experience: "confident",
      mode: "standard",
      showAllClaims: true,
    });
  });

  it("migrates a v2 blob without re-asking or re-configuring anything", () => {
    // #33 makes this promise load-bearing rather than merely polite. The new
    // first run is a scripted walkthrough, and dropping somebody who has
    // played fifty hands into one because they updated the app would be the
    // worst possible reading of "we redesigned onboarding".
    window.localStorage.setItem(
      "mahjong:v1:settings",
      JSON.stringify({
        version: 2,
        cornerLabel: "off",
        assistOn: false,
        explainOn: false,
        mode: "beginner",
        showAllClaims: false,
      }),
    );
    expect(loadSettings()).toEqual({
      version: 3,
      cornerLabel: "off",
      assistOn: false,
      explainOn: false,
      // "Confident" is what an existing player is, whatever they answered to
      // the old question — and their stored table and aids are carried across
      // untouched rather than reset to that path's defaults.
      experience: "confident",
      mode: "beginner",
      showAllClaims: false,
    });
  });

  it("keeps a v2 blob that never answered the old question unanswered", () => {
    window.localStorage.setItem(
      "mahjong:v1:settings",
      JSON.stringify({
        version: 2,
        cornerLabel: "rank",
        assistOn: true,
        explainOn: true,
        mode: null,
        showAllClaims: true,
      }),
    );
    expect(loadSettings().experience).toBeNull();
  });

  it("falls back to the default and clears the key on malformed JSON", () => {
    window.localStorage.setItem("mahjong:v1:settings", "{not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(window.localStorage.getItem("mahjong:v1:settings")).toBeNull();
  });

  it("falls back to the default for an unrecognised shape", () => {
    window.localStorage.setItem("mahjong:v1:settings", JSON.stringify({ version: 99 }));
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back to the default for an unknown mode", () => {
    window.localStorage.setItem(
      "mahjong:v1:settings",
      JSON.stringify({
        version: 3,
        cornerLabel: "rank",
        assistOn: true,
        explainOn: true,
        experience: "confident",
        mode: "expert",
        showAllClaims: true,
      }),
    );
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back to the default for an unknown experience path", () => {
    window.localStorage.setItem(
      "mahjong:v1:settings",
      JSON.stringify({
        version: 3,
        cornerLabel: "rank",
        assistOn: true,
        explainOn: true,
        experience: "expert",
        mode: "standard",
        showAllClaims: true,
      }),
    );
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back to the default when a field has the wrong type", () => {
    window.localStorage.setItem(
      "mahjong:v1:settings",
      JSON.stringify({ version: 1, cornerLabel: "rank", assistOn: "yes", explainOn: true }),
    );
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("current game", () => {
  it("is absent by default", () => {
    expect(loadCurrentGame()).toBeNull();
  });

  it("round-trips a saved record", () => {
    const record = sampleRecord();
    saveCurrentGame(record);
    expect(loadCurrentGame()).toEqual(record);
  });

  it("clears on request", () => {
    saveCurrentGame(sampleRecord());
    clearCurrentGame();
    expect(loadCurrentGame()).toBeNull();
  });

  it("discards malformed JSON rather than throwing", () => {
    window.localStorage.setItem("mahjong:v1:current-game", "{not json");
    expect(loadCurrentGame()).toBeNull();
    expect(window.localStorage.getItem("mahjong:v1:current-game")).toBeNull();
  });

  it("discards a record missing required fields", () => {
    window.localStorage.setItem(
      "mahjong:v1:current-game",
      JSON.stringify({ version: 1, seed: "x" }),
    );
    expect(loadCurrentGame()).toBeNull();
  });

  it("discards a record with an incompatible version", () => {
    const record = sampleRecord();
    window.localStorage.setItem(
      "mahjong:v1:current-game",
      JSON.stringify({ ...record, version: 99 }),
    );
    expect(loadCurrentGame()).toBeNull();
  });
});

describe("completed games", () => {
  it("is an empty list by default", () => {
    expect(loadCompletedGames()).toEqual([]);
  });

  it("appends and reads back a completed record", () => {
    const record = sampleRecord({ completed: true });
    appendCompletedGame(record);
    expect(loadCompletedGames()).toEqual([record]);
  });

  it("keeps accumulating across multiple appends", () => {
    const first = sampleRecord({ completed: true, seed: "one" });
    const second = sampleRecord({ completed: true, seed: "two" });
    appendCompletedGame(first);
    appendCompletedGame(second);
    expect(loadCompletedGames()).toEqual([first, second]);
  });

  it("resets to empty rather than throwing on malformed JSON", () => {
    window.localStorage.setItem("mahjong:v1:completed-games", "{not json");
    expect(loadCompletedGames()).toEqual([]);
    expect(window.localStorage.getItem("mahjong:v1:completed-games")).toBeNull();
  });

  it("resets to empty when the stored value is not an array", () => {
    window.localStorage.setItem("mahjong:v1:completed-games", JSON.stringify({ not: "an array" }));
    expect(loadCompletedGames()).toEqual([]);
  });

  it("drops only the individually-corrupt entries, keeping the rest", () => {
    const good = sampleRecord({ completed: true });
    window.localStorage.setItem(
      "mahjong:v1:completed-games",
      JSON.stringify([good, { version: 1, seed: "broken" }, null, 42]),
    );
    expect(loadCompletedGames()).toEqual([good]);
  });

  it("caps history at the retention limit, dropping the oldest first", () => {
    const cap = 500;
    const overflowing = Array.from({ length: cap }, (_, index) =>
      sampleRecord({ completed: true, seed: `seed-${String(index)}` }),
    );
    window.localStorage.setItem("mahjong:v1:completed-games", JSON.stringify(overflowing));
    const newest = sampleRecord({ completed: true, seed: "newest" });
    const result = appendCompletedGame(newest);
    expect(result).toHaveLength(cap);
    expect(result[result.length - 1]).toEqual(newest);
    expect(result.some((record) => record.seed === "seed-0")).toBe(false);
  });
});

describe("tutorial progress", () => {
  it("starts every player at the beginning when nothing is stored", () => {
    expect(loadTutorial()).toEqual({
      version: 2,
      completed: [],
      finished: false,
      onboarding: null,
      onboardingDone: false,
      competence: NO_TURNS,
    });
    expect(loadTutorial()).toEqual(DEFAULT_TUTORIAL);
  });

  it("round-trips saved progress", () => {
    saveTutorial({ version: 2, onboarding: null, onboardingDone: false, competence: NO_TURNS, completed: ["shape", "turn"], finished: false });
    expect(loadTutorial()).toEqual({
      version: 2,
      completed: ["shape", "turn"],
      finished: false,
      onboarding: null,
      onboardingDone: false,
      competence: NO_TURNS,
    });
  });

  it("round-trips a finished course", () => {
    saveTutorial({
      version: 2,
      completed: ["shape", "turn", "improve", "claims", "win"],
      finished: true,
      onboarding: null,
      onboardingDone: true,
      competence: NO_TURNS,
    });
    expect(loadTutorial().finished).toBe(true);
  });

  it("round-trips a walkthrough left in the middle", () => {
    // §3.3: the unit of resume is the phase, so this is the whole of what has
    // to survive a kill — which path, and which phase of it.
    saveTutorial({
      version: 2,
      completed: [],
      finished: false,
      onboarding: { path: "novice", phase: "claim" },
      onboardingDone: false,
      competence: NO_TURNS,
    });
    expect(loadTutorial().onboarding).toEqual({ path: "novice", phase: "claim" });
  });

  it("drops a walkthrough position it cannot place, keeping the rest", () => {
    // A phase renamed between builds costs the learner a restart of a
    // two-minute walkthrough. Refusing to load their progress would cost more.
    window.localStorage.setItem(
      "mahjong:v1:tutorial",
      JSON.stringify({
        version: 2,
        completed: ["shape"],
        finished: false,
        onboarding: { path: "novice", phase: 7 },
        onboardingDone: false,
      }),
    );
    expect(loadTutorial().onboarding).toBeNull();
    expect(loadTutorial().completed).toEqual(["shape"]);
  });

  it("treats a v1 blob that finished the course as having been taught", () => {
    // v1 predates the walkthrough entirely. Somebody who finished the old five
    // lessons has demonstrably been taught the game and is not offered a first
    // run; somebody who did not is treated as having no walkthrough behind
    // them, which is true.
    window.localStorage.setItem(
      "mahjong:v1:tutorial",
      JSON.stringify({ version: 1, completed: ["shape"], finished: true }),
    );
    expect(loadTutorial().onboardingDone).toBe(true);
    window.localStorage.setItem(
      "mahjong:v1:tutorial",
      JSON.stringify({ version: 1, completed: ["shape"], finished: false }),
    );
    expect(loadTutorial().onboardingDone).toBe(false);
  });

  it("falls back to the default and clears the key on malformed JSON", () => {
    window.localStorage.setItem("mahjong:v1:tutorial", "{not json");
    expect(loadTutorial()).toEqual(DEFAULT_TUTORIAL);
    expect(window.localStorage.getItem("mahjong:v1:tutorial")).toBeNull();
  });

  it("falls back to the default for an incompatible version", () => {
    window.localStorage.setItem(
      "mahjong:v1:tutorial",
      JSON.stringify({ version: 9, completed: ["shape"], finished: false }),
    );
    expect(loadTutorial()).toEqual(DEFAULT_TUTORIAL);
    expect(window.localStorage.getItem("mahjong:v1:tutorial")).toBeNull();
  });

  it("falls back to the default when completed is not an array", () => {
    window.localStorage.setItem(
      "mahjong:v1:tutorial",
      JSON.stringify({ version: 1, completed: "shape", finished: false }),
    );
    expect(loadTutorial()).toEqual(DEFAULT_TUTORIAL);
  });

  it("falls back to the default when finished is not a boolean", () => {
    window.localStorage.setItem(
      "mahjong:v1:tutorial",
      JSON.stringify({ version: 1, completed: [], finished: "yes" }),
    );
    expect(loadTutorial()).toEqual(DEFAULT_TUTORIAL);
  });

  it("drops lesson ids this build no longer knows, keeping the rest", () => {
    // A lesson renamed or retired in a later build must cost the player that
    // one lesson, not the whole record of what they have already learned.
    window.localStorage.setItem(
      "mahjong:v1:tutorial",
      JSON.stringify({
        version: 1,
        completed: ["shape", "flowers-and-seasons", "win", 7, null],
        finished: false,
      }),
    );
    expect(loadTutorial()).toEqual({
      version: 2,
      completed: ["shape", "win"],
      finished: false,
      onboarding: null,
      onboardingDone: false,
      competence: NO_TURNS,
    });
  });

  it("collapses duplicate lesson ids", () => {
    window.localStorage.setItem(
      "mahjong:v1:tutorial",
      JSON.stringify({ version: 1, completed: ["turn", "turn", "shape", "turn"], finished: false }),
    );
    expect(loadTutorial().completed).toEqual(["turn", "shape"]);
  });

  it("resets to the default on request", () => {
    saveTutorial({ version: 2, onboarding: null, onboardingDone: false, competence: NO_TURNS, completed: ["shape"], finished: true });
    clearTutorial();
    expect(loadTutorial()).toEqual(DEFAULT_TUTORIAL);
  });

  it("does not throw out of a save when storage refuses the write", () => {
    // A full or disabled store costs the player their progress on the next
    // reload; it must never interrupt the lesson they are in the middle of.
    // Spied on the prototype rather than on `window.localStorage`: jsdom's
    // storage object is a proxy that turns a property definition into a stored
    // item, so patching the instance would quietly leave the real method in
    // place and the test would prove nothing.
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    try {
      expect(() => {
        saveTutorial({ version: 2, onboarding: null, onboardingDone: false, competence: NO_TURNS, completed: ["shape"], finished: false });
      }).not.toThrow();
    } finally {
      setItem.mockRestore();
    }
    expect(loadTutorial()).toEqual(DEFAULT_TUTORIAL);
  });
});
