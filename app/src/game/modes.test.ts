import { describe, expect, it } from "vitest";

import { newGame } from "@engine";

import { MODE_RULES, isTableMode } from "./modes";

describe("table modes", () => {
  it("moves exactly one rules axis between the two tables", () => {
    // The whole argument for Beginner is that it is the standard game with one
    // barrier removed. If a second axis ever moves, that claim needs re-making
    // and docs/DESIGN.md §20 needs revisiting — so it is asserted, not assumed.
    const { standard, beginner } = MODE_RULES;
    expect(beginner.minimumFaan).toBe(0);
    expect(standard.minimumFaan).toBe(1);
    expect(beginner.tileSetSize).toBe(standard.tileSetSize);
    expect(beginner.matchLength).toBe(standard.matchLength);
  });

  it("deals a real game under each profile", () => {
    // core.ts validates a profile by throwing RangeError. This guards against
    // a future engine change narrowing a value out from under the app.
    expect(() => newGame(MODE_RULES.beginner, "modes-beginner")).not.toThrow();
    expect(() => newGame(MODE_RULES.standard, "modes-standard")).not.toThrow();
  });

  it("recognises only the two modes it defines", () => {
    expect(isTableMode("beginner")).toBe(true);
    expect(isTableMode("standard")).toBe(true);
    expect(isTableMode("expert")).toBe(false);
    expect(isTableMode(null)).toBe(false);
  });
});
