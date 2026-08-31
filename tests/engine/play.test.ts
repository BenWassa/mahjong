import { describe, expect, it } from 'vitest';
import { IllegalActionError, idsOfKind, kindOf, type Action } from '../../src/engine/index.js';
import { position } from '../helpers/position.js';
import { EAST, GREEN, m, NORTH, p, pair, RED, run, s, SOUTH, trip, WEST, WHITE } from '../helpers/kinds.js';

const id = (kind: number, copy = 0): number => idsOfKind(kind)[copy]!;
const types = (actions: Action[]): string[] => [...new Set(actions.map((a) => a.type))].sort();
const kinds = (ids: readonly number[]): number[] => ids.map(kindOf);

// --- Fixture hands. Every hand is 13 tiles; a seat on turn holds 14. --------

/** Dealer, on turn, about to discard 3m. */
const DEALER_HOLDS_3M = [m(3), ...run(p, 1), ...run(p, 4), ...run(s, 5), ...run(s, 7), EAST];
/** Dealer, on turn, about to discard a white dragon nobody wants. */
const DEALER_HOLDS_WHITE = [WHITE, ...run(p, 1), ...run(p, 4), ...run(s, 5), ...run(s, 7), EAST];
/** One tile from winning on 3m, and able to chow it with 1m2m or 4m5m. */
const WAITS_ON_3M = [m(1), m(2), ...run(m, 4), ...run(s, 2), ...run(p, 7), ...pair(WEST)];
/** A different 3m wait, for testing two simultaneous wins. */
const ALSO_WAITS_ON_3M = [m(1), m(2), ...run(m, 7), ...run(s, 5), ...run(p, 4), ...pair(NORTH)];
/**
 * Holds two 3m so it can pung, but taking 3m leaves two floating honours, so it
 * can never win on the tile. Keeping pung and win apart matters: several tests
 * below assert that exactly one seat is eligible.
 */
const CAN_PUNG_3M = [m(3), m(3), ...run(s, 1), ...run(s, 5), ...run(p, 1), NORTH, SOUTH];
/** Wants nothing that the other fixtures discard. */
const FILLER = [...run(m, 7), ...run(s, 3), ...run(p, 4), ...run(p, 7), GREEN];
const FILLER_ALT = [...run(m, 6), ...run(s, 4), ...run(p, 2), ...run(p, 5), SOUTH];

describe('claims on a discard', () => {
  it('RULE-CLAIM-1: only the next seat may chow', () => {
    const game = position({
      hands: [DEALER_HOLDS_3M, WAITS_ON_3M, CAN_PUNG_3M, FILLER],
      live: { tile: id(m(3)) },
    });
    game.act({ type: 'discard', seat: 0, tile: id(m(3)) });

    expect(types(game.legalActions(1))).toContain('chow');
    expect(types(game.legalActions(2))).not.toContain('chow');
    expect(() => game.act({ type: 'chow', seat: 2, low: m(3) })).toThrow(IllegalActionError);
  });

  it('RULE-CLAIM-2: a pung outranks a chow', () => {
    const game = position({
      hands: [DEALER_HOLDS_3M, WAITS_ON_3M, CAN_PUNG_3M, FILLER],
      live: { tile: id(m(3)) },
    });
    game.act({ type: 'discard', seat: 0, tile: id(m(3)) });
    game.act({ type: 'chow', seat: 1, low: m(1) });
    game.act({ type: 'pung', seat: 2 });

    const state = game.debugState();
    expect(state.seats[2].melds).toHaveLength(1);
    expect(state.seats[2].melds[0]!.kind).toBe('pung');
    expect(state.seats[1].melds).toHaveLength(0);
    expect(state.phase).toEqual({ t: 'action', seat: 2 });
    expect(game.invariantViolations()).toEqual([]);
  });

  it('RULE-CLAIM-2: a win outranks a pung', () => {
    const game = position({
      hands: [DEALER_HOLDS_3M, WAITS_ON_3M, CAN_PUNG_3M, FILLER],
      live: { tile: id(m(3)) },
    });
    game.act({ type: 'discard', seat: 0, tile: id(m(3)) });
    expect(types(game.legalActions(1))).toContain('win');
    game.act({ type: 'pung', seat: 2 });
    game.act({ type: 'win', seat: 1 });

    const result = game.handResult();
    expect(result?.outcome).toBe('win');
    expect(result?.win?.seat).toBe(1);
    expect(result?.win?.kind).toBe('discard');
    expect(result?.win?.from).toBe(0);
    expect(game.debugState().seats[2].melds).toHaveLength(0);
  });

  it('RULE-CLAIM-3: on a double win the seat nearest the discarder takes it', () => {
    const game = position({
      hands: [DEALER_HOLDS_3M, WAITS_ON_3M, ALSO_WAITS_ON_3M, FILLER],
      live: { tile: id(m(3)) },
    });
    game.act({ type: 'discard', seat: 0, tile: id(m(3)) });
    // Declared out of turn order on purpose: priority is by seat, not by speed.
    game.act({ type: 'win', seat: 2 });
    game.act({ type: 'win', seat: 1 });
    expect(game.handResult()?.win?.seat).toBe(1);
  });

  it('RULE-CLAIM-5: an unclaimable discard passes straight to the next seat', () => {
    const game = position({
      hands: [DEALER_HOLDS_WHITE, WAITS_ON_3M, ALSO_WAITS_ON_3M, FILLER],
      wallHead: [m(1)],
      live: { tile: id(WHITE) },
    });
    game.act({ type: 'discard', seat: 0, tile: id(WHITE) });
    // No claim window at all: seat 1 has already drawn.
    expect(game.debugState().phase).toEqual({ t: 'action', seat: 1 });
    expect(game.debugState().seats[1].concealed).toHaveLength(14);
  });

  it('a claim window waits for every eligible seat before resolving', () => {
    const game = position({
      hands: [DEALER_HOLDS_3M, WAITS_ON_3M, CAN_PUNG_3M, FILLER],
      live: { tile: id(m(3)) },
    });
    game.act({ type: 'discard', seat: 0, tile: id(m(3)) });
    game.act({ type: 'pass', seat: 1 });
    expect(game.debugState().phase.t).toBe('claims');
    game.act({ type: 'pass', seat: 2 });
    expect(game.debugState().phase).toEqual({ t: 'action', seat: 1 });
  });

  it('a seat cannot declare twice in one claim window', () => {
    const game = position({
      hands: [DEALER_HOLDS_3M, WAITS_ON_3M, CAN_PUNG_3M, FILLER],
      live: { tile: id(m(3)) },
    });
    game.act({ type: 'discard', seat: 0, tile: id(m(3)) });
    game.act({ type: 'pass', seat: 1 });
    expect(() => game.act({ type: 'pass', seat: 1 })).toThrow(IllegalActionError);
  });
});

describe('kongs', () => {
  /** Four 5m concealed, plus ten unrelated tiles. */
  const FOUR_5M = [...trip(m(5)), m(5), ...run(p, 1), ...run(s, 5), ...pair(EAST), s(8), s(9)];
  /** An exposed 5m pung plus the fourth 5m in hand. */
  const PUNG_PLUS_5M = [m(5), ...run(p, 1), ...run(s, 5), ...pair(EAST), s(8), s(9)];
  /** Waiting on 5m through 3m4m, which is the only way a kong can be robbed. */
  const WAITS_ON_5M = [m(3), m(4), ...run(s, 1), ...run(p, 4), ...run(p, 7), ...pair(WEST)];

  it('RULE-KONG-2: a concealed kong stays concealed and draws a replacement', () => {
    const game = position({
      hands: [FOUR_5M, WAITS_ON_5M, FILLER, FILLER_ALT],
      wallTail: [p(3)],
      live: { tile: id(m(5), 3) },
    });
    game.act({ type: 'concealed-kong', seat: 0, kind: m(5) });

    const state = game.debugState();
    expect(state.seats[0].melds[0]!.kind).toBe('kong-concealed');
    expect(state.seats[0].melds[0]!.tiles).toHaveLength(4);
    expect(kinds(state.seats[0].concealed)).toContain(p(3));
    expect(state.phase).toEqual({ t: 'action', seat: 0 });
    expect(state.live.fromKongReplacement).toBe(true);
    expect(game.invariantViolations()).toEqual([]);
  });

  it('RULE-ROB-2: a concealed kong cannot be robbed even by a waiting seat', () => {
    const game = position({
      hands: [FOUR_5M, WAITS_ON_5M, FILLER, FILLER_ALT],
      wallTail: [p(3)],
      live: { tile: id(m(5), 3) },
    });
    game.act({ type: 'concealed-kong', seat: 0, kind: m(5) });
    expect(game.debugState().phase).toEqual({ t: 'action', seat: 0 });
    expect(game.handResult()).toBeNull();
  });

  it('RULE-WALL-2: a kong is illegal when the wall is empty', () => {
    const game = position({
      hands: [FOUR_5M, WAITS_ON_5M, FILLER, FILLER_ALT],
      wallRemaining: 0,
      live: { tile: id(m(5), 3) },
    });
    expect(types(game.legalActions(0))).not.toContain('concealed-kong');
    expect(() => game.act({ type: 'concealed-kong', seat: 0, kind: m(5) })).toThrow(IllegalActionError);
  });

  it('RULE-ROB-1/3: an added kong can be robbed, and the pung survives', () => {
    const game = position({
      melds: [[{ kind: 'pung', low: m(5), claimedFrom: 3 }], [], [], []],
      hands: [PUNG_PLUS_5M, WAITS_ON_5M, FILLER, FILLER_ALT],
      wallTail: [p(3)],
      live: { tile: id(m(5), 3) },
    });
    game.act({ type: 'added-kong', seat: 0, kind: m(5) });
    expect(game.debugState().phase.t).toBe('rob');
    game.act({ type: 'win', seat: 1 });

    const result = game.handResult();
    expect(result?.win?.kind).toBe('robbed-kong');
    expect(result?.win?.seat).toBe(1);
    expect(result?.win?.from).toBe(0);

    const meld = game.debugState().seats[0].melds[0]!;
    expect(meld.kind).toBe('pung');
    expect(meld.tiles).toHaveLength(3);
    expect(game.invariantViolations()).toEqual([]);
  });

  it('an unrobbed added kong completes and draws a replacement', () => {
    const game = position({
      melds: [[{ kind: 'pung', low: m(5), claimedFrom: 3 }], [], [], []],
      hands: [PUNG_PLUS_5M, WAITS_ON_5M, FILLER, FILLER_ALT],
      wallTail: [p(3)],
      live: { tile: id(m(5), 3) },
    });
    game.act({ type: 'added-kong', seat: 0, kind: m(5) });
    game.act({ type: 'pass', seat: 1 });

    const state = game.debugState();
    expect(state.seats[0].melds[0]!.kind).toBe('kong-added');
    expect(state.seats[0].melds[0]!.tiles).toHaveLength(4);
    expect(state.live.fromKongReplacement).toBe(true);
    expect(state.phase).toEqual({ t: 'action', seat: 0 });
    expect(game.invariantViolations()).toEqual([]);
  });

  it('RULE-CLAIM-2: an exposed kong claim takes three tiles from hand and draws', () => {
    const game = position({
      hands: [DEALER_HOLDS_3M, WAITS_ON_3M, [...trip(m(3)), ...run(s, 1), ...run(p, 1), ...pair(NORTH), s(8), s(9)], FILLER],
      wallTail: [p(3)],
      live: { tile: id(m(3)) },
    });
    game.act({ type: 'discard', seat: 0, tile: id(m(3)) });
    game.act({ type: 'pass', seat: 1 });
    game.act({ type: 'kong', seat: 2 });

    const state = game.debugState();
    expect(state.seats[2].melds[0]!.kind).toBe('kong-exposed');
    expect(state.seats[2].melds[0]!.tiles).toHaveLength(4);
    expect(state.phase).toEqual({ t: 'action', seat: 2 });
    expect(game.invariantViolations()).toEqual([]);
  });
});

describe('the end of the wall', () => {
  it('RULE-DRAW-4: with an empty wall only Win is offered on the discard', () => {
    const game = position({
      hands: [DEALER_HOLDS_3M, WAITS_ON_3M, CAN_PUNG_3M, FILLER],
      wallRemaining: 0,
      live: { tile: id(m(3)) },
    });
    game.act({ type: 'discard', seat: 0, tile: id(m(3)) });
    const actions = game.legalActions();
    expect(types(actions)).toContain('win');
    expect(types(actions)).not.toContain('pung');
    expect(types(actions)).not.toContain('chow');
  });

  it('RULE-FAAN-C4: winning on the final discard is flagged as such', () => {
    const game = position({
      hands: [DEALER_HOLDS_3M, WAITS_ON_3M, CAN_PUNG_3M, FILLER],
      wallRemaining: 0,
      live: { tile: id(m(3)) },
    });
    game.act({ type: 'discard', seat: 0, tile: id(m(3)) });
    game.act({ type: 'win', seat: 1 });
    expect(game.handResult()?.win?.onLastDiscard).toBe(true);
  });

  it('RULE-DRAW-1/2: an exhaustive draw pays nothing and rotates the dealer', () => {
    const game = position({
      hands: [DEALER_HOLDS_WHITE, WAITS_ON_3M, ALSO_WAITS_ON_3M, FILLER],
      wallRemaining: 0,
      live: { tile: id(WHITE) },
    });
    game.act({ type: 'discard', seat: 0, tile: id(WHITE) });

    const result = game.handResult()!;
    expect(result.outcome).toBe('exhaustive-draw');
    expect(result.payments).toEqual([0, 0, 0, 0]);
    expect(result.dealerContinues).toBe(false);

    game.act({ type: 'next-hand' });
    // RULE-DRAW-3: asserted explicitly, because it is the deliberate divergence
    // from the more common 流局連莊 and flipping it must be a conscious act.
    expect(game.debugState().dealer).toBe(1);
  });

  it('RULE-FAAN-C3: self-drawing the last wall tile is flagged', () => {
    const game = position({
      hands: [
        DEALER_HOLDS_WHITE,
        [...run(m, 1), ...run(m, 4), ...run(s, 2), ...run(p, 7), EAST],
        FILLER,
        FILLER_ALT,
      ],
      wallHead: [EAST],
      wallRemaining: 1,
      live: { tile: id(WHITE) },
    });
    game.act({ type: 'discard', seat: 0, tile: id(WHITE) });
    const state = game.debugState();
    expect(state.phase).toEqual({ t: 'action', seat: 1 });
    expect(state.live.wasLastWallTile).toBe(true);
    game.act({ type: 'win', seat: 1 });
    expect(game.handResult()?.win?.onLastWallTile).toBe(true);
  });
});

describe('dealer and round progression', () => {
  const DEALER_ALREADY_WON = [...run(m, 1), ...run(m, 4), ...run(s, 2), ...run(p, 7), ...pair(EAST)];

  it('RULE-PROG-1: the dealer keeps the deal after winning', () => {
    const game = position({
      hands: [DEALER_ALREADY_WON, ALSO_WAITS_ON_3M, FILLER, FILLER_ALT],
      live: { tile: id(EAST, 1) },
    });
    game.act({ type: 'win', seat: 0 });
    expect(game.handResult()?.dealerContinues).toBe(true);
    game.act({ type: 'next-hand' });
    expect(game.debugState().dealer).toBe(0);
    expect(game.debugState().roundWind).toBe('east');
  });

  it('RULE-FAAN-E4: the dealer winning on the opening hand is a heavenly hand', () => {
    const game = position({
      hands: [DEALER_ALREADY_WON, ALSO_WAITS_ON_3M, FILLER, FILLER_ALT],
      discardCount: 0,
      live: { tile: id(EAST, 1) },
    });
    game.act({ type: 'win', seat: 0 });
    expect(game.handResult()?.win?.heavenly).toBe(true);
  });

  it('RULE-FAAN-E5: a non-dealer winning on the first discard is an earthly hand', () => {
    const game = position({
      hands: [DEALER_HOLDS_3M, WAITS_ON_3M, FILLER, FILLER_ALT],
      discardCount: 0,
      live: { tile: id(m(3)) },
    });
    game.act({ type: 'discard', seat: 0, tile: id(m(3)) });
    game.act({ type: 'win', seat: 1 });
    expect(game.handResult()?.win?.earthly).toBe(true);
  });

  it('RULE-PROG-1: the deal rotates after a non-dealer win', () => {
    const game = position({
      hands: [DEALER_HOLDS_3M, WAITS_ON_3M, FILLER, FILLER_ALT],
      live: { tile: id(m(3)) },
    });
    game.act({ type: 'discard', seat: 0, tile: id(m(3)) });
    game.act({ type: 'win', seat: 1 });
    game.act({ type: 'next-hand' });
    expect(game.debugState().dealer).toBe(1);
  });

  it('RULE-PROG-2: a single-hand match ends after one hand', () => {
    const game = position(
      { hands: [DEALER_ALREADY_WON, ALSO_WAITS_ON_3M, FILLER, FILLER_ALT], live: { tile: id(EAST, 1) } },
      { config: { matchLength: 'single-hand' } },
    );
    game.act({ type: 'win', seat: 0 });
    expect(game.isMatchOver()).toBe(true);
    expect(game.legalActions()).toEqual([]);
  });
});
