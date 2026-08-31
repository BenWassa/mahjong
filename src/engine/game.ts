/**
 * The engine: state transitions, legality, and hand/round progression.
 *
 * Contract: docs/HKOS_RULES.md. Every rule identifier referenced in a comment
 * has a test of the same name in the corpus.
 *
 * Purity: this module reads nothing but its arguments. No clock, no ambient
 * RNG, no I/O. RULE-DET-1
 */

import { FAAN_CEILING, minimumFaanOf, type RulesProfile } from './config.js';
import {
  chowShapesFor,
  completesThirteenOrphans,
  isCompleteHand,
  isExposed,
  type Meld,
} from './melds.js';
import type { ScoreInput, Scorer } from './scoring/index.js';
import { applyPayments, noPayments, settle, type Payments } from './settle.js';
import {
  SEATS,
  WINDS,
  countsOf,
  isBonusId,
  kindOf,
  nextSeat,
  seatDistance,
  sortTiles,
  type Seat,
  type TileId,
  type TileKind,
  type Wind,
} from './tiles.js';
import {
  tilesLeft,
  type Action,
  type ClaimDeclaration,
  type GameEvent,
  type GameState,
  type HandResult,
  type Phase,
  type SeatState,
  type WinContext,
} from './types.js';
import { buildWall, dealOrder } from './wall.js';

export interface EngineDeps {
  scorer: Scorer;
}

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * True once the hand has been concluded. Read through a function so that
 * narrowing from an earlier phase assignment does not hide the check.
 */
function handIsOver(state: GameState): boolean {
  return state.phase.t === 'hand-over' || state.phase.t === 'match-over';
}

function emptySeat(): SeatState {
  return { concealed: [], melds: [], bonus: [], score: 0 };
}

export function newGame(config: RulesProfile, seed: string, deps: EngineDeps): GameState {
  const state: GameState = {
    config,
    seed,
    wall: [],
    head: 0,
    tail: 0,
    seats: [emptySeat(), emptySeat(), emptySeat(), emptySeat()],
    dealer: 0,
    roundWind: 'east',
    roundStartDealer: 0,
    dealsThisRound: 0,
    handNumber: 0,
    phase: { t: 'action', seat: 0 },
    live: { tile: null, fromKongReplacement: false, wasLastWallTile: false, firstUninterruptedTurn: true },
    discardPile: [],
    discardCount: 0,
    handResult: null,
    results: [],
    lastEvents: [],
  };
  startHand(state, deps);
  return state;
}

/** Deal a hand. Mutates `state` in place; only ever called on a fresh or finished hand. */
function startHand(state: GameState, deps: EngineDeps): void {
  const events: GameEvent[] = [];
  const carried = lastScores(state);
  state.seats = [emptySeat(), emptySeat(), emptySeat(), emptySeat()];
  for (const seat of SEATS) state.seats[seat].score = carried[seat];

  state.wall = buildWall(state.config, state.seed, state.handNumber);
  state.head = 0;
  state.tail = state.wall.length;
  state.discardPile = [];
  state.discardCount = 0;
  state.handResult = null;
  // Reset the phase before dealing. The bonus-resolution loop below detects an
  // instant win by looking for a 'hand-over' phase, and the previous hand left
  // exactly that phase behind: without this reset every hand after the first
  // would abort at the deal.
  state.phase = { t: 'action', seat: state.dealer };
  state.live = {
    tile: null,
    fromKongReplacement: false,
    wasLastWallTile: false,
    firstUninterruptedTurn: true,
  };

  events.push({
    t: 'hand-start',
    dealer: state.dealer,
    roundWind: state.roundWind,
    handNumber: state.handNumber,
  });

  // §3.1 steps 1–3.
  for (const seatIndex of dealOrder(state.dealer)) {
    const seat = seatIndex as Seat;
    state.seats[seat].concealed.push(state.wall[state.head++]!);
  }
  for (const seat of SEATS) sortTiles(state.seats[seat].concealed);

  // §3.1 step 4 / §3.3: resolve bonus tiles seat by seat from the dealer,
  // repeating until nobody holds one. RULE-FLOWER-2
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (let i = 0; i < 4; i++) {
      const seat = ((state.dealer + i) & 3) as Seat;
      if (revealBonusTiles(state, seat, events, deps)) progressed = true;
      if (handIsOver(state)) {
        state.lastEvents = events;
        return;
      }
    }
  }

  // The dealer starts holding 14 tiles, so a live tile exists. Which of the 14
  // it is has no observable effect: no supported faan depends on the identity
  // of the winning tile, only on how it arrived (§5.C).
  state.live.tile = state.seats[state.dealer].concealed.at(-1) ?? null;
  state.phase = { t: 'action', seat: state.dealer };
  state.lastEvents = events;
}

function lastScores(state: GameState): [number, number, number, number] {
  const last = state.results.at(-1);
  return last ? last.scoresAfter : [0, 0, 0, 0];
}

/**
 * Move every bonus tile out of a seat's concealed tiles and draw replacements
 * from the tail. Returns true if anything was revealed. §3.3
 */
function revealBonusTiles(
  state: GameState,
  seat: Seat,
  events: GameEvent[],
  deps: EngineDeps,
): boolean {
  let revealed = false;
  for (;;) {
    const index = state.seats[seat].concealed.findIndex(isBonusId);
    if (index < 0) break;
    const [tile] = state.seats[seat].concealed.splice(index, 1) as [TileId];
    state.seats[seat].bonus.push(tile);
    events.push({ t: 'bonus', seat, tile });
    revealed = true;

    if (checkBonusInstantWin(state, seat, events, deps)) return true;

    if (tilesLeft(state) === 0) {
      // No replacement is available. RULE-FLOWER-4
      endHandAsDraw(state, events);
      return true;
    }
    const replacement = state.wall[--state.tail]!;
    state.seats[seat].concealed.push(replacement);
    events.push({ t: 'draw', seat, tile: replacement, replacement: true });
    sortTiles(state.seats[seat].concealed);
  }
  return revealed;
}

/** §6.3. Checked immediately after each reveal, before the replacement draw. */
function checkBonusInstantWin(
  state: GameState,
  seat: Seat,
  events: GameEvent[],
  deps: EngineDeps,
): boolean {
  const held = state.seats[seat].bonus.length;
  const instant = held >= 8 ? 'eight-immortals' : held === 7 ? 'seven-flowers' : null;
  if (!instant) return false;
  const win: WinContext = {
    ...baseWinContext(state, seat),
    kind: 'flower-instant',
    from: null,
    tile: null,
    bonusInstant: instant,
  };
  finishHandWithWin(state, win, events, deps);
  return true;
}

// ---------------------------------------------------------------------------
// Win context
// ---------------------------------------------------------------------------

export function seatWindOf(state: GameState, seat: Seat): Wind {
  return WINDS[seatDistance(state.dealer, seat)]!;
}

function baseWinContext(state: GameState, seat: Seat): WinContext {
  return {
    seat,
    kind: 'self-draw',
    from: null,
    tile: null,
    seatWind: seatWindOf(state, seat),
    roundWind: state.roundWind,
    isDealer: seat === state.dealer,
    onKongReplacement: false,
    onLastWallTile: false,
    onLastDiscard: false,
    heavenly: false,
    earthly: false,
    bonusInstant: null,
  };
}

/** The full §5.C circumstance set for a proposed win. Used for legality and settlement. */
export function buildWinContext(
  state: GameState,
  seat: Seat,
  kind: 'self-draw' | 'discard' | 'robbed-kong',
  from: Seat | null,
  tile: TileId,
): WinContext {
  const ctx = baseWinContext(state, seat);
  ctx.kind = kind;
  ctx.from = from;
  ctx.tile = tile;

  if (kind === 'self-draw') {
    ctx.onKongReplacement = state.live.fromKongReplacement;
    ctx.onLastWallTile = state.live.wasLastWallTile;
    // 天糊: the dealer's opening 14 tiles already win, before anything happens. §5.E4
    ctx.heavenly =
      seat === state.dealer &&
      state.discardCount === 0 &&
      state.seats[seat].melds.length === 0 &&
      !state.live.fromKongReplacement;
  } else if (kind === 'discard') {
    ctx.onLastDiscard = tilesLeft(state) === 0;
    // 地糊: a non-dealer wins on the dealer's very first discard. §5.E5
    ctx.earthly =
      seat !== state.dealer &&
      from === state.dealer &&
      state.discardCount === 1 &&
      state.seats[seat].melds.length === 0;
  }
  return ctx;
}

function scoreInputFor(state: GameState, win: WinContext, extraTile: TileId | null): ScoreInput {
  const seat = state.seats[win.seat];
  const concealed = extraTile === null ? [...seat.concealed] : sortTiles([...seat.concealed, extraTile]);
  return {
    win,
    concealed,
    melds: seat.melds,
    bonus: seat.bonus,
    profile: state.config,
  };
}

/**
 * Is a win legal for `seat`? Structure first (cheap), then the minimum-faan
 * gate on *qualifying* faan. §6.4, §7.1, §7.4, RULE-WIN-7
 */
function canWin(
  state: GameState,
  deps: EngineDeps,
  seat: Seat,
  kind: 'self-draw' | 'discard' | 'robbed-kong',
  from: Seat | null,
  tile: TileId,
): boolean {
  const seatState = state.seats[seat];
  const claimed = kind !== 'self-draw';
  const counts = countsOf(claimed ? [...seatState.concealed, tile] : seatState.concealed);
  if (!isCompleteHand(counts, seatState.melds)) return false;

  const win = buildWinContext(state, seat, kind, from, tile);
  const breakdown = deps.scorer(scoreInputFor(state, win, claimed ? tile : null));
  return breakdown.qualifyingFaan >= minimumFaanOf(state.config);
}

// ---------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------

/** Every legal action in the current phase, optionally filtered to one seat. */
export function legalActions(state: GameState, deps: EngineDeps, seat?: Seat): Action[] {
  const all = allLegalActions(state, deps);
  if (seat === undefined) return all;
  return all.filter((a) => a.type === 'next-hand' || a.seat === seat);
}

function allLegalActions(state: GameState, deps: EngineDeps): Action[] {
  switch (state.phase.t) {
    case 'action':
      return turnActions(state, deps, state.phase.seat);
    case 'claims':
      return claimActions(state, deps, state.phase);
    case 'rob':
      return robActions(state, state.phase);
    case 'hand-over':
      return [{ type: 'next-hand' }];
    case 'match-over':
      return [];
  }
}

function turnActions(state: GameState, deps: EngineDeps, seat: Seat): Action[] {
  const actions: Action[] = [];
  const s = state.seats[seat];

  // Win only on a tile the seat drew. A tile taken as a chow/pung is melded,
  // not held, so it can never complete the hand in the same breath. §4.2
  if (state.live.tile !== null) {
    const kind = 'self-draw' as const;
    if (canWin(state, deps, seat, kind, null, state.live.tile)) {
      actions.push({ type: 'win', seat });
    }
  }

  // Kongs need a replacement tile, so an empty wall forbids them. RULE-WALL-2
  if (tilesLeft(state) > 0) {
    const counts = countsOf(s.concealed);
    for (let kind = 0; kind < counts.length; kind++) {
      if (counts[kind] === 4) actions.push({ type: 'concealed-kong', seat, kind });
    }
    for (const meld of s.melds) {
      if (meld.kind !== 'pung') continue;
      if (counts[meld.low]! >= 1) actions.push({ type: 'added-kong', seat, kind: meld.low });
    }
  }

  for (const tile of s.concealed) actions.push({ type: 'discard', seat, tile });
  return actions;
}

function claimActions(
  state: GameState,
  deps: EngineDeps,
  phase: Extract<Phase, { t: 'claims' }>,
): Action[] {
  const actions: Action[] = [];
  for (const seat of phase.eligible) {
    if (phase.declared[seat]) continue;
    for (const option of claimOptionsFor(state, deps, phase.tile, phase.from, seat)) {
      actions.push(option);
    }
    actions.push({ type: 'pass', seat });
  }
  return actions;
}

/** The non-pass options a seat has on a discard. §4.3, RULE-DRAW-4 */
function claimOptionsFor(
  state: GameState,
  deps: EngineDeps,
  tile: TileId,
  from: Seat,
  seat: Seat,
): Action[] {
  const options: Action[] = [];
  if (seat === from) return options;
  const s = state.seats[seat];
  const kind = kindOf(tile);
  const counts = countsOf(s.concealed);

  if (canWin(state, deps, seat, 'discard', from, tile)) options.push({ type: 'win', seat });

  // Once the wall is empty the hand ends after this discard, so melding it is
  // meaningless and is not offered. RULE-DRAW-4
  if (tilesLeft(state) === 0) return options;

  if (counts[kind]! >= 3) options.push({ type: 'kong', seat });
  if (counts[kind]! >= 2) options.push({ type: 'pung', seat });

  // Chow is restricted to the seat immediately after the discarder. RULE-CLAIM-1
  if (seat === nextSeat(from)) {
    for (const shape of chowShapesFor(kind)) {
      const needed = shape.filter((k) => k !== kind);
      if (needed.length !== 2) continue;
      if (needed.every((k) => counts[k]! >= 1)) options.push({ type: 'chow', seat, low: shape[0] });
    }
  }
  return options;
}

function robActions(state: GameState, phase: Extract<Phase, { t: 'rob' }>): Action[] {
  const actions: Action[] = [];
  for (const seat of phase.eligible) {
    if (phase.declared[seat]) continue;
    actions.push({ type: 'win', seat });
    actions.push({ type: 'pass', seat });
  }
  return actions;
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export function act(state: GameState, action: Action, deps: EngineDeps): GameState {
  const events: GameEvent[] = [];
  applyAction(state, action, events, deps);
  state.lastEvents = events;
  return state;
}

function applyAction(state: GameState, action: Action, events: GameEvent[], deps: EngineDeps): void {
  const phase = state.phase;
  switch (phase.t) {
    case 'action':
      return applyTurnAction(state, action, phase.seat, events, deps);
    case 'claims':
      return applyClaimAction(state, action, phase, events, deps);
    case 'rob':
      return applyRobAction(state, action, phase, events, deps);
    case 'hand-over':
      if (action.type !== 'next-hand') throw new IllegalActionError(`expected next-hand, got ${action.type}`);
      return nextHand(state, events, deps);
    case 'match-over':
      throw new IllegalActionError('the match is over');
  }
}

function applyTurnAction(
  state: GameState,
  action: Action,
  seat: Seat,
  events: GameEvent[],
  deps: EngineDeps,
): void {
  if (action.type === 'next-hand') throw new IllegalActionError('a hand is in progress');
  if (action.seat !== seat) throw new IllegalActionError(`seat ${action.seat} cannot act on seat ${seat}'s turn`);

  switch (action.type) {
    case 'discard': {
      const s = state.seats[seat];
      const index = s.concealed.indexOf(action.tile);
      if (index < 0) throw new IllegalActionError(`seat ${seat} does not hold tile ${action.tile}`);
      s.concealed.splice(index, 1);
      state.discardPile.push({ tile: action.tile, seat });
      state.discardCount++;
      state.live = {
        tile: null,
        fromKongReplacement: false,
        wasLastWallTile: false,
        firstUninterruptedTurn: false,
      };
      events.push({ t: 'discard', seat, tile: action.tile });
      openClaims(state, action.tile, seat, events, deps);
      return;
    }
    case 'win': {
      if (state.live.tile === null) throw new IllegalActionError('no live tile to win on');
      if (!canWin(state, deps, seat, 'self-draw', null, state.live.tile)) {
        throw new IllegalActionError('hand is not a legal win');
      }
      const win = buildWinContext(state, seat, 'self-draw', null, state.live.tile);
      finishHandWithWin(state, win, events, deps);
      return;
    }
    case 'concealed-kong':
      return declareConcealedKong(state, seat, action.kind, events, deps);
    case 'added-kong':
      return declareAddedKong(state, seat, action.kind, events, deps);
    default:
      throw new IllegalActionError(`${action.type} is not legal on your own turn`);
  }
}

function takeFromHand(state: GameState, seat: Seat, kind: TileKind, count: number): TileId[] {
  const s = state.seats[seat];
  const taken: TileId[] = [];
  for (let i = s.concealed.length - 1; i >= 0 && taken.length < count; i--) {
    if (kindOf(s.concealed[i]!) === kind) {
      taken.push(s.concealed[i]!);
      s.concealed.splice(i, 1);
    }
  }
  if (taken.length !== count) {
    throw new IllegalActionError(`seat ${seat} does not hold ${count} of kind ${kind}`);
  }
  return taken.sort((a, b) => a - b);
}

function declareConcealedKong(
  state: GameState,
  seat: Seat,
  kind: TileKind,
  events: GameEvent[],
  deps: EngineDeps,
): void {
  if (tilesLeft(state) === 0) throw new IllegalActionError('no replacement tile is available');
  const tiles = takeFromHand(state, seat, kind, 4);
  const meld: Meld = { kind: 'kong-concealed', tiles, low: kind, claimedFrom: null, claimedTile: null };
  state.seats[seat].melds.push(meld);
  events.push({ t: 'kong', seat, meld, robbable: false });
  drawReplacement(state, seat, events, deps);
}

function declareAddedKong(
  state: GameState,
  seat: Seat,
  kind: TileKind,
  events: GameEvent[],
  deps: EngineDeps,
): void {
  if (tilesLeft(state) === 0) throw new IllegalActionError('no replacement tile is available');
  const meld = state.seats[seat].melds.find((m) => m.kind === 'pung' && m.low === kind);
  if (!meld) throw new IllegalActionError(`seat ${seat} has no exposed pung of kind ${kind}`);
  const [tile] = takeFromHand(state, seat, kind, 1) as [TileId];
  meld.kind = 'kong-added';
  meld.tiles = [...meld.tiles, tile].sort((a, b) => a - b);
  events.push({ t: 'kong', seat, meld, robbable: true });

  // §4.6: an added kong may be robbed. Anyone whose hand it completes may win.
  const eligible = SEATS.filter(
    (other) => other !== seat && canWin(state, deps, other, 'robbed-kong', seat, tile),
  );
  if (eligible.length > 0) {
    state.phase = { t: 'rob', tile, from: seat, eligible, declared: {} };
    return;
  }
  drawReplacement(state, seat, events, deps);
}

/** Draw from the tail after a kong. §3.2, §4.5, RULE-KONG-1 */
function drawReplacement(state: GameState, seat: Seat, events: GameEvent[], deps: EngineDeps): void {
  if (tilesLeft(state) === 0) {
    endHandAsDraw(state, events);
    return;
  }
  const tile = state.wall[--state.tail]!;
  state.seats[seat].concealed.push(tile);
  sortTiles(state.seats[seat].concealed);
  events.push({ t: 'draw', seat, tile, replacement: true });
  state.live = {
    tile,
    fromKongReplacement: true,
    wasLastWallTile: false,
    firstUninterruptedTurn: false,
  };
  if (isBonusId(tile)) {
    if (revealBonusTiles(state, seat, events, deps)) {
      if (handIsOver(state)) return;
      const drawn = state.seats[seat].concealed.at(-1) ?? null;
      state.live = {
        tile: drawn,
        fromKongReplacement: true,
        wasLastWallTile: false,
        firstUninterruptedTurn: false,
      };
    }
  }
  state.phase = { t: 'action', seat };
}

/** Normal head draw at the start of a turn. §4.2 */
function drawForTurn(state: GameState, seat: Seat, events: GameEvent[], deps: EngineDeps): void {
  if (tilesLeft(state) === 0) {
    endHandAsDraw(state, events);
    return;
  }
  const tile = state.wall[state.head++]!;
  state.seats[seat].concealed.push(tile);
  sortTiles(state.seats[seat].concealed);
  events.push({ t: 'draw', seat, tile, replacement: false });
  state.live = {
    tile,
    fromKongReplacement: false,
    wasLastWallTile: tilesLeft(state) === 0,
    firstUninterruptedTurn: false,
  };
  if (isBonusId(tile)) {
    const wasLast = state.live.wasLastWallTile;
    if (revealBonusTiles(state, seat, events, deps)) {
      if (handIsOver(state)) return;
      const drawn = state.seats[seat].concealed.at(-1) ?? null;
      state.live = {
        tile: drawn,
        fromKongReplacement: false,
        // The bonus tile came from the head; its replacement came from the tail,
        // so the hand is no longer on the last wall tile unless the tail is now
        // also spent.
        wasLastWallTile: wasLast && tilesLeft(state) === 0,
        firstUninterruptedTurn: false,
      };
    }
  }
  state.phase = { t: 'action', seat };
}

function openClaims(
  state: GameState,
  tile: TileId,
  from: Seat,
  events: GameEvent[],
  deps: EngineDeps,
): void {
  const eligible = SEATS.filter(
    (seat) => seat !== from && claimOptionsFor(state, deps, tile, from, seat).length > 0,
  );
  if (eligible.length === 0) {
    // Nothing is claimable: play continues with no prompt at all. RULE-CLAIM-5
    passTurn(state, from, events, deps);
    return;
  }
  state.phase = { t: 'claims', tile, from, eligible, declared: {} };
}

function passTurn(state: GameState, from: Seat, events: GameEvent[], deps: EngineDeps): void {
  if (tilesLeft(state) === 0) {
    endHandAsDraw(state, events);
    return;
  }
  drawForTurn(state, nextSeat(from), events, deps);
}

function declarationFor(action: Action): ClaimDeclaration {
  switch (action.type) {
    case 'pass':
      return { t: 'pass' };
    case 'chow':
      return { t: 'chow', low: action.low };
    case 'pung':
      return { t: 'pung' };
    case 'kong':
      return { t: 'kong' };
    case 'win':
      return { t: 'win' };
    default:
      throw new IllegalActionError(`${action.type} is not a claim`);
  }
}

function applyClaimAction(
  state: GameState,
  action: Action,
  phase: Extract<Phase, { t: 'claims' }>,
  events: GameEvent[],
  deps: EngineDeps,
): void {
  if (action.type === 'next-hand') throw new IllegalActionError('a hand is in progress');
  if (!phase.eligible.includes(action.seat)) {
    throw new IllegalActionError(`seat ${action.seat} has nothing to declare`);
  }
  if (phase.declared[action.seat]) {
    throw new IllegalActionError(`seat ${action.seat} has already declared`);
  }
  if (action.type !== 'pass') {
    const allowed = claimOptionsFor(state, deps, phase.tile, phase.from, action.seat);
    const ok = allowed.some((o) => o.type === action.type && (o.type !== 'chow' || o.low === (action as { low: TileKind }).low));
    if (!ok) throw new IllegalActionError(`${action.type} is not legal for seat ${action.seat}`);
  }
  phase.declared[action.seat] = declarationFor(action);
  if (Object.keys(phase.declared).length < phase.eligible.length) return;
  resolveClaims(state, phase, events, deps);
}

/** §4.4 priority: Win, then Pung/Kong, then Chow. */
function resolveClaims(
  state: GameState,
  phase: Extract<Phase, { t: 'claims' }>,
  events: GameEvent[],
  deps: EngineDeps,
): void {
  const declaredBy = (t: ClaimDeclaration['t']): Seat[] =>
    phase.eligible.filter((s) => phase.declared[s]?.t === t);

  const winners = declaredBy('win');
  if (winners.length > 0) {
    // Nearest seat to the discarder takes it; the others lapse. RULE-CLAIM-2/3
    const winner = winners.reduce((best, s) =>
      seatDistance(phase.from, s) < seatDistance(phase.from, best) ? s : best,
    );
    for (const other of winners) if (other !== winner) events.push({ t: 'claim-lapsed', seat: other });
    const win = buildWinContext(state, winner, 'discard', phase.from, phase.tile);
    state.seats[winner].concealed.push(phase.tile);
    sortTiles(state.seats[winner].concealed);
    removeFromDiscards(state, phase.from, phase.tile);
    finishHandWithWin(state, win, events, deps);
    return;
  }

  const kongers = declaredBy('kong');
  const pungers = declaredBy('pung');
  const taker = kongers[0] ?? pungers[0];
  if (taker !== undefined) {
    for (const other of [...kongers, ...pungers]) {
      if (other !== taker) events.push({ t: 'claim-lapsed', seat: other });
    }
    takeDiscardAsSet(state, taker, phase, kongers.length > 0 ? 'kong' : 'pung', events, deps);
    return;
  }

  const chowers = declaredBy('chow');
  const chower = chowers[0];
  if (chower !== undefined) {
    const decl = phase.declared[chower];
    if (decl?.t !== 'chow') throw new IllegalActionError('internal: chow declaration lost');
    takeDiscardAsChow(state, chower, phase, decl.low, events);
    return;
  }

  for (const seat of phase.eligible) events.push({ t: 'pass', seat });
  passTurn(state, phase.from, events, deps);
}

/** A claimed tile leaves the discard area. */
function removeFromDiscards(state: GameState, from: Seat, tile: TileId): void {
  const index = state.discardPile.findIndex((d) => d.tile === tile && d.seat === from);
  if (index >= 0) state.discardPile.splice(index, 1);
}

function takeDiscardAsSet(
  state: GameState,
  seat: Seat,
  phase: Extract<Phase, { t: 'claims' }>,
  as: 'pung' | 'kong',
  events: GameEvent[],
  deps: EngineDeps,
): void {
  const kind = kindOf(phase.tile);
  const fromHand = takeFromHand(state, seat, kind, as === 'kong' ? 3 : 2);
  removeFromDiscards(state, phase.from, phase.tile);
  const meld: Meld = {
    kind: as === 'kong' ? 'kong-exposed' : 'pung',
    tiles: [...fromHand, phase.tile].sort((a, b) => a - b),
    low: kind,
    claimedFrom: phase.from,
    claimedTile: phase.tile,
  };
  state.seats[seat].melds.push(meld);
  events.push({ t: 'meld', seat, meld });
  state.live = {
    tile: null,
    fromKongReplacement: false,
    wasLastWallTile: false,
    firstUninterruptedTurn: false,
  };
  if (as === 'kong') {
    drawReplacement(state, seat, events, deps);
    return;
  }
  state.phase = { t: 'action', seat };
}

function takeDiscardAsChow(
  state: GameState,
  seat: Seat,
  phase: Extract<Phase, { t: 'claims' }>,
  low: TileKind,
  events: GameEvent[],
): void {
  const kind = kindOf(phase.tile);
  const fromHand: TileId[] = [];
  for (const k of [low, low + 1, low + 2]) {
    if (k === kind) continue;
    fromHand.push(...takeFromHand(state, seat, k, 1));
  }
  removeFromDiscards(state, phase.from, phase.tile);
  const meld: Meld = {
    kind: 'chow',
    tiles: [...fromHand, phase.tile].sort((a, b) => a - b),
    low,
    claimedFrom: phase.from,
    claimedTile: phase.tile,
  };
  state.seats[seat].melds.push(meld);
  events.push({ t: 'meld', seat, meld });
  state.live = {
    tile: null,
    fromKongReplacement: false,
    wasLastWallTile: false,
    firstUninterruptedTurn: false,
  };
  state.phase = { t: 'action', seat };
}

function applyRobAction(
  state: GameState,
  action: Action,
  phase: Extract<Phase, { t: 'rob' }>,
  events: GameEvent[],
  deps: EngineDeps,
): void {
  if (action.type === 'next-hand') throw new IllegalActionError('a hand is in progress');
  if (action.type !== 'win' && action.type !== 'pass') {
    throw new IllegalActionError('only Win or Pass is legal against an added kong');
  }
  if (!phase.eligible.includes(action.seat)) throw new IllegalActionError('seat cannot rob this kong');
  if (phase.declared[action.seat]) throw new IllegalActionError('seat has already declared');
  phase.declared[action.seat] = declarationFor(action);
  if (Object.keys(phase.declared).length < phase.eligible.length) return;

  const winners = phase.eligible.filter((s) => phase.declared[s]?.t === 'win');
  if (winners.length === 0) {
    drawReplacement(state, phase.from, events, deps);
    return;
  }
  const winner = winners.reduce((best, s) =>
    seatDistance(phase.from, s) < seatDistance(phase.from, best) ? s : best,
  );
  for (const other of winners) if (other !== winner) events.push({ t: 'claim-lapsed', seat: other });

  // The kong is undone; the pung stays exposed. RULE-ROB-3
  const meld = state.seats[phase.from].melds.find((m) => m.kind === 'kong-added' && m.low === kindOf(phase.tile));
  if (!meld) throw new IllegalActionError('internal: robbed kong not found');
  meld.kind = 'pung';
  meld.tiles = meld.tiles.filter((t) => t !== phase.tile);

  const win = buildWinContext(state, winner, 'robbed-kong', phase.from, phase.tile);
  state.seats[winner].concealed.push(phase.tile);
  sortTiles(state.seats[winner].concealed);
  events.push({ t: 'kong-robbed', seat: phase.from, by: winner });
  finishHandWithWin(state, win, events, deps);
}

// ---------------------------------------------------------------------------
// Hand completion and progression
// ---------------------------------------------------------------------------

function finishHandWithWin(
  state: GameState,
  win: WinContext,
  events: GameEvent[],
  deps: EngineDeps,
): void {
  const breakdown = deps.scorer(scoreInputFor(state, win, null));
  const capped = { ...breakdown, totalFaan: Math.min(breakdown.totalFaan, FAAN_CEILING) };
  const payments = settle(win, capped);
  const result = recordHand(state, 'win', win, capped, payments, win.seat === state.dealer);
  events.push({ t: 'win', result });
  concludeHand(state, result, events);
}

function endHandAsDraw(state: GameState, events: GameEvent[]): void {
  // No payments, and the dealer rotates. RULE-DRAW-1, RULE-DRAW-2, RULE-DRAW-3
  const result = recordHand(state, 'exhaustive-draw', null, null, noPayments(), false);
  events.push({ t: 'exhaustive-draw', result });
  concludeHand(state, result, events);
}

function recordHand(
  state: GameState,
  outcome: HandResult['outcome'],
  win: WinContext | null,
  breakdown: HandResult['breakdown'],
  payments: Payments,
  dealerContinues: boolean,
): HandResult {
  const scoresAfter = applyPayments(
    state.seats.map((s) => s.score),
    payments,
  );
  return {
    handNumber: state.handNumber,
    roundWind: state.roundWind,
    dealer: state.dealer,
    outcome,
    win,
    breakdown,
    payments,
    scoresAfter,
    dealerContinues,
  };
}

function concludeHand(state: GameState, result: HandResult, events: GameEvent[]): void {
  for (const seat of SEATS) state.seats[seat].score = result.scoresAfter[seat];
  state.handResult = result;
  state.results.push(result);
  state.phase = { t: 'hand-over' };
  if (matchIsOver(state, result)) {
    state.phase = { t: 'match-over' };
    events.push({ t: 'match-over' });
  }
}

/** §8.3. Evaluated against the state *before* the dealer rotates. */
function matchIsOver(state: GameState, result: HandResult): boolean {
  if (state.config.matchLength === 'single-hand') return true;
  if (result.dealerContinues) return false;
  const dealsAfter = state.dealsThisRound + 1;
  if (dealsAfter < 4) return false;
  const roundsCompleted = WINDS.indexOf(state.roundWind) + 1;
  if (state.config.matchLength === 'east-round') return roundsCompleted >= 1;
  return roundsCompleted >= 4;
}

function nextHand(state: GameState, events: GameEvent[], deps: EngineDeps): void {
  const result = state.results.at(-1);
  if (!result) throw new IllegalActionError('no hand to advance from');
  if (!result.dealerContinues) {
    // §8.1 / RULE-DRAW-2: the deal moves on.
    state.dealer = nextSeat(state.dealer);
    state.dealsThisRound++;
    if (state.dealsThisRound === 4) {
      state.dealsThisRound = 0;
      state.roundStartDealer = state.dealer;
      const next = WINDS.indexOf(state.roundWind) + 1;
      state.roundWind = WINDS[next % 4]!;
    }
  }
  state.handNumber++;
  startHand(state, deps);
  events.push(...state.lastEvents);
  state.lastEvents = events;
}

// ---------------------------------------------------------------------------
// Helpers used by tests and by the adapter
// ---------------------------------------------------------------------------

export function isExposedMeld(meld: Meld): boolean {
  return isExposed(meld);
}

export function handIsComplete(state: GameState, seat: Seat, extra: TileId | null): boolean {
  const s = state.seats[seat];
  const counts = countsOf(extra === null ? s.concealed : [...s.concealed, extra]);
  return isCompleteHand(counts, s.melds);
}

export function couldCompleteThirteenOrphans(state: GameState, seat: Seat, kind: TileKind): boolean {
  const s = state.seats[seat];
  return completesThirteenOrphans(countsOf(s.concealed), s.melds, kind);
}
