import { describe, expect, it } from "vitest";

import {
  evaluateWinningHand,
  meetsMinimumFaan,
  scoreInstantBonusWin,
} from "../../src/engine/scoring.js";
import type {
  FaanBreakdown,
  Meld,
  PlayerState,
  RulesProfile,
  Seat,
  Tile,
  TileId,
  TileKind,
  WinHandResult,
  WinSource,
  Wind,
} from "../../src/engine/types.js";

const PROFILE_136: RulesProfile = {
  tileSetSize: 136,
  minimumFaan: 1,
  matchLength: "east-round",
};
const PROFILE_144: RulesProfile = { ...PROFILE_136, tileSetSize: 144 };

let serial = 0;

function tile(kind: TileKind): Tile {
  serial += 1;
  return { id: `${kind}-${String(serial)}` as TileId, kind };
}

function meld(
  type: Meld["type"],
  kinds: readonly TileKind[],
  exposure: Meld["exposure"] = "exposed",
): Meld {
  return {
    type,
    exposure,
    tiles: kinds.map(tile),
    claimedFrom: exposure === "exposed" ? 3 : null,
  };
}

function player(
  concealed: readonly TileKind[],
  melds: readonly Meld[] = [],
  bonuses: readonly TileKind[] = [],
  seat: Seat = 1,
): PlayerState {
  return {
    seat,
    concealed: concealed.map(tile),
    melds,
    bonuses: bonuses.map(tile),
    score: 0,
  };
}

interface ScoreOptions {
  readonly concealed: readonly TileKind[];
  readonly melds?: readonly Meld[];
  readonly bonuses?: readonly TileKind[];
  readonly profile?: RulesProfile;
  readonly winner?: Seat;
  readonly dealer?: Seat;
  readonly roundWind?: Wind;
  readonly source?: WinSource;
  readonly added?: TileKind;
  readonly circumstances?: Partial<WinHandResult["circumstances"]>;
}

function score(options: ScoreOptions): FaanBreakdown {
  serial = 0;
  const winner = options.winner ?? 1;
  const dealer = options.dealer ?? 0;
  const source = options.source ?? "self-draw";
  const addedTile = options.added === undefined ? null : tile(options.added);
  const hand = player(options.concealed, options.melds ?? [], options.bonuses ?? [], winner);
  const fromSeat = source === "discard" || source === "robbed-kong" ? dealer : null;
  const evaluation = evaluateWinningHand(
    {
      profile: options.profile ?? PROFILE_136,
      player: hand,
      winner,
      dealer,
      roundWind: options.roundWind ?? "west",
      source,
      fromSeat,
      winningTile: addedTile ?? hand.concealed.at(-1) ?? null,
      circumstances: {
        lastWallTile: false,
        lastDiscard: false,
        openingDealerHand: false,
        dealerFirstDiscard: false,
        ...options.circumstances,
      },
    },
    addedTile,
  );
  expect(evaluation).not.toBeNull();
  if (evaluation === null) {
    throw new Error("Expected a scoring evaluation");
  }
  return evaluation.scoring;
}

function ids(scoring: FaanBreakdown): readonly string[] {
  return scoring.items.map((entry) => entry.id);
}

const COMMON_HAND = [
  "characters-1", "characters-2", "characters-3",
  "bamboo-1", "bamboo-2", "bamboo-3",
  "dots-1", "dots-2", "dots-3",
  "characters-4", "characters-5", "characters-6",
  "dots-5", "dots-5",
] as const satisfies readonly TileKind[];

const ALL_TRIPLETS = [
  "characters-2", "characters-2", "characters-2",
  "bamboo-3", "bamboo-3", "bamboo-3",
  "dots-4", "dots-4", "dots-4",
  "characters-7", "characters-7", "characters-7",
  "bamboo-6", "bamboo-6",
] as const satisfies readonly TileKind[];

describe("HKOS scoring patterns", () => {
  it("A1 Common Hand and RULE-FAAN-G1 distinguish all-chow from all-triplet hands", () => {
    expect(ids(score({ concealed: COMMON_HAND }))).toContain("A1");
    expect(ids(score({ concealed: COMMON_HAND }))).not.toContain("A2");
    expect(ids(score({ concealed: ALL_TRIPLETS }))).toContain("A2");
    expect(ids(score({ concealed: ALL_TRIPLETS }))).not.toContain("A1");
  });

  it("A3 Mixed One Suit scores exactly one suit plus honours", () => {
    const scoring = score({ concealed: [
      "characters-1", "characters-2", "characters-3",
      "characters-4", "characters-5", "characters-6",
      "characters-7", "characters-8", "characters-9",
      "dragon-red", "dragon-red", "dragon-red",
      "wind-east", "wind-east",
    ] });
    expect(ids(scoring)).toContain("A3");
    expect(ids(scoring)).not.toContain("A4");
  });

  it("A4 All One Suit and RULE-FAAN-G2 exclude Mixed One Suit", () => {
    const scoring = score({ concealed: [
      "characters-1", "characters-1", "characters-1",
      "characters-2", "characters-3", "characters-4",
      "characters-5", "characters-6", "characters-7",
      "characters-7", "characters-8", "characters-9",
      "characters-5", "characters-5",
    ] });
    expect(ids(scoring)).toContain("A4");
    expect(ids(scoring)).not.toContain("A3");
  });

  it("RECON-2: A5 Small Three Dragons itemises 3 faan plus two B1 dragon melds", () => {
    const scoring = score({ concealed: [
      "dragon-red", "dragon-red", "dragon-red",
      "dragon-green", "dragon-green", "dragon-green",
      "dragon-white", "dragon-white",
      "characters-1", "characters-2", "characters-3",
      "bamboo-4", "bamboo-5", "bamboo-6",
    ] });
    expect(scoring.items.find((entry) => entry.id === "A5")?.faan).toBe(3);
    expect(ids(scoring).filter((id) => id.startsWith("B1-"))).toHaveLength(2);
    expect(ids(scoring)).not.toContain("A6");
  });

  it("RECON-3 and RULE-FAAN-G6/G8: Great Three Dragons is 8, excludes A5 and stacks with all B1", () => {
    const scoring = score({
      concealed: ["characters-1", "characters-2", "characters-3", "bamboo-5", "bamboo-5"],
      melds: [
        meld("pung", ["dragon-red", "dragon-red", "dragon-red"]),
        meld("pung", ["dragon-green", "dragon-green", "dragon-green"]),
        meld("pung", ["dragon-white", "dragon-white", "dragon-white"]),
      ],
      source: "discard",
    });
    expect(scoring.items.find((entry) => entry.id === "A6")?.faan).toBe(8);
    expect(ids(scoring)).not.toContain("A5");
    expect(ids(scoring).filter((id) => id.startsWith("B1-"))).toHaveLength(3);
    expect(scoring.totalFaan).toBe(11);
  });

  it("RECON-4: A7 Small Four Winds is a 6-faan stacking item rather than a limit", () => {
    const scoring = score({
      concealed: ["characters-1", "characters-2", "characters-3", "wind-north", "wind-north"],
      melds: [
        meld("pung", ["wind-east", "wind-east", "wind-east"]),
        meld("pung", ["wind-south", "wind-south", "wind-south"]),
        meld("pung", ["wind-west", "wind-west", "wind-west"]),
      ],
      source: "discard",
      roundWind: "north",
    });
    expect(scoring.items.find((entry) => entry.id === "A7")?.faan).toBe(6);
    expect(scoring.limitHand).toBeNull();
  });

  it("RECON-5 and RULE-FAAN-G7: A8 Great Four Winds is 8 and excludes A7", () => {
    const scoring = score({
      concealed: ["dragon-red", "dragon-red"],
      melds: [
        meld("pung", ["wind-east", "wind-east", "wind-east"]),
        meld("pung", ["wind-south", "wind-south", "wind-south"]),
        meld("pung", ["wind-west", "wind-west", "wind-west"]),
        meld("pung", ["wind-north", "wind-north", "wind-north"]),
      ],
      source: "discard",
    });
    expect(scoring.items.find((entry) => entry.id === "A8")?.faan).toBe(8);
    expect(ids(scoring)).not.toContain("A7");
    expect(scoring.limitHand).toBeNull();
  });

  it("RECON-6 and RULE-FAAN-G3/G4: All Honours is 10 and is not a flush or terminals pattern", () => {
    const scoring = score({ concealed: [
      "wind-east", "wind-east", "wind-east",
      "wind-south", "wind-south", "wind-south",
      "wind-west", "wind-west", "wind-west",
      "dragon-red", "dragon-red", "dragon-red",
      "dragon-white", "dragon-white",
    ] });
    expect(scoring.items.find((entry) => entry.id === "A9")?.faan).toBe(10);
    expect(ids(scoring)).not.toContain("A3");
    expect(ids(scoring)).not.toContain("A4");
    expect(ids(scoring)).not.toContain("A10");
    expect(ids(scoring)).not.toContain("A11");
    expect(scoring.totalFaan).toBe(13);
  });

  it("RECON-7 and RULE-FAAN-G5: Mixed Terminals & Honours is 10 and not All Terminals", () => {
    const scoring = score({ concealed: [
      "characters-1", "characters-1", "characters-1",
      "bamboo-9", "bamboo-9", "bamboo-9",
      "wind-north", "wind-north", "wind-north",
      "dragon-red", "dragon-red", "dragon-red",
      "dots-1", "dots-1",
    ] });
    expect(scoring.items.find((entry) => entry.id === "A10")?.faan).toBe(10);
    expect(ids(scoring)).not.toContain("A11");
  });

  it("RECON-8: All Terminals is 10 and stacks naturally to the ceiling", () => {
    const scoring = score({ concealed: [
      "characters-1", "characters-1", "characters-1",
      "characters-9", "characters-9", "characters-9",
      "bamboo-1", "bamboo-1", "bamboo-1",
      "dots-9", "dots-9", "dots-9",
      "bamboo-9", "bamboo-9",
    ] });
    expect(scoring.items.find((entry) => entry.id === "A11")?.faan).toBe(10);
    expect(scoring.totalFaan).toBe(13);
  });

  it("B1 Dragon Pung/Kong scores one faan for each dragon meld", () => {
    const scoring = score({ concealed: [
      "dragon-red", "dragon-red", "dragon-red",
      "characters-1", "characters-2", "characters-3",
      "bamboo-1", "bamboo-2", "bamboo-3",
      "dots-1", "dots-2", "dots-3",
      "characters-5", "characters-5",
    ] });
    expect(ids(scoring).filter((id) => id.startsWith("B1-"))).toEqual(["B1-dragon-red"]);
  });

  it("RULE-FAAN-B1 and RULE-FAAN-G9: one wind pung scores both Seat Wind and Round Wind", () => {
    const scoring = score({
      concealed: [
        "wind-south", "wind-south", "wind-south",
        "characters-1", "characters-2", "characters-3",
        "bamboo-1", "bamboo-2", "bamboo-3",
        "dots-1", "dots-2", "dots-3",
        "characters-5", "characters-5",
      ],
      winner: 1,
      dealer: 0,
      roundWind: "south",
    });
    expect(ids(scoring)).toContain("B2");
    expect(ids(scoring)).toContain("B3");
  });

  it("C1 Self-Draw scores on a self-drawn win", () => {
    expect(ids(score({ concealed: COMMON_HAND, source: "self-draw" }))).toContain("C1");
  });

  it("C2 Fully Concealed Hand permits a concealed kong", () => {
    const scoring = score({
      concealed: [
        "bamboo-1", "bamboo-2", "bamboo-3",
        "dots-1", "dots-2", "dots-3",
        "characters-4", "characters-5", "characters-6",
        "wind-north", "wind-north",
      ],
      melds: [meld("kong", ["characters-2", "characters-2", "characters-2", "characters-2"], "concealed")],
    });
    expect(ids(scoring)).toContain("C2");
  });

  it("C3 and RULE-FAAN-G12: last-wall self-draw stacks with Self-Draw", () => {
    const scoring = score({ concealed: COMMON_HAND, circumstances: { lastWallTile: true } });
    expect(ids(scoring)).toContain("C1");
    expect(ids(scoring)).toContain("C3");
  });

  it("RECON-12 / C4: last discard scores 河底撈魚", () => {
    const scoring = score({
      concealed: COMMON_HAND.slice(0, 13),
      source: "discard",
      added: COMMON_HAND[13],
      circumstances: { lastDiscard: true },
    });
    expect(ids(scoring)).toContain("C4");
    expect(ids(scoring)).not.toContain("C3");
  });

  it("RECON-10/11 and RULE-FAAN-G12: kong replacement is C1 + C5, with no extra consecutive-kong limit", () => {
    const scoring = score({ concealed: COMMON_HAND, source: "kong-replacement" });
    expect(ids(scoring)).toContain("C1");
    expect(ids(scoring)).toContain("C5");
    expect(scoring.limitHand).toBeNull();
    expect(scoring.items.some((entry) => entry.name.includes("second consecutive"))).toBe(false);
  });

  it("C6 and RULE-FAAN-G10: robbing a kong scores C6 and never C1", () => {
    const scoring = score({
      concealed: COMMON_HAND.slice(0, 13),
      source: "robbed-kong",
      added: COMMON_HAND[13],
    });
    expect(ids(scoring)).toContain("C6");
    expect(ids(scoring)).not.toContain("C1");
  });

  it("RECON-13 / C7 and RULE-FAAN-G13: No Flowers is unconditional only in the 144-tile profile", () => {
    const withBonuses = score({ concealed: COMMON_HAND, profile: PROFILE_144 });
    const withoutBonusTiles = score({ concealed: COMMON_HAND, profile: PROFILE_136 });
    expect(ids(withBonuses)).toContain("C7");
    expect(ids(withoutBonusTiles)).not.toContain("C7");
  });

  it("D1 Own Flower / Own Season scores each matching seat bonus", () => {
    const scoring = score({
      concealed: COMMON_HAND,
      profile: PROFILE_144,
      winner: 0,
      dealer: 0,
      bonuses: ["flower-1", "season-1", "flower-3"],
    });
    expect(ids(scoring).filter((id) => id.startsWith("D1-"))).toEqual([
      "D1-flower-1",
      "D1-season-1",
    ]);
  });

  it("RULE-FAAN-D1: D2 Complete Set replaces the own-tile D1 inside that set", () => {
    const scoring = score({
      concealed: COMMON_HAND,
      profile: PROFILE_144,
      winner: 0,
      dealer: 0,
      bonuses: ["flower-1", "flower-2", "flower-3", "flower-4", "season-1"],
    });
    expect(ids(scoring)).toContain("D2-flowers");
    expect(ids(scoring)).not.toContain("D1-flower-1");
    expect(ids(scoring)).toContain("D1-season-1");
  });

  it("E1 Thirteen Orphans replaces the entire breakdown at 13 faan", () => {
    const scoring = score({ concealed: [
      "characters-1", "characters-9", "bamboo-1", "bamboo-9", "dots-1", "dots-9",
      "wind-east", "wind-south", "wind-west", "wind-north",
      "dragon-red", "dragon-green", "dragon-white", "characters-1",
    ] });
    expect(ids(scoring)).toEqual(["E1"]);
    expect(scoring.limitHand).toBe("Thirteen Orphans");
    expect(scoring.totalFaan).toBe(13);
  });

  it("E2 Nine Gates detects the concealed 1112345678999 + one shape", () => {
    const scoring = score({ concealed: [
      "characters-1", "characters-1", "characters-1",
      "characters-2", "characters-3", "characters-4", "characters-5", "characters-6", "characters-7", "characters-8",
      "characters-9", "characters-9", "characters-9", "characters-9",
    ] });
    expect(ids(scoring)).toEqual(["E2"]);
    expect(scoring.limitHand).toBe("Nine Gates");
  });

  it("E3 All Kongs detects four kongs plus a pair", () => {
    const scoring = score({
      concealed: ["bamboo-5", "bamboo-5"],
      melds: [
        meld("kong", ["characters-1", "characters-1", "characters-1", "characters-1"]),
        meld("kong", ["characters-2", "characters-2", "characters-2", "characters-2"]),
        meld("kong", ["dots-3", "dots-3", "dots-3", "dots-3"]),
        meld("kong", ["wind-north", "wind-north", "wind-north", "wind-north"]),
      ],
    });
    expect(ids(scoring)).toEqual(["E3"]);
  });

  it("E4 Heavenly Hand is a single limit item", () => {
    const scoring = score({ concealed: COMMON_HAND, circumstances: { openingDealerHand: true } });
    expect(ids(scoring)).toEqual(["E4"]);
  });

  it("E5 Earthly Hand is a single limit item", () => {
    const scoring = score({
      concealed: COMMON_HAND.slice(0, 13),
      source: "discard",
      added: COMMON_HAND[13],
      circumstances: { dealerFirstDiscard: true },
    });
    expect(ids(scoring)).toEqual(["E5"]);
  });

  it("E6 Eight Immortals and F1 Seven Flowers replace every ordinary scoring item", () => {
    const baseContext = {
      profile: PROFILE_144,
      player: player([], [], ["flower-1", "flower-2", "flower-3", "flower-4", "season-1", "season-2", "season-3"]),
      winner: 1 as const,
      dealer: 0 as const,
      roundWind: "east" as const,
      fromSeat: null,
      winningTile: null,
      circumstances: {
        lastWallTile: false,
        lastDiscard: false,
        openingDealerHand: false,
        dealerFirstDiscard: false,
      },
    };
    const seven = scoreInstantBonusWin({ ...baseContext, source: "seven-flowers" });
    const eight = scoreInstantBonusWin({ ...baseContext, source: "eight-immortals" });
    expect(ids(seven)).toEqual(["F1"]);
    expect(seven.totalFaan).toBe(3);
    expect(ids(eight)).toEqual(["E6"]);
    expect(eight.totalFaan).toBe(13);
  });
});

describe("stacking, minimums, ceiling and reconciliation", () => {
  it("RECON-9: concealed all-triplets self-draw is exactly A2 + C1 + C2, not a limit", () => {
    const scoring = score({ concealed: ALL_TRIPLETS });
    expect(ids(scoring)).toEqual(expect.arrayContaining(["A2", "C1", "C2"]));
    expect(scoring.totalFaan).toBe(5);
    expect(scoring.limitHand).toBeNull();
  });

  it("RECON-14: an all-honours hand never receives All One Suit", () => {
    const scoring = score({ concealed: [
      "wind-east", "wind-east", "wind-east",
      "wind-south", "wind-south", "wind-south",
      "wind-west", "wind-west", "wind-west",
      "dragon-red", "dragon-red", "dragon-red",
      "dragon-white", "dragon-white",
    ] });
    expect(ids(scoring)).toContain("A9");
    expect(ids(scoring)).not.toContain("A4");
  });

  it("RECON-1/15 and RULE-SCORE-1/4: bonus faan pays but cannot satisfy the configured minimum", () => {
    const zeroQualifying = score({
      concealed: [
        "bamboo-1", "bamboo-2", "bamboo-3",
        "dots-4", "dots-5", "dots-6",
        "characters-7", "characters-8", "characters-9",
        "bamboo-5",
      ],
      melds: [meld("pung", ["characters-2", "characters-2", "characters-2"])],
      bonuses: ["flower-2"],
      profile: PROFILE_144,
      winner: 1,
      dealer: 0,
      source: "discard",
      added: "bamboo-5",
    });
    expect(zeroQualifying.qualifyingFaan).toBe(0);
    expect(zeroQualifying.totalFaan).toBe(1);
    expect(meetsMinimumFaan(zeroQualifying, { ...PROFILE_144, minimumFaan: 0 })).toBe(true);
    expect(meetsMinimumFaan(zeroQualifying, { ...PROFILE_144, minimumFaan: 1 })).toBe(false);
    expect(meetsMinimumFaan(zeroQualifying, { ...PROFILE_144, minimumFaan: 3 })).toBe(false);
  });

  it("RULE-SCORE-2: additive scoring is capped at 13 faan", () => {
    const scoring = score({ concealed: [
      "wind-east", "wind-east", "wind-east",
      "wind-south", "wind-south", "wind-south",
      "wind-west", "wind-west", "wind-west",
      "wind-north", "wind-north", "wind-north",
      "dragon-red", "dragon-red",
    ], winner: 0, dealer: 0, roundWind: "east" });
    expect(scoring.totalFaan).toBe(13);
    expect(scoring.basePoints).toBe(8192);
  });

  it("RULE-SCORE-3: base points are 2^faan", () => {
    const scoring = score({
      concealed: [
        "bamboo-1", "bamboo-2", "bamboo-3",
        "dots-4", "dots-5", "dots-6",
        "characters-7", "characters-8", "characters-9",
        "bamboo-5",
      ],
      melds: [meld("pung", ["characters-2", "characters-2", "characters-2"])],
      source: "self-draw",
      added: "bamboo-5",
    });
    expect(scoring.basePoints).toBe(2 ** scoring.totalFaan);
  });

  it("RULE-FAAN-G10/G11: discard/rob contexts never add self-draw or last-wall faan", () => {
    const robbed = score({
      concealed: COMMON_HAND.slice(0, 13),
      source: "robbed-kong",
      added: COMMON_HAND[13],
    });
    const lastDiscard = score({
      concealed: COMMON_HAND.slice(0, 13),
      source: "discard",
      added: COMMON_HAND[13],
      circumstances: { lastDiscard: true },
    });
    expect(ids(robbed)).not.toContain("C1");
    expect(ids(lastDiscard)).toContain("C4");
    expect(ids(lastDiscard)).not.toContain("C3");
  });

  it("RECON-16 and RULE-PAY-1/3: discard and robbed-kong wins use half-discarder settlement", () => {
    const discard = score({
      concealed: COMMON_HAND.slice(0, 13),
      source: "discard",
      added: COMMON_HAND[13],
      winner: 1,
      dealer: 0,
    });
    const robbed = score({
      concealed: COMMON_HAND.slice(0, 13),
      source: "robbed-kong",
      added: COMMON_HAND[13],
      winner: 1,
      dealer: 0,
    });
    expect(discard.payments).toEqual([
      -2 * discard.basePoints,
      4 * discard.basePoints,
      -discard.basePoints,
      -discard.basePoints,
    ]);
    expect(robbed.payments).toEqual([
      -2 * robbed.basePoints,
      4 * robbed.basePoints,
      -robbed.basePoints,
      -robbed.basePoints,
    ]);
  });

  it("RULE-PAY-2/4/5: self-draw and instant flower wins charge every loser equally with no dealer multiplier", () => {
    const selfDraw = score({ concealed: COMMON_HAND, source: "self-draw", winner: 1, dealer: 0 });
    const instant = scoreInstantBonusWin({
      profile: PROFILE_144,
      player: player([], [], ["flower-1", "flower-2", "flower-3", "flower-4", "season-1", "season-2", "season-3"], 1),
      winner: 1,
      dealer: 0,
      roundWind: "east",
      source: "seven-flowers",
      fromSeat: null,
      winningTile: null,
      circumstances: {
        lastWallTile: false,
        lastDiscard: false,
        openingDealerHand: false,
        dealerFirstDiscard: false,
      },
    });
    expect(selfDraw.payments).toEqual([
      -2 * selfDraw.basePoints,
      6 * selfDraw.basePoints,
      -2 * selfDraw.basePoints,
      -2 * selfDraw.basePoints,
    ]);
    expect(instant.payments).toEqual([
      -2 * instant.basePoints,
      6 * instant.basePoints,
      -2 * instant.basePoints,
      -2 * instant.basePoints,
    ]);
  });
});
