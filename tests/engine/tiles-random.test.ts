import { describe, expect, it } from "vitest";

import { createSeededRandom, shuffleTiles } from "../../src/engine/random.js";
import {
  BONUS_TILE_KINDS,
  ORDINARY_TILE_KINDS,
  compareTileKinds,
  createTileSet,
  isBonusKind,
  isBonusTile,
  isSuitedKind,
  parseSuitedKind,
  seatOwnsBonus,
} from "../../src/engine/tiles.js";

describe("canonical tile inventory", () => {
  it("creates exactly four copies of every ordinary kind and one of every bonus kind", () => {
    const tiles = createTileSet(144);
    const counts = new Map<string, number>();

    for (const tile of tiles) {
      counts.set(tile.kind, (counts.get(tile.kind) ?? 0) + 1);
    }

    expect(tiles).toHaveLength(144);
    expect(new Set(tiles.map((tile) => tile.id))).toHaveLength(144);
    expect(ORDINARY_TILE_KINDS).toHaveLength(34);
    expect(BONUS_TILE_KINDS).toHaveLength(8);

    for (const kind of ORDINARY_TILE_KINDS) {
      expect(counts.get(kind), kind).toBe(4);
    }
    for (const kind of BONUS_TILE_KINDS) {
      expect(counts.get(kind), kind).toBe(1);
    }
  });

  it("omits every bonus without changing the stable ordinary prefix in the 136 setting", () => {
    const fullSet = createTileSet(144);
    const ordinarySet = createTileSet(136);

    expect(ordinarySet).toHaveLength(136);
    expect(ordinarySet).toEqual(fullSet.slice(0, 136));
    expect(ordinarySet.some(isBonusTile)).toBe(false);
  });

  it("uses stable kind and physical-ID order", () => {
    const tiles = createTileSet(144);

    expect(tiles.slice(0, 6)).toEqual([
      { id: "characters-1-1", kind: "characters-1" },
      { id: "characters-1-2", kind: "characters-1" },
      { id: "characters-1-3", kind: "characters-1" },
      { id: "characters-1-4", kind: "characters-1" },
      { id: "characters-2-1", kind: "characters-2" },
      { id: "characters-2-2", kind: "characters-2" },
    ]);
    expect(tiles.slice(-10)).toEqual([
      { id: "dragon-white-3", kind: "dragon-white" },
      { id: "dragon-white-4", kind: "dragon-white" },
      { id: "flower-1-1", kind: "flower-1" },
      { id: "flower-2-1", kind: "flower-2" },
      { id: "flower-3-1", kind: "flower-3" },
      { id: "flower-4-1", kind: "flower-4" },
      { id: "season-1-1", kind: "season-1" },
      { id: "season-2-1", kind: "season-2" },
      { id: "season-3-1", kind: "season-3" },
      { id: "season-4-1", kind: "season-4" },
    ]);
  });
});

describe("tile helpers", () => {
  it("classifies and parses suited and bonus kinds", () => {
    expect(isSuitedKind("dots-7")).toBe(true);
    expect(parseSuitedKind("dots-7")).toEqual({ suit: "dots", rank: 7 });
    expect(isSuitedKind("wind-east")).toBe(false);
    expect(parseSuitedKind("wind-east")).toBeNull();
    expect(isBonusKind("flower-4")).toBe(true);
    expect(isBonusKind("dragon-red")).toBe(false);
  });

  it("sorts kinds canonically and matches bonuses to the current seat wind", () => {
    const kinds = ["season-1", "dots-1", "characters-9", "wind-east"] as const;

    expect([...kinds].sort(compareTileKinds)).toEqual([
      "characters-9",
      "dots-1",
      "wind-east",
      "season-1",
    ]);
    expect(seatOwnsBonus("east", "flower-1")).toBe(true);
    expect(seatOwnsBonus("east", "season-1")).toBe(true);
    expect(seatOwnsBonus("east", "flower-2")).toBe(false);
    expect(seatOwnsBonus("north", "season-4")).toBe(true);
    expect(seatOwnsBonus("north", "dragon-white")).toBe(false);
  });
});

describe("deterministic random and shuffle", () => {
  it("produces a stable sequence for the same string seed", () => {
    const first = createSeededRandom("RULE-DET-1");
    const second = createSeededRandom("RULE-DET-1");

    const expectedPrefix = [
      3_602_516_730,
      73_050_814,
      2_021_861_838,
      23_963_382,
      505_192_240,
      648_752_394,
      3_302_489_409,
      3_702_488_004,
    ];

    expect(Array.from({ length: expectedPrefix.length }, () => first.nextUint32())).toEqual(
      expectedPrefix,
    );
    expect(Array.from({ length: expectedPrefix.length }, () => second.nextUint32())).toEqual(
      expectedPrefix,
    );
  });

  it("produces different walls for different seeds", () => {
    const tiles = createTileSet(144);

    expect(shuffleTiles(tiles, "first seed")).not.toEqual(shuffleTiles(tiles, "second seed"));
  });

  it("shuffles the same seed byte-identically and preserves every physical tile", () => {
    const tiles = createTileSet(144);
    const first = shuffleTiles(tiles, "wall seed");
    const second = shuffleTiles(tiles, "wall seed");

    expect(first).toEqual(second);
    expect([...first].sort((left, right) => left.id.localeCompare(right.id))).toEqual(
      [...tiles].sort((left, right) => left.id.localeCompare(right.id)),
    );
  });

  it("does not mutate the input array", () => {
    const tiles = createTileSet(144);
    const before = [...tiles];
    const shuffled = shuffleTiles(tiles, "immutable input");

    expect(tiles).toEqual(before);
    expect(shuffled).not.toBe(tiles);
  });

  it("rejects invalid integer bounds", () => {
    const random = createSeededRandom("bounds");

    expect(() => random.nextInt(0)).toThrow(RangeError);
    expect(() => random.nextInt(1.5)).toThrow(RangeError);
    expect(() => random.nextInt(0x1_0000_0001)).toThrow(RangeError);
  });
});
