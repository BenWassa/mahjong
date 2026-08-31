/**
 * Wall construction and the deal. docs/HKOS_RULES.md §3.
 */

import type { RulesProfile } from './config.js';
import { makeRng, shuffle } from './rng.js';
import { FIRST_BONUS_ID, TILE_COUNT, TILE_COUNT_NO_BONUS, type TileId } from './tiles.js';

/** All tile ids for a profile, in canonical order. §2.1 */
export function tileSetFor(profile: RulesProfile): TileId[] {
  const n = profile.tileSet === 144 ? TILE_COUNT : TILE_COUNT_NO_BONUS;
  const ids: TileId[] = new Array(n);
  for (let i = 0; i < n; i++) ids[i] = i;
  return ids;
}

/**
 * The wall for one hand. Seeded per hand so that replaying a match reproduces
 * every hand, not only the first.
 */
export function buildWall(profile: RulesProfile, seed: string, handNumber: number): TileId[] {
  return shuffle(tileSetFor(profile), makeRng(`${seed}#${handNumber}`));
}

/**
 * The traditional deal order: four tiles at a time for three rounds, then one
 * each, then one more to the dealer. §3.1
 *
 * The wall is a single shuffled sequence, so this pattern does not change the
 * distribution. It exists so the game record reads like a real deal.
 */
export function dealOrder(dealerIndex: number): number[] {
  const order: number[] = [];
  for (let round = 0; round < 3; round++) {
    for (let s = 0; s < 4; s++) {
      const seat = (dealerIndex + s) % 4;
      for (let t = 0; t < 4; t++) order.push(seat);
    }
  }
  for (let s = 0; s < 4; s++) order.push((dealerIndex + s) % 4);
  order.push(dealerIndex); // the dealer's 14th tile
  return order;
}

export function isBonusTile(id: TileId): boolean {
  return id >= FIRST_BONUS_ID;
}
