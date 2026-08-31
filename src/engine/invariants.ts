/**
 * Structural invariants. These are product code, not test helpers: the
 * simulation harness runs them after every action, and a violation is a bug
 * report with a seed attached.
 *
 * docs/HKOS_RULES.md §2.1 (tile set), §3 (wall), §4 (hand sizes).
 */

import { KIND_COUNT, isBonusId, kindOf, rankOf, suitOf, type TileId } from './tiles.js';
import { tilesLeft, type GameState } from './types.js';
import { tileSetFor } from './wall.js';

export interface Violation {
  rule: string;
  detail: string;
}

/** Every violation found, empty when the state is sound. */
export function checkInvariants(state: GameState): Violation[] {
  const problems: Violation[] = [];
  const push = (rule: string, detail: string): void => {
    problems.push({ rule, detail });
  };

  // --- Wall indices -------------------------------------------------------
  if (state.head < 0 || state.tail > state.wall.length || state.head > state.tail) {
    push('WALL-INDICES', `head=${state.head} tail=${state.tail} len=${state.wall.length}`);
  }

  // --- Tile conservation: every id exactly once across every zone ---------
  // Sized by the profile's tile set, not by the current wall: the wall shrinks
  // as the hand is played, but the id space does not.
  const expected = tileSetFor(state.config).length;
  const seen = new Int8Array(expected);
  const bump = (id: TileId, zone: string): void => {
    if (id < 0 || id >= seen.length) {
      push('TILE-RANGE', `tile ${id} out of range in ${zone}`);
      return;
    }
    if (seen[id]! > 0) push('TILE-DUPLICATED', `tile ${id} appears twice (${zone})`);
    seen[id] = 1;
  };

  for (let i = state.head; i < state.tail; i++) bump(state.wall[i]!, 'wall');
  for (const seat of [0, 1, 2, 3] as const) {
    const s = state.seats[seat];
    for (const id of s.concealed) bump(id, `hand${seat}`);
    for (const meld of s.melds) for (const id of meld.tiles) bump(id, `meld${seat}`);
    for (const id of s.bonus) bump(id, `bonus${seat}`);
  }
  for (const d of state.discardPile) {
    bump(d.tile, 'discards');
    // Bonus tiles are revealed, never discarded. §2.1, RULE-FLOWER-3
    if (isBonusId(d.tile)) push('BONUS-DISCARDED', `bonus tile ${d.tile} is in the discard pile`);
  }

  let accounted = 0;
  for (let i = 0; i < seen.length; i++) accounted += seen[i]!;
  if (accounted !== expected) {
    push('TILE-CONSERVATION', `${accounted} of ${expected} tiles accounted for`);
  }

  // --- Hand shape ---------------------------------------------------------
  let live = 0;
  for (const seat of [0, 1, 2, 3] as const) {
    const s = state.seats[seat];
    const slots = s.concealed.length + 3 * s.melds.length;
    if (slots !== 13 && slots !== 14) {
      push('HAND-SIZE', `seat ${seat} occupies ${slots} slots`);
    }
    if (slots === 14) live++;

    for (const id of s.concealed) {
      if (isBonusId(id)) push('BONUS-IN-HAND', `seat ${seat} holds bonus tile ${id}`);
    }
    for (const id of s.bonus) {
      if (!isBonusId(id)) push('NON-BONUS-REVEALED', `seat ${seat} revealed non-bonus ${id}`);
    }
    const sorted = [...s.concealed].sort((a, b) => kindOf(a) - kindOf(b) || a - b);
    if (sorted.some((id, i) => id !== s.concealed[i])) {
      push('HAND-UNSORTED', `seat ${seat} hand is not in canonical order`);
    }

    for (const meld of s.melds) {
      const kinds = meld.tiles.map(kindOf);
      const size = meld.tiles.length;
      if (meld.kind === 'chow') {
        if (size !== 3) push('MELD-SHAPE', `seat ${seat} chow has ${size} tiles`);
        else if (
          kinds[0] !== meld.low ||
          kinds[1] !== meld.low + 1 ||
          kinds[2] !== meld.low + 2 ||
          suitOf(kinds[0]!) !== suitOf(kinds[2]!) ||
          rankOf(kinds[0]!) === 0
        ) {
          push('MELD-SHAPE', `seat ${seat} chow ${kinds.join(',')} is not a run`);
        }
      } else {
        const wanted = meld.kind === 'pung' ? 3 : 4;
        if (size !== wanted) push('MELD-SHAPE', `seat ${seat} ${meld.kind} has ${size} tiles`);
        if (kinds.some((k) => k !== meld.low)) {
          push('MELD-SHAPE', `seat ${seat} ${meld.kind} mixes kinds ${kinds.join(',')}`);
        }
      }
      if (meld.low < 0 || meld.low >= KIND_COUNT) push('MELD-KIND', `bad low ${meld.low}`);
    }
  }

  if (state.phase.t === 'action' && live !== 1) {
    push('LIVE-HAND', `${live} seats hold 14 slots during an action phase`);
  }
  if ((state.phase.t === 'claims' || state.phase.t === 'rob') && live !== 0) {
    push('LIVE-HAND', `${live} seats hold 14 slots during a claim window`);
  }

  // --- Scores -------------------------------------------------------------
  const total = state.seats.reduce((sum, s) => sum + s.score, 0);
  if (total !== 0) push('SCORE-SUM', `scores sum to ${total}, not 0`);

  if (tilesLeft(state) < 0) push('WALL-NEGATIVE', `wall has ${tilesLeft(state)} tiles`);

  return problems;
}

export function assertSound(state: GameState, context = ''): void {
  const problems = checkInvariants(state);
  if (problems.length === 0) return;
  const lines = problems.map((p) => `  ${p.rule}: ${p.detail}`).join('\n');
  throw new Error(`invariant violation${context ? ` (${context})` : ''}:\n${lines}`);
}
