import { DEFAULT_RULES_PROFILE, newGame, type GameRecord } from "@engine";
import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  appendCompletedGame,
  clearCurrentGame,
  loadCompletedGames,
  loadCurrentGame,
  loadSettings,
  saveCurrentGame,
  saveSettings,
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

beforeEach(() => {
  window.localStorage.clear();
});

describe("settings", () => {
  it("returns the default when nothing is stored", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips a saved value", () => {
    saveSettings({ version: 1, cornerLabel: "off", assistOn: false, explainOn: false });
    expect(loadSettings()).toEqual({
      version: 1,
      cornerLabel: "off",
      assistOn: false,
      explainOn: false,
    });
  });

  it("falls back to the default and clears the key on malformed JSON", () => {
    window.localStorage.setItem("mahjong:v1:settings", "{not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(window.localStorage.getItem("mahjong:v1:settings")).toBeNull();
  });

  it("falls back to the default for an unrecognised shape", () => {
    window.localStorage.setItem("mahjong:v1:settings", JSON.stringify({ version: 2 }));
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
