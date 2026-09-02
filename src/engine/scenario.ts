import { shuffleTiles } from "./random.js";
import { createScenarioGame } from "./scored-core.js";
import { seatsAfter } from "./seats.js";
import { BONUS_TILE_KINDS, createTileSet, isBonusKind } from "./tiles.js";
import type {
  InternalGameState,
  OrdinaryTileKind,
  RulesProfile,
  Seat,
  Tile,
  TileKind,
} from "./types.js";

/**
 * Deterministic teaching scenarios, built by arranging the wall rather than by
 * simulating one.
 *
 * A scenario says which tiles each seat is holding after the deal and which
 * tiles the wall will yield next. This module turns that into an ordering of
 * the same 144 physical tiles the game always uses, and hands it to
 * `createScenarioGame`, which deals it through the production deal. Nothing
 * here re-implements a rule: the deal, the legality of every subsequent move,
 * claim priority, winning and scoring all remain the engine's, and a scenario
 * hand differs from a dealt one only in how its wall was ordered.
 *
 * The alternative — searching seeds until a shuffle happened to produce a
 * teachable hand — was rejected. It makes the lesson content hostage to the
 * PRNG, and any change to the shuffle would silently re-deal every lesson.
 */

/**
 * The deal, as the engine performs it: three packets of four to each seat in
 * turn order from the dealer, then one more each, then one extra to the
 * dealer. These are the wall indices each seat's tiles come from, and they are
 * derived here from the same rule `buildHand` follows rather than transcribed.
 */
const PACKETS = 3;
const PACKET_SIZE = 4;
const DEAL_LENGTH = PACKETS * PACKET_SIZE * 4 + 4 + 1;

function dealIndicesFor(position: number, isDealer: boolean): readonly number[] {
  const indices: number[] = [];
  for (let packet = 0; packet < PACKETS; packet += 1) {
    for (let offset = 0; offset < PACKET_SIZE; offset += 1) {
      indices.push(packet * PACKET_SIZE * 4 + position * PACKET_SIZE + offset);
    }
  }
  indices.push(PACKETS * PACKET_SIZE * 4 + position);
  if (isDealer) {
    indices.push(DEAL_LENGTH - 1);
  }
  return indices;
}

export interface ScenarioSpec {
  /** Stable identifier. Also seeds the record, so two builds of one id match. */
  readonly id: string;
  readonly profile: RulesProfile;
  readonly dealer: Seat;
  /**
   * The tiles each seat must be holding after the deal.
   *
   * A lesson names only what it is teaching. A hand shorter than its dealt
   * size is padded from what the other hands left over, so a scenario about a
   * Pung does not have to invent thirty-nine opponent tiles to say which two
   * the player is holding. Padding is dealt one tile at a time around the
   * seats that need it, walking the leftovers in canonical order, which
   * scatters kinds instead of handing one opponent four consecutive ranks of
   * the same suit.
   *
   * The dealer holds fourteen, the others thirteen, and the dealer's last
   * tile is the one the opening phase reports as just drawn — so a scenario
   * that cares about the drawn tile must name the dealer's hand in full.
   *
   * Bonus tiles are rejected here: a flower in a dealt hand is revealed and
   * replaced from the wall's tail, which would consume a tile the scenario
   * did not account for and desynchronise everything after it.
   */
  readonly hands: readonly [
    readonly OrdinaryTileKind[],
    readonly OrdinaryTileKind[],
    readonly OrdinaryTileKind[],
    readonly OrdinaryTileKind[],
  ];
  /**
   * The tiles the wall will yield to the next draws, in order. A scenario only
   * needs to state as many as its lesson actually reaches; everything past
   * them is filled deterministically from whatever the hands left over.
   */
  readonly draws?: readonly OrdinaryTileKind[];
}

export class ScenarioSpecError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ScenarioSpecError";
  }
}

/**
 * A pool of the physical tiles a scenario has not spent yet, handed out in
 * canonical id order so the same spec always draws the same physical copies.
 */
function createPool(profile: RulesProfile): Map<TileKind, Tile[]> {
  const pool = new Map<TileKind, Tile[]>();
  for (const tile of createTileSet(profile.tileSetSize)) {
    const existing = pool.get(tile.kind);
    if (existing === undefined) pool.set(tile.kind, [tile]);
    else existing.push(tile);
  }
  return pool;
}

function take(pool: Map<TileKind, Tile[]>, kind: TileKind, where: string): Tile {
  const copies = pool.get(kind);
  const tile = copies?.shift();
  if (tile === undefined) {
    throw new ScenarioSpecError(
      `${where} asks for ${kind}, but no unspent copy of it remains — a tile kind has at most four`,
    );
  }
  return tile;
}

function expectedHandSize(seat: Seat, dealer: Seat): number {
  return seat === dealer ? 14 : 13;
}

export interface ResolvedScenario {
  /** A permutation of the full physical tile set, in wall order. */
  readonly wall: readonly Tile[];
  /** Each seat's dealt hand once padding has been applied. */
  readonly hands: readonly [
    readonly Tile[],
    readonly Tile[],
    readonly Tile[],
    readonly Tile[],
  ];
}

/**
 * Turns a scenario into an ordering of the full physical tile set, and reports
 * the hands that ordering will deal.
 *
 * Exported so the arrangement can be asserted directly in tests: the wall is a
 * permutation of `createTileSet`, which is what makes the engine's own
 * conservation invariant a real check on it rather than a formality.
 */
export function buildScenarioWall(spec: ScenarioSpec): ResolvedScenario {
  const order: readonly Seat[] = [spec.dealer, ...seatsAfter(spec.dealer)];
  const pool = createPool(spec.profile);
  const wall = new Array<Tile | undefined>(
    createTileSet(spec.profile.tileSetSize).length,
  ).fill(undefined);
  const dealt: [Tile[], Tile[], Tile[], Tile[]] = [[], [], [], []];

  for (const seat of order) {
    const hand = spec.hands[seat];
    const size = expectedHandSize(seat, spec.dealer);
    if (hand.length > size) {
      throw new ScenarioSpecError(
        `Scenario ${spec.id}: seat ${String(seat)} holds ${String(size)} tiles, but ${String(hand.length)} were named`,
      );
    }
    for (const kind of hand) {
      // Unreachable for a TypeScript caller — `hands` is typed to the ordinary
      // kinds — and kept for JavaScript ones, because a flower dealt into a
      // hand is revealed and replaced from the tail, silently consuming a tile
      // the scenario never accounted for.
      if (isBonusKind(kind)) {
        throw new ScenarioSpecError(
          `Scenario ${spec.id}: seat ${String(seat)} may not be dealt the bonus tile ${String(kind)}`,
        );
      }
      dealt[seat].push(take(pool, kind, `Scenario ${spec.id} seat ${String(seat)}`));
    }
  }

  for (const [offset, kind] of (spec.draws ?? []).entries()) {
    if (isBonusKind(kind)) {
      throw new ScenarioSpecError(
        `Scenario ${spec.id}: scripted draw ${String(offset)} may not be the bonus tile ${String(kind)}`,
      );
    }
    wall[DEAL_LENGTH + offset] = take(pool, kind, `Scenario ${spec.id} draw ${String(offset)}`);
  }

  // Padding comes from a deterministic shuffle of what is left, not from the
  // pool in canonical order. Canonical order hands a padded seat a contiguous
  // run of one suit — three opponents one tile from a clean hand — and an
  // opponent who wins out of nowhere is not the lesson. The shuffle is seeded
  // from the scenario id, so it is fixed for a given lesson and moves only if
  // that lesson is rewritten.
  const spare = shuffleTiles(spareOrdinary(pool), `${spec.id}::spare`);
  let nextSpare = 0;
  for (;;) {
    const needing = order.filter(
      (seat) => dealt[seat].length < expectedHandSize(seat, spec.dealer),
    );
    if (needing.length === 0) break;
    for (const seat of needing) {
      const tile = spare[nextSpare];
      nextSpare += 1;
      if (tile === undefined) {
        throw new ScenarioSpecError(`Scenario ${spec.id}: ran out of tiles padding the hands`);
      }
      dealt[seat].push(tile);
    }
  }

  for (const [position, seat] of order.entries()) {
    const indices = dealIndicesFor(position, seat === spec.dealer);
    for (const [slot, tile] of dealt[seat].entries()) {
      const index = indices[slot];
      if (index === undefined) {
        throw new ScenarioSpecError(`Scenario ${spec.id}: no deal slot ${String(slot)}`);
      }
      wall[index] = tile;
    }
  }

  const filler = wallFiller(pool, spare, nextSpare);
  let next = 0;
  for (let index = 0; index < wall.length; index += 1) {
    if (wall[index] !== undefined) continue;
    const tile = filler[next];
    next += 1;
    if (tile === undefined) {
      throw new ScenarioSpecError(`Scenario ${spec.id}: ran out of tiles arranging the wall`);
    }
    wall[index] = tile;
  }

  return {
    wall: wall.map((tile, index) => {
      if (tile === undefined) {
        throw new ScenarioSpecError(`Scenario ${spec.id}: wall slot ${String(index)} is empty`);
      }
      return tile;
    }),
    hands: dealt,
  };
}

/** The unspent ordinary tiles, in canonical order. Never a flower or season. */
function spareOrdinary(pool: Map<TileKind, Tile[]>): readonly Tile[] {
  const ordinary: Tile[] = [];
  for (const [kind, copies] of pool) {
    if (isBonusKind(kind)) continue;
    ordinary.push(...copies);
  }
  return ordinary;
}

/**
 * The wall behind the deal and the scripted draws: whatever padding did not
 * spend, with the bonus tiles moved into the middle of it.
 *
 * Both ends matter. The head is where the next ordinary draws come from and
 * the tail is where kong and bonus replacements are taken, and a lesson should
 * not have either turn into a flower it never asked about.
 */
function wallFiller(
  pool: Map<TileKind, Tile[]>,
  spare: readonly Tile[],
  spent: number,
): readonly Tile[] {
  const bonuses: Tile[] = [];
  for (const [kind, copies] of pool) {
    if (isBonusKind(kind)) bonuses.push(...copies);
  }
  const remaining = spare.slice(spent);
  const midpoint = Math.floor(remaining.length / 2);
  return [...remaining.slice(0, midpoint), ...bonuses, ...remaining.slice(midpoint)];
}

/**
 * Builds the scenario's opening state through the production deal, then checks
 * that what was dealt is what the scenario asked for.
 *
 * The check is not ceremony. It is the one place that proves the index
 * arithmetic above still matches the engine's deal: if `buildHand` ever changes
 * how it distributes packets, every scenario fails loudly here instead of
 * quietly teaching from a hand nobody designed.
 */
export function createScenarioState(spec: ScenarioSpec): InternalGameState {
  const resolved = buildScenarioWall(spec);
  const state = createScenarioGame(
    `scenario:${spec.id}`,
    spec.profile,
    resolved.wall,
    spec.dealer,
  );

  for (const seat of [0, 1, 2, 3] as const) {
    const dealt = state.players[seat].concealed.map((tile) => tile.id).join(",");
    const wanted = resolved.hands[seat].map((tile) => tile.id).join(",");
    if (dealt !== wanted) {
      throw new ScenarioSpecError(
        `Scenario ${spec.id}: seat ${String(seat)} was dealt ${dealt} but the scenario arranged ${wanted}`,
      );
    }
  }
  return state;
}

/** The bonus kinds a scenario may never place. Exported for the spec tests. */
export const FORBIDDEN_IN_SCENARIO_HANDS: readonly TileKind[] = BONUS_TILE_KINDS;
