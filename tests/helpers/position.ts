/**
 * Test fixtures: build an exact table position.
 *
 * The engine deals from a seeded wall, which is right for play but useless for
 * asserting a specific rule. This helper rewrites a freshly created game into a
 * chosen position, allocating real TileIds so tile conservation still holds, and
 * then re-checks the invariants so that a broken *fixture* fails loudly instead
 * of producing a misleading test result.
 */

import { MahjongGame, type GameOptions } from '../../src/engine/index.js';
import type { Meld, MeldKind } from '../../src/engine/melds.js';
import type { Seat, TileId, TileKind, Wind } from '../../src/engine/tiles.js';
import { idsOfKind, isBonusId, sortTiles } from '../../src/engine/tiles.js';
import { assertSound } from '../../src/engine/invariants.js';
import type { GameState, Phase } from '../../src/engine/types.js';

export interface MeldSpec {
  kind: MeldKind;
  low: TileKind;
  claimedFrom?: Seat;
}

export interface PositionSpec {
  dealer?: Seat;
  roundWind?: Wind;
  /** Concealed tiles per seat, as kinds. Melded tiles are listed separately. */
  hands: [TileKind[], TileKind[], TileKind[], TileKind[]];
  melds?: [MeldSpec[], MeldSpec[], MeldSpec[], MeldSpec[]];
  bonus?: [TileKind[], TileKind[], TileKind[], TileKind[]];
  /** Tiles drawn next from the head, in draw order. */
  wallHead?: TileKind[];
  /** Tiles drawn as replacements, in the order they will be taken from the tail. */
  wallTail?: TileKind[];
  discards?: Array<{ seat: Seat; kind: TileKind }>;
  phase?: Phase;
  live?: Partial<GameState['live']>;
  discardCount?: number;
  /** Total tiles that must remain drawable. Defaults to whatever is left over. */
  wallRemaining?: number;
}

/** Hands out distinct TileIds for repeated kinds, four copies maximum. */
class TilePool {
  readonly #used = new Map<TileKind, number>();

  take(kind: TileKind): TileId {
    const taken = this.#used.get(kind) ?? 0;
    const ids = idsOfKind(kind);
    const id = ids[taken];
    if (id === undefined) throw new Error(`fixture uses a 5th copy of kind ${kind}`);
    this.#used.set(kind, taken + 1);
    return id;
  }

  takeMany(kinds: readonly TileKind[]): TileId[] {
    return kinds.map((k) => this.take(k));
  }

  /** Everything not yet handed out, ascending. */
  remaining(all: readonly TileId[]): TileId[] {
    const claimed = new Set<TileId>();
    for (const [kind, count] of this.#used) {
      for (const id of idsOfKind(kind).slice(0, count)) claimed.add(id);
    }
    return all.filter((id) => !claimed.has(id));
  }
}

function meldTiles(pool: TilePool, spec: MeldSpec): TileId[] {
  if (spec.kind === 'chow') return pool.takeMany([spec.low, spec.low + 1, spec.low + 2]);
  const copies = spec.kind === 'pung' ? 3 : 4;
  return pool.takeMany(Array.from({ length: copies }, () => spec.low));
}

/**
 * Create a game and force it into `spec`. Returns the game plus its mutable
 * internal state, because fixtures legitimately need both.
 */
export function position(spec: PositionSpec, options: GameOptions = {}): MahjongGame {
  // Fixtures default to the 136-tile set: bonus tiles cannot be discarded, so
  // they would otherwise be stranded in the wall and make a short-wall fixture
  // impossible. Tests about flowers opt into 144 and place all eight.
  const game = new MahjongGame('fixture', {
    ...options,
    config: { minimumFaan: 'beginner', tileSet: 136, ...options.config },
  });
  const state = game.debugState();
  const pool = new TilePool();
  const allIds = [...state.wall].sort((a, b) => a - b);

  state.dealer = spec.dealer ?? 0;
  state.roundWind = spec.roundWind ?? 'east';
  state.discardPile = [];
  state.handResult = null;
  state.results.length = 0;

  for (const seat of [0, 1, 2, 3] as const) {
    const s = state.seats[seat];
    s.melds = (spec.melds?.[seat] ?? []).map((m): Meld => {
      const tiles = meldTiles(pool, m);
      return {
        kind: m.kind,
        tiles,
        low: m.low,
        claimedFrom: m.kind === 'kong-concealed' ? null : (m.claimedFrom ?? (((seat + 3) & 3) as Seat)),
        claimedTile: m.kind === 'kong-concealed' ? null : (tiles.at(-1) ?? null),
      };
    });
    s.concealed = sortTiles(pool.takeMany(spec.hands[seat]));
    s.bonus = pool.takeMany(spec.bonus?.[seat] ?? []);
    s.score = 0;
  }

  for (const d of spec.discards ?? []) {
    state.discardPile.push({ tile: pool.take(d.kind), seat: d.seat });
  }

  const head = pool.takeMany(spec.wallHead ?? []);
  const tail = pool.takeMany(spec.wallTail ?? []);
  const filler = pool.remaining(allIds);

  // Shortening the wall must not make tiles vanish, or every later invariant
  // check would report a false conservation failure. Tiles pushed out of the
  // wall go to the discard pile, which is where they would be on a real table
  // late in a hand. Bonus tiles never reach the discard pile, so they stay in
  // the wall.
  const want = spec.wallRemaining;
  const keep: TileId[] = [];
  const dump: TileId[] = [];
  if (want === undefined) {
    keep.push(...filler);
  } else {
    let room = Math.max(0, want - head.length - tail.length);
    for (const id of filler) {
      if (isBonusId(id) || room > 0) {
        keep.push(id);
        if (!isBonusId(id)) room--;
      } else {
        dump.push(id);
      }
    }
    const actual = head.length + tail.length + keep.length;
    if (actual !== want) {
      throw new Error(`fixture cannot leave ${want} tiles in the wall; nearest is ${actual}`);
    }
  }
  for (let i = 0; i < dump.length; i++) {
    state.discardPile.push({ tile: dump[i]!, seat: (i & 3) as Seat });
  }

  // Layout: [head draws..., filler..., reversed tail draws...]. Replacements
  // are taken from the end, so the tail list is stored back to front.
  state.wall = [...head, ...keep, ...[...tail].reverse()];
  state.head = 0;
  state.tail = state.wall.length;

  state.discardCount = spec.discardCount ?? state.discardPile.length;
  state.live = {
    tile: null,
    fromKongReplacement: false,
    wasLastWallTile: false,
    firstUninterruptedTurn: false,
    ...spec.live,
  };
  state.phase = spec.phase ?? { t: 'action', seat: state.dealer };

  assertSound(state, 'fixture');
  return game;
}
