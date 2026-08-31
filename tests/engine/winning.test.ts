import { describe, expect, it } from "vitest";

import { createTileSet } from "../../src/engine/tiles.js";
import {
  canStructurallyWin,
  enumerateWinningStructures,
} from "../../src/engine/winning.js";
import type {
  Meld,
  OrdinaryTileKind,
  Tile,
} from "../../src/engine/types.js";

function tiles(...kinds: OrdinaryTileKind[]): Tile[] {
  const inventory = createTileSet(136);
  const used = new Set<Tile["id"]>();

  return kinds.map((kind) => {
    const tile = inventory.find(
      (candidate) => candidate.kind === kind && !used.has(candidate.id),
    );
    if (tile === undefined) {
      throw new RangeError(`No unused physical tile remains for ${kind}`);
    }
    used.add(tile.id);
    return tile;
  });
}

function finalTile(hand: readonly Tile[]): Tile {
  const tile = hand.at(-1);
  if (tile === undefined) {
    throw new RangeError("A winning hand must contain a final tile");
  }
  return tile;
}

describe("winning-structure enumeration", () => {
  it("RULE-WIN-1 recognises a standard four-set-and-pair hand", () => {
    const concealed = tiles(
      "characters-1",
      "characters-2",
      "characters-3",
      "bamboo-2",
      "bamboo-3",
      "bamboo-4",
      "dots-7",
      "dots-8",
      "dots-9",
      "wind-east",
      "wind-east",
      "wind-east",
      "dragon-red",
      "dragon-red",
    );

    expect(enumerateWinningStructures(concealed, [])).toEqual([
      {
        type: "standard",
        pair: "dragon-red",
        sets: [
          {
            type: "chow",
            tiles: ["characters-1", "characters-2", "characters-3"],
          },
          {
            type: "chow",
            tiles: ["bamboo-2", "bamboo-3", "bamboo-4"],
          },
          {
            type: "chow",
            tiles: ["dots-7", "dots-8", "dots-9"],
          },
          { type: "pung", tile: "wind-east" },
        ],
      },
    ]);
    expect(canStructurallyWin(concealed, [])).toBe(true);
  });

  it("RULE-WIN-1 adjusts the concealed structure for an exposed meld", () => {
    const exposedKong: Meld = {
      type: "kong",
      exposure: "exposed",
      tiles: tiles("dragon-red", "dragon-red", "dragon-red", "dragon-red"),
      claimedFrom: 2,
    };
    const completeHand = tiles(
      "characters-1",
      "characters-2",
      "characters-3",
      "bamboo-4",
      "bamboo-5",
      "bamboo-6",
      "wind-south",
      "wind-south",
      "wind-south",
      "dragon-green",
      "dragon-green",
    );
    const concealed = completeHand.slice(0, -1);
    const addedTile = finalTile(completeHand);

    expect(enumerateWinningStructures(concealed, [exposedKong], addedTile)).toEqual([
      {
        type: "standard",
        pair: "dragon-green",
        sets: [
          {
            type: "chow",
            tiles: ["characters-1", "characters-2", "characters-3"],
          },
          {
            type: "chow",
            tiles: ["bamboo-4", "bamboo-5", "bamboo-6"],
          },
          { type: "pung", tile: "wind-south" },
        ],
      },
    ]);
  });

  it("RULE-WIN-1 recognises Thirteen Orphans and records its duplicate", () => {
    const completeHand = tiles(
      "characters-1",
      "characters-9",
      "bamboo-1",
      "bamboo-9",
      "dots-1",
      "dots-9",
      "wind-east",
      "wind-south",
      "wind-west",
      "wind-north",
      "dragon-red",
      "dragon-green",
      "dragon-white",
      "bamboo-9",
    );
    const concealed = completeHand.slice(0, -1);
    const addedTile = finalTile(completeHand);

    expect(enumerateWinningStructures(concealed, [], addedTile)).toEqual([
      { type: "thirteen-orphans", pair: "bamboo-9" },
    ]);
    expect(canStructurallyWin(concealed, [], addedTile)).toBe(true);
  });

  it("RULE-WIN-2 excludes a Seven Pairs-only shape", () => {
    const concealed = tiles(
      "characters-1",
      "characters-1",
      "characters-4",
      "characters-4",
      "characters-7",
      "characters-7",
      "bamboo-2",
      "bamboo-2",
      "bamboo-5",
      "bamboo-5",
      "dots-3",
      "dots-3",
      "wind-east",
      "wind-east",
    );

    expect(enumerateWinningStructures(concealed, [])).toEqual([]);
    expect(canStructurallyWin(concealed, [])).toBe(false);
  });

  it("RULE-WIN-2 excludes an unrelated non-HKOS shape", () => {
    const concealed = tiles(
      "characters-1",
      "characters-2",
      "characters-4",
      "characters-5",
      "characters-7",
      "characters-8",
      "bamboo-1",
      "bamboo-4",
      "bamboo-7",
      "dots-2",
      "dots-5",
      "dots-8",
      "wind-west",
      "dragon-white",
    );

    expect(enumerateWinningStructures(concealed, [])).toEqual([]);
    expect(canStructurallyWin(concealed, [])).toBe(false);
  });

  it("RULE-WIN-3 detects every Nine Gates wait as a standard structure", () => {
    const base: readonly OrdinaryTileKind[] = [
      "characters-1",
      "characters-1",
      "characters-1",
      "characters-2",
      "characters-3",
      "characters-4",
      "characters-5",
      "characters-6",
      "characters-7",
      "characters-8",
      "characters-9",
      "characters-9",
      "characters-9",
    ];
    const possibleAdditions: readonly OrdinaryTileKind[] = [
      "characters-1",
      "characters-2",
      "characters-3",
      "characters-4",
      "characters-5",
      "characters-6",
      "characters-7",
      "characters-8",
      "characters-9",
    ];

    for (const addition of possibleAdditions) {
      const structures = enumerateWinningStructures(tiles(...base, addition), []);

      expect(structures.length, addition).toBeGreaterThan(0);
      expect(
        structures.every((structure) => structure.type === "standard"),
        addition,
      ).toBe(true);
    }
  });

  it("RULE-WIN-4 enumerates ambiguous readings in a stable pung-before-chow order", () => {
    const concealed = tiles(
      "characters-1",
      "characters-1",
      "characters-1",
      "characters-2",
      "characters-2",
      "characters-2",
      "characters-3",
      "characters-3",
      "characters-3",
      "bamboo-4",
      "bamboo-5",
      "bamboo-6",
      "wind-east",
      "wind-east",
    );
    const expected = [
      {
        type: "standard",
        pair: "wind-east",
        sets: [
          { type: "pung", tile: "characters-1" },
          { type: "pung", tile: "characters-2" },
          { type: "pung", tile: "characters-3" },
          {
            type: "chow",
            tiles: ["bamboo-4", "bamboo-5", "bamboo-6"],
          },
        ],
      },
      {
        type: "standard",
        pair: "wind-east",
        sets: [
          {
            type: "chow",
            tiles: ["characters-1", "characters-2", "characters-3"],
          },
          {
            type: "chow",
            tiles: ["characters-1", "characters-2", "characters-3"],
          },
          {
            type: "chow",
            tiles: ["characters-1", "characters-2", "characters-3"],
          },
          {
            type: "chow",
            tiles: ["bamboo-4", "bamboo-5", "bamboo-6"],
          },
        ],
      },
    ];

    expect(enumerateWinningStructures(concealed, [])).toEqual(expected);
    expect(enumerateWinningStructures(concealed, [])).toEqual(expected);
  });
});
