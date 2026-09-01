import type { ClaimOption, Meld, OpponentView, TableState } from "./table.ts";
import { tiles, type Tile } from "./tiles.ts";

/**
 * Six deterministic table states. No engine, no RNG, no bots: every scenario is
 * fixed so two testers on two phones see exactly the same decision.
 *
 * The set is chosen to cover the widest and the most error-prone layouts:
 * a full 14-tile hand, a hand that must stay inert, two multi-option claims,
 * a win offered next to a pass, and a hand shortened by an exposed meld.
 */

function meld(kind: Meld["kind"], spec: string): Meld {
  return { kind, tiles: tiles(spec) };
}

function opponent(
  seat: OpponentView["seat"],
  wind: string,
  concealedCount: number,
  melds: readonly Meld[] = [],
): OpponentView {
  return { seat, wind, concealedCount, melds };
}

function idsOf(hand: readonly Tile[], kinds: readonly string[]): string[] {
  const remaining = [...kinds];
  const picked: string[] = [];
  for (const tile of hand) {
    const index = remaining.indexOf(tile.kind);
    if (index !== -1) {
      remaining.splice(index, 1);
      picked.push(tile.id);
    }
  }
  return picked;
}

function claim(
  id: string,
  kind: ClaimOption["kind"],
  hand: readonly Tile[],
  uses: readonly string[],
  detail: string | null = null,
): ClaimOption {
  const glyphs = { chow: "食", pung: "碰", kong: "槓", win: "糊" } as const;
  const glosses = { chow: "Chow", pung: "Pung", kong: "Kong", win: "Win" } as const;
  return {
    id,
    kind,
    glyph: glyphs[kind],
    gloss: glosses[kind],
    usesTileIds: idsOf(hand, uses),
    detail,
  };
}

const DISCARD_POOL = tiles("c1 ws b9 d1 dw c9 b1 ww d8 wn c8 dg").map((tile) => tile.kind);

function scenarioOne(): TableState {
  const hand = tiles("c2 c3 c4 c7 c8 b3 b4 b5 b9 b9 d1 d2 d6 d9");
  const drawn = hand[13];
  return {
    id: "full-hand-discard",
    title: "Your turn — 14 tiles",
    probe: "Widest possible layout. Can you read all 14 tiles and discard the one you meant to?",
    phase: "discard",
    turn: "you",
    roundWind: "East",
    seatWind: "East",
    wallRemaining: 84,
    hand,
    drawnTileId: drawn?.id ?? null,
    melds: [],
    opponents: [
      opponent("right", "South", 13),
      opponent("across", "West", 13),
      opponent("left", "North", 13),
    ],
    discardPile: DISCARD_POOL.slice(0, 6),
    lastDiscard: null,
    claims: [],
  };
}

function scenarioTwo(): TableState {
  const hand = tiles("c2 c3 c4 c7 c8 b3 b4 b5 b9 b9 d1 d2 d6");
  return {
    id: "not-your-turn",
    title: "Not your turn",
    probe: "Turn ownership. Is it obvious the table is not asking you for anything?",
    phase: "waiting",
    turn: "right",
    roundWind: "East",
    seatWind: "East",
    wallRemaining: 83,
    hand,
    drawnTileId: null,
    melds: [],
    opponents: [
      opponent("right", "South", 13),
      opponent("across", "West", 13),
      opponent("left", "North", 13),
    ],
    discardPile: DISCARD_POOL.slice(0, 7),
    lastDiscard: null,
    claims: [],
  };
}

function scenarioThree(): TableState {
  const hand = tiles("c4 c5 c6 c9 c9 b2 b3 b5 b6 d3 d3 d7 d8");
  const discarded = tiles("b4")[0];
  if (discarded === undefined) throw new Error("scenario tile missing");
  return {
    id: "chow-two-ways",
    title: "Chow — two ways",
    probe: "Two legal chows on one discard. Are both shapes readable, and is Pass safely placed?",
    phase: "claim",
    turn: "left",
    roundWind: "East",
    seatWind: "East",
    wallRemaining: 71,
    hand,
    drawnTileId: null,
    melds: [],
    opponents: [
      opponent("right", "South", 13),
      opponent("across", "West", 13),
      opponent("left", "North", 12),
    ],
    discardPile: DISCARD_POOL.slice(0, 9),
    lastDiscard: { tile: discarded, from: "left" },
    claims: [
      claim("chow-low", "chow", hand, ["bamboo-2", "bamboo-3"], "2·3·4"),
      claim("chow-high", "chow", hand, ["bamboo-5", "bamboo-6"], "4·5·6"),
    ],
  };
}

function scenarioFour(): TableState {
  const hand = tiles("dr dr dr c2 c3 c4 b5 b6 b7 d1 d1 d8 d9");
  const discarded = tiles("dr")[0];
  if (discarded === undefined) throw new Error("scenario tile missing");
  const fourth: Tile = { id: "dragon-red#4", kind: discarded.kind };
  return {
    id: "pung-or-kong",
    title: "Pung or Kong",
    probe: "Two different claims on one discard. Can you pick the one you want without misfiring?",
    phase: "claim",
    turn: "across",
    roundWind: "East",
    seatWind: "East",
    wallRemaining: 56,
    hand,
    drawnTileId: null,
    melds: [],
    opponents: [
      opponent("right", "South", 13),
      opponent("across", "West", 12),
      opponent("left", "North", 10, [meld("chow", "b1 b2 b3")]),
    ],
    discardPile: DISCARD_POOL.slice(0, 11),
    lastDiscard: { tile: fourth, from: "across" },
    claims: [
      claim("pung", "pung", hand, ["dragon-red", "dragon-red"], "碰 三元牌"),
      claim("kong", "kong", hand, ["dragon-red", "dragon-red", "dragon-red"], "槓 + replacement"),
    ],
  };
}

function scenarioFive(): TableState {
  const hand = tiles("c2 c3 c4 b6 b7 b8 d7 d8 d9 d3 d4 we we");
  const discarded = tiles("d5")[0];
  if (discarded === undefined) throw new Error("scenario tile missing");
  return {
    id: "win-or-pass",
    title: "Win offered",
    probe: "Win next to Pass. Is Win unmistakable, and is it far enough from Pass to be safe?",
    phase: "claim",
    turn: "across",
    roundWind: "East",
    seatWind: "East",
    wallRemaining: 34,
    hand,
    drawnTileId: null,
    melds: [],
    opponents: [
      opponent("right", "South", 13),
      opponent("across", "West", 12),
      opponent("left", "North", 10, [meld("pung", "ww ww ww")]),
    ],
    discardPile: DISCARD_POOL,
    lastDiscard: { tile: discarded, from: "across" },
    claims: [claim("win", "win", hand, ["dots-3", "dots-4"], "3·4·5 — 平糊")],
  };
}

function scenarioSix(): TableState {
  const hand = tiles("c2 c3 c4 b6 b7 b8 d2 d5 d9 we c8");
  const drawn = hand[10];
  return {
    id: "meld-exposed-discard",
    title: "Discard with a meld exposed",
    probe: "Hand shortened by an exposed pung. Do your own melds crowd the hand or read cleanly?",
    phase: "discard",
    turn: "you",
    roundWind: "East",
    seatWind: "East",
    wallRemaining: 41,
    hand,
    drawnTileId: drawn?.id ?? null,
    melds: [meld("pung", "dg dg dg")],
    opponents: [
      opponent("right", "South", 13),
      opponent("across", "West", 10, [meld("chow", "d6 d7 d8")]),
      opponent("left", "North", 10, [meld("pung", "ww ww ww")]),
    ],
    discardPile: DISCARD_POOL.slice(0, 10),
    lastDiscard: null,
    claims: [],
  };
}

export const SCENARIOS: readonly TableState[] = [
  scenarioOne(),
  scenarioTwo(),
  scenarioThree(),
  scenarioFour(),
  scenarioFive(),
  scenarioSix(),
];

export function scenarioAt(index: number): TableState {
  const scenario = SCENARIOS[((index % SCENARIOS.length) + SCENARIOS.length) % SCENARIOS.length];
  if (scenario === undefined) throw new Error("no scenarios defined");
  return scenario;
}
