import { seatWind } from "./seats.js";
import { isBonusKind, isSuitedKind, parseSuitedKind, seatOwnsBonus } from "./tiles.js";
import type {
  FaanBreakdown,
  FaanItem,
  Meld,
  OrdinaryTileKind,
  PlayerState,
  RulesProfile,
  Seat,
  StandardWinningStructure,
  Tile,
  WinHandResult,
  WinSource,
  WinningStructure,
  Wind,
} from "./types.js";
import { enumerateWinningStructures } from "./winning.js";

const FAAN_CEILING = 13;

const DRAGONS = ["dragon-red", "dragon-green", "dragon-white"] as const satisfies readonly OrdinaryTileKind[];
const WINDS = ["wind-east", "wind-south", "wind-west", "wind-north"] as const satisfies readonly OrdinaryTileKind[];

interface ScoreContext {
  readonly profile: RulesProfile;
  readonly player: PlayerState;
  readonly winner: Seat;
  readonly dealer: Seat;
  readonly roundWind: Wind;
  readonly source: WinSource;
  readonly fromSeat: Seat | null;
  readonly winningTile: Tile | null;
  readonly circumstances: WinHandResult["circumstances"];
}

export interface WinningEvaluation extends ScoreContext {
  readonly structure: WinningStructure;
  readonly scoring: FaanBreakdown;
}

interface ScoringSet {
  readonly type: "chow" | "pung" | "kong";
  readonly kinds: readonly OrdinaryTileKind[];
}

function item(
  id: string,
  name: string,
  chineseName: string,
  faan: number,
): FaanItem {
  return { id, name, chineseName, faan };
}

function ordinaryKind(tile: Tile): OrdinaryTileKind {
  if (isBonusKind(tile.kind)) {
    throw new Error("A bonus tile cannot participate in a winning structure");
  }
  return tile.kind;
}

function scoringSets(
  structure: StandardWinningStructure,
  melds: readonly Meld[],
): readonly ScoringSet[] {
  const fixed = melds.map((meld): ScoringSet => ({
    type: meld.type,
    kinds: meld.tiles.map(ordinaryKind),
  }));
  const concealed = structure.sets.map((set): ScoringSet =>
    set.type === "chow"
      ? { type: "chow", kinds: set.tiles }
      : { type: "pung", kinds: [set.tile, set.tile, set.tile] },
  );
  return [...fixed, ...concealed];
}

function representativeKind(set: ScoringSet): OrdinaryTileKind | null {
  return set.type === "chow" ? null : set.kinds[0] ?? null;
}

function isHonour(kind: OrdinaryTileKind): boolean {
  return kind.startsWith("wind-") || kind.startsWith("dragon-");
}

function isTerminal(kind: OrdinaryTileKind): boolean {
  if (!isSuitedKind(kind)) {
    return false;
  }
  const rank = parseSuitedKind(kind).rank;
  return rank === 1 || rank === 9;
}

function allStructureKinds(
  structure: StandardWinningStructure,
  sets: readonly ScoringSet[],
): readonly OrdinaryTileKind[] {
  return [structure.pair, ...sets.flatMap((set) => set.kinds)];
}

function tripletKinds(sets: readonly ScoringSet[]): ReadonlySet<OrdinaryTileKind> {
  return new Set(
    sets
      .map(representativeKind)
      .filter((kind): kind is OrdinaryTileKind => kind !== null),
  );
}

function completeBonusSet(player: PlayerState, prefix: "flower" | "season"): boolean {
  const kinds = new Set(player.bonuses.map((bonus) => bonus.kind));
  return [1, 2, 3, 4].every((index) => kinds.has(`${prefix}-${String(index)}`));
}

function fullConcealedKinds(context: ScoreContext): readonly OrdinaryTileKind[] {
  const kinds = context.player.concealed.map(ordinaryKind);
  if (
    (context.source === "discard" || context.source === "robbed-kong") &&
    context.winningTile !== null
  ) {
    return [...kinds, ordinaryKind(context.winningTile)];
  }
  return kinds;
}

function isNineGates(context: ScoreContext, structure: WinningStructure): boolean {
  if (structure.type !== "standard" || context.player.melds.length !== 0) {
    return false;
  }
  const kinds = fullConcealedKinds(context);
  if (kinds.length !== 14 || kinds.some((kind) => !isSuitedKind(kind))) {
    return false;
  }
  const parsed = kinds.map((kind) => parseSuitedKind(kind));
  const suit = parsed[0]?.suit;
  if (suit === undefined || parsed.some((entry) => entry.suit !== suit)) {
    return false;
  }
  const counts = new Map<number, number>();
  for (const entry of parsed) {
    counts.set(entry.rank, (counts.get(entry.rank) ?? 0) + 1);
  }
  if ((counts.get(1) ?? 0) < 3 || (counts.get(9) ?? 0) < 3) {
    return false;
  }
  for (let rank = 2; rank <= 8; rank += 1) {
    if ((counts.get(rank) ?? 0) < 1) {
      return false;
    }
  }
  return true;
}

function isAllKongs(context: ScoreContext, structure: WinningStructure): boolean {
  return (
    structure.type === "standard" &&
    structure.sets.length === 0 &&
    context.player.melds.length === 4 &&
    context.player.melds.every((meld) => meld.type === "kong")
  );
}

function paymentDeltas(
  winner: Seat,
  fromSeat: Seat | null,
  source: WinSource,
  basePoints: number,
): readonly [number, number, number, number] {
  const deltas: [number, number, number, number] = [0, 0, 0, 0];
  const selfDraw =
    source === "self-draw" ||
    source === "kong-replacement" ||
    source === "seven-flowers" ||
    source === "eight-immortals";

  if (selfDraw) {
    for (let seat = 0; seat < 4; seat += 1) {
      if (seat === winner) {
        continue;
      }
      deltas[seat as Seat] = -2 * basePoints;
    }
    deltas[winner] = 6 * basePoints;
    return deltas;
  }

  if (fromSeat === null) {
    throw new Error(`Win source ${source} requires a paying source seat`);
  }
  for (let seat = 0; seat < 4; seat += 1) {
    const typedSeat = seat as Seat;
    if (typedSeat === winner) {
      continue;
    }
    deltas[typedSeat] = typedSeat === fromSeat ? -2 * basePoints : -basePoints;
  }
  deltas[winner] = 4 * basePoints;
  return deltas;
}

function breakdown(
  context: ScoreContext,
  items: readonly FaanItem[],
  limitHand: string | null,
): FaanBreakdown {
  const totalRaw = items.reduce((sum, entry) => sum + entry.faan, 0);
  const qualifyingRaw = items
    .filter((entry) => entry.id !== "C7" && !entry.id.startsWith("D1-") && !entry.id.startsWith("D2-"))
    .reduce((sum, entry) => sum + entry.faan, 0);
  const totalFaan = Math.min(FAAN_CEILING, totalRaw);
  const qualifyingFaan = Math.min(FAAN_CEILING, qualifyingRaw);
  const basePoints = 2 ** totalFaan;
  return {
    qualifyingFaan,
    totalFaan,
    items,
    basePoints,
    payments: paymentDeltas(
      context.winner,
      context.fromSeat,
      context.source,
      basePoints,
    ),
    limitHand,
  };
}

function limitBreakdown(
  context: ScoreContext,
  id: string,
  name: string,
  chineseName: string,
): FaanBreakdown {
  return breakdown(context, [item(id, name, chineseName, FAAN_CEILING)], name);
}

function structuralItems(
  context: ScoreContext,
  structure: StandardWinningStructure,
): readonly FaanItem[] {
  const items: FaanItem[] = [];
  const sets = scoringSets(structure, context.player.melds);
  const kinds = allStructureKinds(structure, sets);
  const triplets = tripletKinds(sets);
  const suitedKinds = kinds.filter(isSuitedKind);
  const honours = kinds.filter(isHonour);
  const suits = new Set(suitedKinds.map((kind) => parseSuitedKind(kind).suit));

  if (sets.every((set) => set.type === "chow")) {
    items.push(item("A1", "Common Hand", "平糊", 1));
  }
  if (sets.every((set) => set.type !== "chow")) {
    items.push(item("A2", "All Triplets", "對對糊", 3));
  }

  // RECON-14: unlike hk-mahjong's isAllOneSuit, honours can never satisfy 清一色.
  if (suits.size === 1 && suitedKinds.length > 0 && honours.length > 0) {
    items.push(item("A3", "Mixed One Suit", "混一色", 3));
  } else if (suits.size === 1 && suitedKinds.length > 0 && honours.length === 0) {
    items.push(item("A4", "All One Suit", "清一色", 7));
  }

  const dragonTriplets = DRAGONS.filter((kind) => triplets.has(kind));
  const dragonPair = DRAGONS.includes(structure.pair as (typeof DRAGONS)[number]);
  if (dragonTriplets.length === 3) {
    // RECON-3: 大三元 is itemised at 8 and still stacks with all three B1 melds.
    items.push(item("A6", "Great Three Dragons", "大三元", 8));
  } else if (dragonTriplets.length === 2 && dragonPair) {
    // RECON-2: 小三元 is 3 + the two ordinary dragon-meld faan below.
    items.push(item("A5", "Small Three Dragons", "小三元", 3));
  }

  const windTriplets = WINDS.filter((kind) => triplets.has(kind));
  const windPair = WINDS.includes(structure.pair as (typeof WINDS)[number]);
  if (windTriplets.length === 4) {
    // RECON-5: 大四喜 is itemised at 8, not represented as an opaque limit hand.
    items.push(item("A8", "Great Four Winds", "大四喜", 8));
  } else if (windTriplets.length === 3 && windPair) {
    // RECON-4: 小四喜 is 6 and stacks with applicable seat/round wind faan.
    items.push(item("A7", "Small Four Winds", "小四喜", 6));
  }

  if (kinds.every(isHonour)) {
    // RECON-6: 字一色 is 10 and naturally reaches the ceiling with 對對糊.
    items.push(item("A9", "All Honours", "字一色", 10));
  } else {
    const everyTerminalOrHonour = kinds.every((kind) => isHonour(kind) || isTerminal(kind));
    const hasTerminal = kinds.some(isTerminal);
    const hasHonour = kinds.some(isHonour);
    if (everyTerminalOrHonour && hasTerminal && hasHonour) {
      // RECON-7: 混幺九 is 10, not the reference package's 1 faan.
      items.push(item("A10", "Mixed Terminals & Honours", "混幺九", 10));
    } else if (kinds.every(isTerminal)) {
      // RECON-8: 清幺九 is 10 and stacks rather than becoming an opaque limit.
      items.push(item("A11", "All Terminals", "清幺九", 10));
    }
  }

  for (const dragon of DRAGONS) {
    if (triplets.has(dragon)) {
      items.push(item(`B1-${dragon}`, "Dragon Pung/Kong", "三元牌", 1));
    }
  }
  const currentSeatWind = seatWind(context.winner, context.dealer);
  if (triplets.has(`wind-${currentSeatWind}`)) {
    items.push(item("B2", "Seat Wind", "門風", 1));
  }
  if (triplets.has(`wind-${context.roundWind}`)) {
    // RULE-FAAN-B1 deliberately allows this to stack with B2 when both winds coincide.
    items.push(item("B3", "Round Wind", "圈風", 1));
  }

  return items;
}

function circumstanceItems(context: ScoreContext): readonly FaanItem[] {
  const items: FaanItem[] = [];
  if (context.source === "self-draw" || context.source === "kong-replacement") {
    items.push(item("C1", "Self-Draw", "自摸", 1));
  }
  if (context.player.melds.every((meld) => meld.exposure === "concealed")) {
    items.push(item("C2", "Fully Concealed Hand", "門前清", 1));
  }
  if (context.circumstances.lastWallTile) {
    items.push(item("C3", "Win on Last Wall Tile", "海底撈月", 1));
  }
  if (context.circumstances.lastDiscard) {
    // RECON-12: 河底撈魚 is explicitly present in V1 although absent from hk-mahjong.
    items.push(item("C4", "Win on Last Discard", "河底撈魚", 1));
  }
  if (context.source === "kong-replacement") {
    // RECON-10/11: one faan, stacking with self-draw; consecutive kongs add no extra pattern.
    items.push(item("C5", "Win on Kong Replacement", "槓上開花", 1));
  }
  if (context.source === "robbed-kong") {
    items.push(item("C6", "Robbing a Kong", "搶槓", 1));
  }
  if (context.profile.tileSetSize === 144 && context.player.bonuses.length === 0) {
    // RECON-13: 無花 is unconditional in the 144-tile profile.
    items.push(item("C7", "No Flowers", "無花", 1));
  }
  return items;
}

function bonusItems(context: ScoreContext): readonly FaanItem[] {
  if (context.profile.tileSetSize === 136) {
    return [];
  }
  const items: FaanItem[] = [];
  const fullFlowers = completeBonusSet(context.player, "flower");
  const fullSeasons = completeBonusSet(context.player, "season");
  if (fullFlowers) {
    items.push(item("D2-flowers", "Complete Flower Set", "一台花", 2));
  }
  if (fullSeasons) {
    items.push(item("D2-seasons", "Complete Season Set", "一台花", 2));
  }

  const currentSeatWind = seatWind(context.winner, context.dealer);
  for (const bonus of context.player.bonuses) {
    const inCompleteSet =
      (bonus.kind.startsWith("flower-") && fullFlowers) ||
      (bonus.kind.startsWith("season-") && fullSeasons);
    if (!inCompleteSet && seatOwnsBonus(currentSeatWind, bonus.kind)) {
      items.push(item(`D1-${bonus.kind}`, "Own Flower / Own Season", "正花", 1));
    }
  }
  return items;
}

function scoreStructure(context: ScoreContext, structure: WinningStructure): FaanBreakdown {
  // Limit patterns replace the entire breakdown. When two theoretical limit labels
  // coincide, table order E1→E5 is the deterministic display precedence.
  if (structure.type === "thirteen-orphans") {
    return limitBreakdown(context, "E1", "Thirteen Orphans", "十三幺");
  }
  if (isNineGates(context, structure)) {
    return limitBreakdown(context, "E2", "Nine Gates", "九子連環");
  }
  if (isAllKongs(context, structure)) {
    return limitBreakdown(context, "E3", "All Kongs", "十八羅漢");
  }
  if (context.circumstances.openingDealerHand) {
    return limitBreakdown(context, "E4", "Heavenly Hand", "天糊");
  }
  if (context.circumstances.dealerFirstDiscard) {
    return limitBreakdown(context, "E5", "Earthly Hand", "地糊");
  }

  const items = [
    ...structuralItems(context, structure),
    ...circumstanceItems(context),
    ...bonusItems(context),
  ];
  // RECON-9: there is deliberately no concealed-all-triplets limit pattern here.
  return breakdown(context, items, null);
}

export function evaluateWinningHand(
  context: ScoreContext,
  addedTile: Tile | null = null,
): WinningEvaluation | null {
  const structures = enumerateWinningStructures(
    context.player.concealed,
    context.player.melds,
    addedTile,
  );
  let best: WinningEvaluation | null = null;
  for (const structure of structures) {
    const scoring = scoreStructure(context, structure);
    if (best === null || scoring.totalFaan > best.scoring.totalFaan) {
      best = { ...context, structure, scoring };
    }
  }
  return best;
}

export function scoreInstantBonusWin(context: ScoreContext): FaanBreakdown {
  if (context.source === "eight-immortals") {
    return limitBreakdown(context, "E6", "Eight Immortals", "八仙過海");
  }
  if (context.source === "seven-flowers") {
    return breakdown(context, [item("F1", "Seven Flowers", "花糊", 3)], null);
  }
  throw new Error(`Win source ${context.source} is not an instant bonus win`);
}

export function meetsMinimumFaan(
  scoring: FaanBreakdown,
  profile: RulesProfile,
): boolean {
  // RECON-1/15: configurable 0/1/3 minimum, using the bonus-excluded qualifying total.
  return scoring.qualifyingFaan >= profile.minimumFaan;
}
