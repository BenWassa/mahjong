import { assertGameInvariants } from "../../src/engine/invariants.js";
import { createTileSet, isBonusTile } from "../../src/engine/tiles.js";
import type {
  Discard,
  GameEvent,
  GamePhase,
  GameRecord,
  InternalGameState,
  Meld,
  MeldExposure,
  MeldType,
  PlayerState,
  RulesProfile,
  Seat,
  Tile,
  TileKind,
} from "../../src/engine/types.js";

type PlayerTuple = readonly [PlayerState, PlayerState, PlayerState, PlayerState];

export interface TestMeldSpec {
  readonly type: MeldType;
  readonly exposure: MeldExposure;
  readonly kinds: readonly TileKind[];
  readonly claimedFrom?: Seat | null;
}

export interface TestDiscardSpec {
  readonly seat: Seat;
  readonly kind: TileKind;
}

export interface TestStateOptions {
  readonly seed?: string;
  readonly config?: RulesProfile;
  readonly handIndex?: number;
  readonly dealer?: Seat;
  readonly roundStarter?: Seat;
  readonly roundWind?: InternalGameState["roundWind"];
  readonly concealed?: Partial<Record<Seat, readonly TileKind[]>>;
  readonly melds?: Partial<Record<Seat, readonly TestMeldSpec[]>>;
  readonly bonuses?: Partial<Record<Seat, readonly TileKind[]>>;
  readonly scores?: readonly [number, number, number, number];
  readonly discards?: readonly TestDiscardSpec[];
  readonly wallHead?: readonly TileKind[];
  readonly wallTail?: readonly TileKind[];
  /**
   * Number of tiles to leave in the wall. Unused physical tiles outside that
   * count become earlier, unclaimed discards so conservation remains exact.
   */
  readonly wallCount?: number;
  readonly phase?: GamePhase;
}

const TEST_PROFILE: RulesProfile = {
  tileSetSize: 136,
  minimumFaan: 1,
  matchLength: "east-round",
};

/**
 * Constructs invariant-valid test snapshots from tile kinds. Physical copies
 * are allocated in canonical order and every otherwise-unused tile is placed
 * either in the wall or in the historical discard ledger.
 */
export function buildTestState(options: TestStateOptions = {}): InternalGameState {
  const config = options.config ?? TEST_PROFILE;
  const seed = options.seed ?? "test-fixture";
  const handIndex = options.handIndex ?? 0;
  const dealer = options.dealer ?? 0;
  const roundStarter = options.roundStarter ?? 0;
  const roundWind = options.roundWind ?? "east";
  const scores = options.scores ?? [0, 0, 0, 0];
  const available = new Map<TileKind, Tile[]>();

  for (const tile of createTileSet(config.tileSetSize)) {
    const copies = available.get(tile.kind) ?? [];
    copies.push(tile);
    available.set(tile.kind, copies);
  }

  const take = (kind: TileKind, zone: string): Tile => {
    const copies = available.get(kind);
    const tile = copies?.shift();
    if (tile === undefined) {
      throw new Error(`No physical ${kind} tile remains for ${zone}`);
    }
    return tile;
  };

  const claimedDiscardRefs: Array<{
    readonly seat: Seat;
    readonly claimedBy: Seat;
    readonly claimType: MeldType;
    readonly tile: Tile;
  }> = [];
  const players = [0, 1, 2, 3].map((seatNumber): PlayerState => {
    const seat = seatNumber as Seat;
    const concealed = (options.concealed?.[seat] ?? []).map((kind) =>
      take(kind, `seat ${String(seat)} concealed`),
    );
    const melds = (options.melds?.[seat] ?? []).map((spec, meldIndex): Meld => {
      const expectedTileCount = spec.type === "kong" ? 4 : 3;
      if (spec.kinds.length !== expectedTileCount) {
        throw new Error(
          `Seat ${String(seat)} ${spec.type} ${String(meldIndex)} needs ${String(expectedTileCount)} tiles`,
        );
      }
      const tiles = spec.kinds.map((kind) =>
        take(kind, `seat ${String(seat)} meld ${String(meldIndex)}`),
      );
      const claimedFrom = spec.claimedFrom ?? null;
      if (spec.exposure === "concealed" && claimedFrom !== null) {
        throw new Error("A concealed meld cannot name a claiming seat");
      }
      if (spec.exposure === "exposed" && claimedFrom !== null) {
        const claimedTile = tiles.at(-1);
        if (claimedTile === undefined) {
          throw new Error("An exposed meld cannot be empty");
        }
        claimedDiscardRefs.push({
          seat: claimedFrom,
          claimedBy: seat,
          claimType: spec.type,
          tile: claimedTile,
        });
      }
      return {
        type: spec.type,
        exposure: spec.exposure,
        tiles,
        claimedFrom,
      };
    });
    const bonuses = (options.bonuses?.[seat] ?? []).map((kind) =>
      take(kind, `seat ${String(seat)} bonuses`),
    );
    return { seat, concealed, melds, bonuses, score: scores[seat] };
  }) as unknown as PlayerTuple;

  const explicitDiscards = (options.discards ?? []).map((spec, index): Discard => ({
    index,
    seat: spec.seat,
    tile: take(spec.kind, `discard ${String(index)}`),
    claimedBy: null,
    claimType: null,
  }));
  const claimedDiscards = claimedDiscardRefs.map((reference, offset): Discard => ({
    index: explicitDiscards.length + offset,
    seat: reference.seat,
    tile: reference.tile,
    claimedBy: reference.claimedBy,
    claimType: reference.claimType,
  }));

  const wallHead = (options.wallHead ?? []).map((kind) => take(kind, "wall head"));
  const wallTail = (options.wallTail ?? []).map((kind) => take(kind, "wall tail"));
  const remaining = [...available.values()].flat();
  // Tiles pushed out of a shortened wall become historical discards, which is
  // where they would be on a real table late in a hand. Bonus tiles are never
  // discarded (RULE-FLOWER-3), so they always stay in the wall and a wall count
  // that cannot hold them is rejected rather than silently corrupting the state.
  const remainingBonuses = remaining.filter((tile) => isBonusTile(tile));
  const remainingOrdinary = remaining.filter((tile) => !isBonusTile(tile));
  const requestedWallCount = options.wallCount ??
    wallHead.length + remaining.length + wallTail.length;
  const reservedCount = wallHead.length + wallTail.length + remainingBonuses.length;
  if (requestedWallCount < reservedCount || requestedWallCount > reservedCount + remainingOrdinary.length) {
    throw new RangeError(
      `Wall count ${String(requestedWallCount)} cannot contain ${String(reservedCount)} reserved tiles (including ${String(remainingBonuses.length)} bonus tiles) and ${String(remainingOrdinary.length)} remaining tiles`,
    );
  }
  const middleCount = requestedWallCount - reservedCount;
  const wall = [...wallHead, ...remainingBonuses, ...remainingOrdinary.slice(0, middleCount), ...wallTail];
  const discardedRemainder = remainingOrdinary.slice(middleCount);
  const priorDiscards: Discard[] = [...explicitDiscards, ...claimedDiscards];
  for (const [offset, tile] of discardedRemainder.entries()) {
    const index = priorDiscards.length;
    priorDiscards.push({
      index,
      seat: (offset % 4) as Seat,
      tile,
      claimedBy: null,
      claimType: null,
    });
  }

  const phase: GamePhase = options.phase ?? {
    kind: "awaiting-discard",
    seat: dealer,
    source: "deal",
    drawnTile: null,
    lastWallTile: false,
  };
  const terminalResult =
    phase.kind === "hand-ended" || phase.kind === "match-ended" ? phase.result : null;
  const events: GameEvent[] = [
    { type: "match-started", seed },
    {
      type: "hand-started",
      handIndex,
      handSeed: `${seed}::hand:${String(handIndex)}`,
      dealer,
      roundWind,
    },
  ];
  if (terminalResult !== null) {
    events.push({ type: "hand-ended", handIndex, result: terminalResult });
    if (phase.kind === "match-ended") {
      events.push({ type: "match-ended", handIndex });
    }
  }
  const record: GameRecord = {
    version: 1,
    seed,
    config,
    actions: [],
    events,
    hands: terminalResult === null ? [] : [terminalResult],
    completed: phase.kind === "match-ended",
  };
  const state: InternalGameState = {
    version: 1,
    seed,
    config,
    handIndex,
    dealer,
    roundStarter,
    roundWind,
    players,
    wall,
    discards: priorDiscards,
    phase,
    record,
  };
  assertGameInvariants(state);
  return state;
}
