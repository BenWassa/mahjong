import { assertGameInvariants } from "./invariants.js";
import { shuffleTiles } from "./random.js";
import { nextSeat, nextWind, seatDistance, seatsAfter } from "./seats.js";
import {
  compareTileKinds,
  createTileSet,
  isBonusTile,
  isSuitedKind,
  parseSuitedKind,
} from "./tiles.js";
import type {
  AwaitingClaimsPhase,
  AwaitingDiscardPhase,
  AwaitingRobPhase,
  ClaimResponse,
  Discard,
  DrawHandResult,
  GameAction,
  GameEvent,
  GamePhase,
  GameRecord,
  HandResult,
  InternalGameState,
  Meld,
  PlayerState,
  RecordedAction,
  RulesProfile,
  Seat,
  Tile,
  TileId,
  WinHandResult,
  WinningStructure,
  Wind,
} from "./types.js";
import { DEFAULT_RULES_PROFILE, IllegalActionError } from "./types.js";
import { enumerateWinningStructures } from "./winning.js";

type PlayerTuple = readonly [PlayerState, PlayerState, PlayerState, PlayerState];

interface MutablePlayer {
  seat: Seat;
  concealed: Tile[];
  melds: Meld[];
  bonuses: Tile[];
  score: number;
}

const CLAIM_TYPES = new Set<GameAction["type"]>([
  "claim-chow",
  "claim-pung",
  "claim-kong",
  "win",
  "pass",
]);

function validateProfile(profile: RulesProfile): RulesProfile {
  // These runtime guards protect JavaScript callers and decoded persistence even
  // though TypeScript callers are already constrained by RulesProfile.
  const tileSetSize: unknown = profile.tileSetSize;
  const minimumFaan: unknown = profile.minimumFaan;
  const matchLength: unknown = profile.matchLength;
  if (tileSetSize !== 136 && tileSetSize !== 144) {
    throw new RangeError(`Unsupported tile set size: ${String(tileSetSize)}`);
  }
  if (minimumFaan !== 0 && minimumFaan !== 1 && minimumFaan !== 3) {
    throw new RangeError(`Unsupported minimum faan: ${String(minimumFaan)}`);
  }
  if (
    matchLength !== "single-hand" &&
    matchLength !== "east-round" &&
    matchLength !== "four-rounds"
  ) {
    throw new RangeError(`Unsupported match length: ${String(matchLength)}`);
  }
  return Object.freeze({ ...profile });
}

function asPlayerTuple(players: readonly PlayerState[]): PlayerTuple {
  if (players.length !== 4) {
    throw new Error(`Expected four players, received ${String(players.length)}`);
  }
  const [east, south, west, north] = players;
  if (east === undefined || south === undefined || west === undefined || north === undefined) {
    throw new Error("Expected all four player entries to be defined");
  }
  return [east, south, west, north];
}

function freezePlayer(player: MutablePlayer): PlayerState {
  return {
    seat: player.seat,
    concealed: [...player.concealed],
    melds: [...player.melds],
    bonuses: [...player.bonuses],
    score: player.score,
  };
}

function clonePlayers(players: PlayerTuple): [MutablePlayer, MutablePlayer, MutablePlayer, MutablePlayer] {
  return players.map((player) => ({
    seat: player.seat,
    concealed: [...player.concealed],
    melds: [...player.melds],
    bonuses: [...player.bonuses],
    score: player.score,
  })) as [MutablePlayer, MutablePlayer, MutablePlayer, MutablePlayer];
}

function handSeed(seed: string, handIndex: number): string {
  return `${seed}::hand:${String(handIndex)}`;
}

function baseWinResult(
  state: Pick<InternalGameState, "handIndex" | "roundWind" | "dealer">,
  winner: Seat,
  source: WinHandResult["source"],
  fromSeat: Seat | null,
  winningTile: Tile | null,
  structure: WinningStructure | null,
  circumstances: WinHandResult["circumstances"],
): WinHandResult {
  return {
    outcome: "win",
    handIndex: state.handIndex,
    roundWind: state.roundWind,
    dealer: state.dealer,
    winner,
    fromSeat,
    source,
    winningTile,
    structure,
    circumstances,
    scoring: null,
  };
}

function baseDrawResult(
  state: Pick<InternalGameState, "handIndex" | "roundWind" | "dealer">,
): DrawHandResult {
  return {
    outcome: "draw",
    handIndex: state.handIndex,
    roundWind: state.roundWind,
    dealer: state.dealer,
    reason: "wall-exhausted",
    scoring: null,
  };
}

function terminalPhase(config: RulesProfile, result: HandResult): GamePhase {
  return config.matchLength === "single-hand"
    ? { kind: "match-ended", result }
    : { kind: "hand-ended", result };
}

function appendHandResult(record: GameRecord, result: HandResult): GameRecord {
  const completed = record.config.matchLength === "single-hand";
  const events: GameEvent[] = [
    ...record.events,
    { type: "hand-ended", handIndex: result.handIndex, result },
  ];
  if (completed) {
    events.push({ type: "match-ended", handIndex: result.handIndex });
  }
  return {
    ...record,
    events,
    hands: [...record.hands, result],
    completed,
  };
}

function cleanupUnresolvedBonuses(players: readonly MutablePlayer[]): void {
  for (const player of players) {
    const ordinary: Tile[] = [];
    for (const tile of player.concealed) {
      if (isBonusTile(tile)) {
        player.bonuses.push(tile);
      } else {
        ordinary.push(tile);
      }
    }
    player.concealed = ordinary;
  }
}

interface BuiltHand {
  readonly state: InternalGameState;
}

function buildHand(
  seed: string,
  config: RulesProfile,
  handIndex: number,
  dealer: Seat,
  roundStarter: Seat,
  roundWind: Wind,
  previousRecord: GameRecord,
  scores: readonly [number, number, number, number],
  arrangedWall: readonly Tile[] | null = null,
): BuiltHand {
  const currentHandSeed = handSeed(seed, handIndex);
  // An arranged wall is a caller-supplied ordering of the same physical tile
  // set, used only by `createScenarioGame` (see ./scenario.ts). Everything
  // below — the packet deal, bonus reveal and replacement, the opening phase —
  // runs exactly as it does for a shuffled wall, so a scenario hand is a real
  // engine hand that happens to know what it dealt. The conservation invariant
  // at the end of this function is what proves the arrangement is a genuine
  // permutation rather than a doctored inventory.
  const wall =
    arrangedWall === null
      ? [...shuffleTiles(createTileSet(config.tileSetSize), currentHandSeed)]
      : [...arrangedWall];
  const players: [MutablePlayer, MutablePlayer, MutablePlayer, MutablePlayer] = [
    { seat: 0, concealed: [], melds: [], bonuses: [], score: scores[0] },
    { seat: 1, concealed: [], melds: [], bonuses: [], score: scores[1] },
    { seat: 2, concealed: [], melds: [], bonuses: [], score: scores[2] },
    { seat: 3, concealed: [], melds: [], bonuses: [], score: scores[3] },
  ];
  const newEvents: GameEvent[] = [
    {
      type: "hand-started",
      handIndex,
      handSeed: currentHandSeed,
      dealer,
      roundWind,
    },
  ];
  const order: readonly [Seat, Seat, Seat, Seat] = [dealer, ...seatsAfter(dealer)];

  const dealOne = (seat: Seat): void => {
    const tile = wall.shift();
    if (tile === undefined) {
      throw new Error("The wall exhausted during the initial deal");
    }
    players[seat].concealed.push(tile);
    newEvents.push({ type: "tile-drawn", handIndex, seat, tile, source: "deal" });
  };

  for (let packet = 0; packet < 3; packet += 1) {
    for (const seat of order) {
      for (let tileIndex = 0; tileIndex < 4; tileIndex += 1) {
        dealOne(seat);
      }
    }
  }
  for (const seat of order) {
    dealOne(seat);
  }
  dealOne(dealer);

  let initialResult: HandResult | null = null;
  bonusResolution: for (const seat of order) {
    for (;;) {
      const bonusIndex = players[seat].concealed.findIndex(isBonusTile);
      if (bonusIndex === -1) {
        break;
      }
      const [bonus] = players[seat].concealed.splice(bonusIndex, 1);
      if (bonus === undefined) {
        throw new Error("A located bonus tile could not be removed from the initial hand");
      }
      players[seat].bonuses.push(bonus);
      newEvents.push({ type: "bonus-revealed", handIndex, seat, tile: bonus });

      const acquiredBonusCount =
        players[seat].bonuses.length + players[seat].concealed.filter(isBonusTile).length;
      if (acquiredBonusCount >= 7) {
        const eight = acquiredBonusCount === 8;
        initialResult = baseWinResult(
          { handIndex, roundWind, dealer },
          seat,
          eight ? "eight-immortals" : "seven-flowers",
          null,
          null,
          null,
          {
            lastWallTile: false,
            lastDiscard: false,
            openingDealerHand: seat === dealer,
            dealerFirstDiscard: false,
          },
        );
        break bonusResolution;
      }

      const replacement = wall.pop();
      if (replacement === undefined) {
        initialResult = baseDrawResult({ handIndex, roundWind, dealer });
        break bonusResolution;
      }
      players[seat].concealed.push(replacement);
      newEvents.push({
        type: "tile-drawn",
        handIndex,
        seat,
        tile: replacement,
        source: "bonus-replacement",
      });
    }
  }

  if (initialResult !== null) {
    cleanupUnresolvedBonuses(players);
  }

  let record: GameRecord = {
    ...previousRecord,
    events: [...previousRecord.events, ...newEvents],
  };
  const phase: GamePhase =
    initialResult === null
      ? {
          kind: "awaiting-discard",
          seat: dealer,
          source: "deal",
          drawnTile: players[dealer].concealed.at(-1) ?? null,
          lastWallTile: false,
        }
      : terminalPhase(config, initialResult);
  if (initialResult !== null) {
    record = appendHandResult(record, initialResult);
  }

  const state: InternalGameState = {
    version: 1,
    seed,
    config,
    handIndex,
    dealer,
    roundStarter,
    roundWind,
    players: asPlayerTuple(players.map(freezePlayer)),
    wall,
    discards: [],
    phase,
    record,
  };
  assertGameInvariants(state);
  return { state };
}

export function createInitialGame(
  seed: string,
  profile: RulesProfile = DEFAULT_RULES_PROFILE,
): InternalGameState {
  if (seed.length === 0) {
    throw new RangeError("A non-empty seed is required");
  }
  const config = validateProfile(profile);
  const record: GameRecord = {
    version: 1,
    seed,
    config,
    actions: [],
    events: [{ type: "match-started", seed }],
    hands: [],
    completed: false,
  };
  return buildHand(seed, config, 0, 0, 0, "east", record, [0, 0, 0, 0]).state;
}

/**
 * Builds the opening hand of a match from a caller-supplied wall ordering
 * rather than from the seed's shuffle.
 *
 * This is the only entry point that does not derive its wall from the seed,
 * and it exists for the deterministic teaching scenarios in ./scenario.ts. It
 * deliberately reuses `buildHand`: the deal, the bonus reveal and replacement,
 * the opening phase and the conservation invariant are the production ones, so
 * the state it returns is indistinguishable from a dealt hand except in how
 * its wall was ordered. Every subsequent transition goes through `reduceGame`
 * like any other game.
 *
 * A record produced this way cannot be reconstructed by `replayGame`, which
 * rebuilds the wall from the seed. Scenario games are therefore never written
 * to the resumable-game slot; see `app/src/tutorial/`.
 */
export function createScenarioGame(
  seed: string,
  profile: RulesProfile,
  wall: readonly Tile[],
  dealer: Seat = 0,
): InternalGameState {
  if (seed.length === 0) {
    throw new RangeError("A non-empty seed is required");
  }
  const config = validateProfile(profile);
  const record: GameRecord = {
    version: 1,
    seed,
    config,
    actions: [],
    events: [{ type: "match-started", seed }],
    hands: [],
    completed: false,
  };
  return buildHand(seed, config, 0, dealer, dealer, "east", record, [0, 0, 0, 0], wall).state;
}

function sortedConcealed(player: PlayerState): readonly Tile[] {
  return [...player.concealed].sort(
    (left, right) => compareTileKinds(left.kind, right.kind) || left.id.localeCompare(right.id),
  );
}

function matchingTiles(player: PlayerState, tile: Tile): readonly Tile[] {
  return sortedConcealed(player).filter((candidate) => candidate.kind === tile.kind);
}

function chowActions(
  player: PlayerState,
  tile: Tile,
): readonly Extract<GameAction, { readonly type: "claim-chow" }>[] {
  if (!isSuitedKind(tile.kind)) {
    return [];
  }
  const parsed = parseSuitedKind(tile.kind);
  const actions: Extract<GameAction, { readonly type: "claim-chow" }>[] = [];
  for (let start = parsed.rank - 2; start <= parsed.rank; start += 1) {
    if (start < 1 || start > 7) {
      continue;
    }
    const sequence = [start, start + 1, start + 2];
    const neededKinds = sequence
      .filter((rank) => rank !== parsed.rank)
      .map((rank) => `${parsed.suit}-${String(rank)}`);
    const selected = neededKinds.map((kind) =>
      sortedConcealed(player).find((candidate) => candidate.kind === kind),
    );
    if (selected[0] === undefined || selected[1] === undefined) {
      continue;
    }
    actions.push({
      type: "claim-chow",
      seat: player.seat,
      tileIds: [selected[0].id, selected[1].id],
    });
  }
  return actions;
}

function claimChoicesFor(
  state: InternalGameState,
  seat: Seat,
  discard: Discard,
): readonly Exclude<ClaimResponse["action"], { readonly type: "pass" }>[] {
  if (seat === discard.seat) {
    return [];
  }
  const player = state.players[seat];
  const choices: Exclude<ClaimResponse["action"], { readonly type: "pass" }>[] = [];
  if (
    state.config.minimumFaan === 0 &&
    enumerateWinningStructures(player.concealed, player.melds, discard.tile).length > 0
  ) {
    choices.push({ type: "win", seat });
  }

  const matches = matchingTiles(player, discard.tile);
  if (matches.length >= 2) {
    const [firstMatch, secondMatch] = matches;
    if (firstMatch === undefined || secondMatch === undefined) {
      throw new Error("A pung candidate did not contain two matching tiles");
    }
    choices.push({
      type: "claim-pung",
      seat,
      tileIds: [firstMatch.id, secondMatch.id],
    });
  }
  if (matches.length >= 3 && state.wall.length > 0) {
    const [firstMatch, secondMatch, thirdMatch] = matches;
    if (firstMatch === undefined || secondMatch === undefined || thirdMatch === undefined) {
      throw new Error("A kong candidate did not contain three matching tiles");
    }
    choices.push({
      type: "claim-kong",
      seat,
      tileIds: [firstMatch.id, secondMatch.id, thirdMatch.id],
    });
  }
  if (seat === nextSeat(discard.seat)) {
    choices.push(...chowActions(player, discard.tile));
  }
  return choices;
}

function discardForPhase(state: InternalGameState, phase: AwaitingClaimsPhase): Discard {
  const discard = state.discards[phase.discardIndex];
  if (discard === undefined || discard.claimedBy !== null) {
    throw new Error(`Pending discard ${String(phase.discardIndex)} is unavailable`);
  }
  return discard;
}

function respondersForDiscard(state: InternalGameState, discard: Discard): readonly Seat[] {
  return seatsAfter(discard.seat).filter(
    (seat) => claimChoicesFor(state, seat, discard).length > 0,
  );
}

function discardTurnActions(
  state: InternalGameState,
  phase: AwaitingDiscardPhase,
): readonly GameAction[] {
  const seat = phase.seat;
  const player = state.players[seat];
  const actions: GameAction[] = [];
  if (
    phase.source !== "claim" &&
    state.config.minimumFaan === 0 &&
    enumerateWinningStructures(player.concealed, player.melds).length > 0
  ) {
    actions.push({ type: "win", seat });
  }

  if (state.wall.length > 0) {
    const groups = new Map<Tile["kind"], Tile[]>();
    for (const tile of sortedConcealed(player)) {
      const group = groups.get(tile.kind) ?? [];
      group.push(tile);
      groups.set(tile.kind, group);
    }
    for (const tiles of groups.values()) {
      if (tiles.length === 4) {
        const [first, second, third, fourth] = tiles;
        if (
          first === undefined ||
          second === undefined ||
          third === undefined ||
          fourth === undefined
        ) {
          throw new Error("A concealed kong candidate did not contain four tiles");
        }
        actions.push({
          type: "declare-concealed-kong",
          seat,
          tileIds: [first.id, second.id, third.id, fourth.id],
        });
      }
    }
    for (const [meldIndex, meld] of player.melds.entries()) {
      if (meld.type !== "pung" || meld.exposure !== "exposed") {
        continue;
      }
      const [pungTile] = meld.tiles;
      if (pungTile === undefined) {
        throw new Error("An exposed pung did not contain a tile");
      }
      const fourth = sortedConcealed(player).find((tile) => tile.kind === pungTile.kind);
      if (fourth !== undefined) {
        actions.push({
          type: "declare-added-kong",
          seat,
          tileId: fourth.id,
          meldIndex,
        });
      }
    }
  }

  for (const tile of sortedConcealed(player)) {
    if (!isBonusTile(tile)) {
      actions.push({ type: "discard", seat, tileId: tile.id });
    }
  }
  return actions;
}

export function legalActionsFor(state: InternalGameState, seat: Seat): readonly GameAction[] {
  switch (state.phase.kind) {
    case "awaiting-discard":
      return state.phase.seat === seat ? discardTurnActions(state, state.phase) : [];
    case "awaiting-claims": {
      if (!state.phase.responders.includes(seat)) {
        return [];
      }
      if (state.phase.responses.some((response) => response.seat === seat)) {
        return [];
      }
      const choices = claimChoicesFor(state, seat, discardForPhase(state, state.phase));
      return [...choices, { type: "pass", seat }];
    }
    case "awaiting-rob":
      if (
        !state.phase.responders.includes(seat) ||
        state.phase.responses.some((response) => response.seat === seat)
      ) {
        return [];
      }
      return [{ type: "win", seat }, { type: "pass", seat }];
    case "hand-ended":
    case "match-ended":
      return [];
  }
}

export function legalSystemActions(state: InternalGameState): readonly GameAction[] {
  return state.phase.kind === "hand-ended" ? [{ type: "continue" }] : [];
}

function actionsEqual(left: GameAction, right: GameAction): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertLegalAction(state: InternalGameState, action: GameAction): void {
  const legal =
    action.type === "continue"
      ? legalSystemActions(state)
      : legalActionsFor(state, action.seat);
  if (!legal.some((candidate) => actionsEqual(candidate, action))) {
    throw new IllegalActionError(
      `Illegal action ${JSON.stringify(action)} in phase ${state.phase.kind}`,
    );
  }
}

function withRecordedAction(state: InternalGameState, action: GameAction): InternalGameState {
  const recorded: RecordedAction = {
    index: state.record.actions.length,
    handIndex: state.handIndex,
    action,
  };
  return {
    ...state,
    record: {
      ...state.record,
      actions: [...state.record.actions, recorded],
    },
  };
}

function appendEvents(state: InternalGameState, events: readonly GameEvent[]): InternalGameState {
  if (events.length === 0) {
    return state;
  }
  return {
    ...state,
    record: {
      ...state.record,
      events: [...state.record.events, ...events],
    },
  };
}

function finishHand(state: InternalGameState, result: HandResult): InternalGameState {
  const next: InternalGameState = {
    ...state,
    phase: terminalPhase(state.config, result),
    record: appendHandResult(state.record, result),
  };
  assertGameInvariants(next);
  return next;
}

function finishExhaustiveDraw(state: InternalGameState): InternalGameState {
  return finishHand(state, baseDrawResult(state));
}

function drawForSeat(
  state: InternalGameState,
  seat: Seat,
  source: "wall" | "kong-replacement",
): InternalGameState {
  const wall = [...state.wall];
  const players = clonePlayers(state.players);
  const events: GameEvent[] = [];
  const initialWallLength = wall.length;
  const first = source === "wall" ? wall.shift() : wall.pop();
  if (first === undefined) {
    return finishExhaustiveDraw(state);
  }

  let tile = first;
  let eventSource: Extract<GameEvent, { readonly type: "tile-drawn" }>["source"] = source;
  for (;;) {
    events.push({
      type: "tile-drawn",
      handIndex: state.handIndex,
      seat,
      tile,
      source: eventSource,
    });
    if (!isBonusTile(tile)) {
      players[seat].concealed.push(tile);
      const next: InternalGameState = appendEvents(
        {
          ...state,
          wall,
          players: asPlayerTuple(players.map(freezePlayer)),
          phase: {
            kind: "awaiting-discard",
            seat,
            source,
            drawnTile: tile,
            lastWallTile:
              source === "wall" && initialWallLength === 1 && eventSource === "wall",
          },
        },
        events,
      );
      assertGameInvariants(next);
      return next;
    }

    players[seat].bonuses.push(tile);
    events.push({
      type: "bonus-revealed",
      handIndex: state.handIndex,
      seat,
      tile,
    });
    if (players[seat].bonuses.length >= 7) {
      const eight = players[seat].bonuses.length === 8;
      const withBonus = appendEvents(
        {
          ...state,
          wall,
          players: asPlayerTuple(players.map(freezePlayer)),
        },
        events,
      );
      return finishHand(
        withBonus,
        baseWinResult(
          withBonus,
          seat,
          eight ? "eight-immortals" : "seven-flowers",
          null,
          null,
          null,
          {
            lastWallTile: false,
            lastDiscard: false,
            openingDealerHand: false,
            dealerFirstDiscard: false,
          },
        ),
      );
    }

    const replacement = wall.pop();
    if (replacement === undefined) {
      const withoutReplacement = appendEvents(
        {
          ...state,
          wall,
          players: asPlayerTuple(players.map(freezePlayer)),
        },
        events,
      );
      return finishExhaustiveDraw(withoutReplacement);
    }
    tile = replacement;
    eventSource = "bonus-replacement";
  }
}

function removeConcealedTiles(player: MutablePlayer, tileIds: readonly TileId[]): Tile[] {
  const removed: Tile[] = [];
  for (const tileId of tileIds) {
    const index = player.concealed.findIndex((tile) => tile.id === tileId);
    if (index === -1) {
      throw new IllegalActionError(
        `Tile ${tileId} is not concealed by seat ${String(player.seat)}`,
      );
    }
    const [tile] = player.concealed.splice(index, 1);
    if (tile === undefined) {
      throw new Error("A located concealed tile could not be removed");
    }
    removed.push(tile);
  }
  return removed;
}

function winOnOwnTurn(state: InternalGameState, phase: AwaitingDiscardPhase): InternalGameState {
  const player = state.players[phase.seat];
  const structure = enumerateWinningStructures(player.concealed, player.melds)[0] ?? null;
  if (structure === null) {
    throw new IllegalActionError("The current hand is not structurally complete");
  }
  const source = phase.source === "kong-replacement" ? "kong-replacement" : "self-draw";
  return finishHand(
    state,
    baseWinResult(
      state,
      phase.seat,
      source,
      null,
      phase.drawnTile,
      structure,
      {
        lastWallTile: phase.lastWallTile,
        lastDiscard: false,
        openingDealerHand: phase.source === "deal" && state.discards.length === 0,
        dealerFirstDiscard: false,
      },
    ),
  );
}

function advanceAfterUnclaimedDiscard(state: InternalGameState, discarder: Seat): InternalGameState {
  return drawForSeat(state, nextSeat(discarder), "wall");
}

function beginClaimsAfterDiscard(
  state: InternalGameState,
  discard: Discard,
  lastWallDiscard: boolean,
): InternalGameState {
  const provisionalPhase: AwaitingClaimsPhase = {
    kind: "awaiting-claims",
    discardIndex: discard.index,
    discarder: discard.seat,
    responders: [],
    responses: [],
    lastWallDiscard,
  };
  const provisional: InternalGameState = { ...state, phase: provisionalPhase };
  const responders = respondersForDiscard(provisional, discard);
  if (responders.length === 0) {
    return advanceAfterUnclaimedDiscard(provisional, discard.seat);
  }
  const next: InternalGameState = {
    ...provisional,
    phase: { ...provisionalPhase, responders },
  };
  assertGameInvariants(next);
  return next;
}

function applyDiscard(
  state: InternalGameState,
  phase: AwaitingDiscardPhase,
  action: Extract<GameAction, { readonly type: "discard" }>,
): InternalGameState {
  const players = clonePlayers(state.players);
  const [tile] = removeConcealedTiles(players[action.seat], [action.tileId]);
  if (tile === undefined) {
    throw new Error("Discard removal did not return the selected tile");
  }
  const discard: Discard = {
    index: state.discards.length,
    seat: action.seat,
    tile,
    claimedBy: null,
    claimType: null,
  };
  const withDiscard = appendEvents(
    {
      ...state,
      players: asPlayerTuple(players.map(freezePlayer)),
      discards: [...state.discards, discard],
    },
    [
      {
        type: "discarded",
        handIndex: state.handIndex,
        seat: action.seat,
        tile,
        discardIndex: discard.index,
      },
    ],
  );
  return beginClaimsAfterDiscard(withDiscard, discard, phase.lastWallTile);
}

function claimPriority(action: ClaimResponse["action"]): number {
  switch (action.type) {
    case "win":
      return 3;
    case "claim-pung":
    case "claim-kong":
      return 2;
    case "claim-chow":
      return 1;
    case "pass":
      return 0;
  }
}

function selectedClaim(
  responses: readonly ClaimResponse[],
  discarder: Seat,
): ClaimResponse | null {
  const declarations = responses.filter((response) => response.action.type !== "pass");
  if (declarations.length === 0) {
    return null;
  }
  const selected = [...declarations].sort(
    (left, right) =>
      claimPriority(right.action) - claimPriority(left.action) ||
      seatDistance(discarder, left.seat) - seatDistance(discarder, right.seat),
  )[0];
  if (selected === undefined) {
    throw new Error("A non-empty claim set did not yield a selected claim");
  }
  return selected;
}

function finishDiscardWin(
  state: InternalGameState,
  phase: AwaitingClaimsPhase,
  winner: Seat,
): InternalGameState {
  const discard = discardForPhase(state, phase);
  const player = state.players[winner];
  const structure = enumerateWinningStructures(player.concealed, player.melds, discard.tile)[0] ?? null;
  if (structure === null) {
    throw new IllegalActionError("The claimed discard does not complete the winner's hand");
  }
  return finishHand(
    state,
    baseWinResult(
      state,
      winner,
      "discard",
      discard.seat,
      discard.tile,
      structure,
      {
        lastWallTile: false,
        lastDiscard: phase.lastWallDiscard,
        openingDealerHand: false,
        dealerFirstDiscard:
          state.discards.length === 1 && discard.seat === state.dealer && winner !== state.dealer,
      },
    ),
  );
}

function applyMeldClaim(
  state: InternalGameState,
  phase: AwaitingClaimsPhase,
  response: ClaimResponse,
): InternalGameState {
  const action = response.action;
  if (
    action.type !== "claim-chow" &&
    action.type !== "claim-pung" &&
    action.type !== "claim-kong"
  ) {
    throw new Error("Expected a meld claim");
  }
  const discard = discardForPhase(state, phase);
  const players = clonePlayers(state.players);
  const consumed = removeConcealedTiles(players[action.seat], action.tileIds);
  const meldType =
    action.type === "claim-chow" ? "chow" : action.type === "claim-pung" ? "pung" : "kong";
  const meldTiles = [...consumed, discard.tile].sort(
    (left, right) => compareTileKinds(left.kind, right.kind) || left.id.localeCompare(right.id),
  );
  const meld: Meld = {
    type: meldType,
    exposure: "exposed",
    tiles: meldTiles,
    claimedFrom: discard.seat,
  };
  players[action.seat].melds.push(meld);
  const discards: readonly Discard[] = state.discards.map((entry): Discard =>
    entry.index === discard.index
      ? { ...entry, claimedBy: action.seat, claimType: meldType }
      : entry,
  );
  const claimed = appendEvents(
    {
      ...state,
      players: asPlayerTuple(players.map(freezePlayer)),
      discards,
      phase: {
        kind: "awaiting-discard",
        seat: action.seat,
        source: "claim",
        drawnTile: null,
        lastWallTile: false,
      },
    },
    [{ type: "meld-declared", handIndex: state.handIndex, seat: action.seat, meld }],
  );
  if (meldType === "kong") {
    return drawForSeat(claimed, action.seat, "kong-replacement");
  }
  assertGameInvariants(claimed);
  return claimed;
}

function resolveClaimResponses(state: InternalGameState, phase: AwaitingClaimsPhase): InternalGameState {
  if (phase.responses.length !== phase.responders.length) {
    return state;
  }
  const selected = selectedClaim(phase.responses, phase.discarder);
  if (selected === null) {
    return advanceAfterUnclaimedDiscard(state, phase.discarder);
  }
  if (selected.action.type === "win") {
    return finishDiscardWin(state, phase, selected.seat);
  }
  return applyMeldClaim(state, phase, selected);
}

function applyClaimResponse(
  state: InternalGameState,
  phase: AwaitingClaimsPhase,
  action: ClaimResponse["action"],
): InternalGameState {
  const nextPhase: AwaitingClaimsPhase = {
    ...phase,
    responses: [...phase.responses, { seat: action.seat, action }],
  };
  return resolveClaimResponses({ ...state, phase: nextPhase }, nextPhase);
}

function finalizeAddedKong(
  state: InternalGameState,
  declarer: Seat,
  tileId: TileId,
  meldIndex: number,
): InternalGameState {
  const players = clonePlayers(state.players);
  const [tile] = removeConcealedTiles(players[declarer], [tileId]);
  if (tile === undefined) {
    throw new Error("Added-kong removal did not return the selected tile");
  }
  const pung = players[declarer].melds[meldIndex];
  if (pung === undefined || pung.type !== "pung" || pung.exposure !== "exposed") {
    throw new IllegalActionError("The selected meld is not an exposed pung");
  }
  const kong: Meld = {
    ...pung,
    type: "kong",
    tiles: [...pung.tiles, tile],
  };
  players[declarer].melds[meldIndex] = kong;
  const promoted = appendEvents(
    {
      ...state,
      players: asPlayerTuple(players.map(freezePlayer)),
      phase: {
        kind: "awaiting-discard",
        seat: declarer,
        source: "kong-replacement",
        drawnTile: null,
        lastWallTile: false,
      },
    },
    [{ type: "meld-declared", handIndex: state.handIndex, seat: declarer, meld: kong }],
  );
  return drawForSeat(promoted, declarer, "kong-replacement");
}

function beginAddedKong(
  state: InternalGameState,
  action: Extract<GameAction, { readonly type: "declare-added-kong" }>,
): InternalGameState {
  const tile = state.players[action.seat].concealed.find((candidate) => candidate.id === action.tileId);
  if (tile === undefined) {
    throw new IllegalActionError("The promoted tile is not concealed by the declarer");
  }
  const responders = seatsAfter(action.seat).filter((seat) => {
    const player = state.players[seat];
    return (
      state.config.minimumFaan === 0 &&
      enumerateWinningStructures(player.concealed, player.melds, tile).length > 0
    );
  });
  if (responders.length === 0) {
    return finalizeAddedKong(state, action.seat, action.tileId, action.meldIndex);
  }
  const phase: AwaitingRobPhase = {
    kind: "awaiting-rob",
    declarer: action.seat,
    tileId: action.tileId,
    meldIndex: action.meldIndex,
    responders,
    responses: [],
  };
  const next: InternalGameState = { ...state, phase };
  assertGameInvariants(next);
  return next;
}

function applyConcealedKong(
  state: InternalGameState,
  action: Extract<GameAction, { readonly type: "declare-concealed-kong" }>,
): InternalGameState {
  const players = clonePlayers(state.players);
  const tiles = removeConcealedTiles(players[action.seat], action.tileIds);
  const meld: Meld = {
    type: "kong",
    exposure: "concealed",
    tiles,
    claimedFrom: null,
  };
  players[action.seat].melds.push(meld);
  const declared = appendEvents(
    {
      ...state,
      players: asPlayerTuple(players.map(freezePlayer)),
    },
    [{ type: "meld-declared", handIndex: state.handIndex, seat: action.seat, meld }],
  );
  return drawForSeat(declared, action.seat, "kong-replacement");
}

function resolveRobResponses(state: InternalGameState, phase: AwaitingRobPhase): InternalGameState {
  if (phase.responses.length !== phase.responders.length) {
    return state;
  }
  const winner = [...phase.responses]
    .filter((response) => response.action.type === "win")
    .sort(
      (left, right) =>
        seatDistance(phase.declarer, left.seat) - seatDistance(phase.declarer, right.seat),
    )[0];
  if (winner === undefined) {
    return finalizeAddedKong(state, phase.declarer, phase.tileId, phase.meldIndex);
  }

  const players = clonePlayers(state.players);
  const [tile] = removeConcealedTiles(players[phase.declarer], [phase.tileId]);
  if (tile === undefined) {
    throw new Error("Robbed-kong removal did not return the selected tile");
  }
  const discard: Discard = {
    index: state.discards.length,
    seat: phase.declarer,
    tile,
    claimedBy: null,
    claimType: null,
  };
  const robbed = appendEvents(
    {
      ...state,
      players: asPlayerTuple(players.map(freezePlayer)),
      discards: [...state.discards, discard],
    },
    [
      {
        type: "kong-robbed",
        handIndex: state.handIndex,
        declarer: phase.declarer,
        winner: winner.seat,
        tile,
      },
    ],
  );
  const winningPlayer = robbed.players[winner.seat];
  const structure = enumerateWinningStructures(
    winningPlayer.concealed,
    winningPlayer.melds,
    tile,
  )[0] ?? null;
  if (structure === null) {
    throw new IllegalActionError("The robbed tile does not complete the winner's hand");
  }
  return finishHand(
    robbed,
    baseWinResult(
      robbed,
      winner.seat,
      "robbed-kong",
      phase.declarer,
      tile,
      structure,
      {
        lastWallTile: false,
        lastDiscard: false,
        openingDealerHand: false,
        dealerFirstDiscard: false,
      },
    ),
  );
}

function applyRobResponse(
  state: InternalGameState,
  phase: AwaitingRobPhase,
  action: Extract<GameAction, { readonly type: "win" | "pass" }>,
): InternalGameState {
  const nextPhase: AwaitingRobPhase = {
    ...phase,
    responses: [...phase.responses, { seat: action.seat, action }],
  };
  return resolveRobResponses({ ...state, phase: nextPhase }, nextPhase);
}

function continueMatch(state: InternalGameState, result: HandResult): InternalGameState {
  const dealerWon = result.outcome === "win" && result.winner === state.dealer;
  let dealer = state.dealer;
  let roundWind = state.roundWind;
  if (!dealerWon) {
    dealer = nextSeat(state.dealer);
    if (dealer === state.roundStarter) {
      const followingWind = nextWind(roundWind);
      const matchComplete =
        followingWind === null ||
        (state.config.matchLength === "east-round" && roundWind === "east");
      if (matchComplete) {
        const next: InternalGameState = {
          ...state,
          phase: { kind: "match-ended", result },
          record: {
            ...state.record,
            completed: true,
            events: [
              ...state.record.events,
              { type: "match-ended", handIndex: state.handIndex },
            ],
          },
        };
        assertGameInvariants(next);
        return next;
      }
      roundWind = followingWind;
    }
  }

  const scores: [number, number, number, number] = [
    state.players[0].score,
    state.players[1].score,
    state.players[2].score,
    state.players[3].score,
  ];
  return buildHand(
    state.seed,
    state.config,
    state.handIndex + 1,
    dealer,
    state.roundStarter,
    roundWind,
    state.record,
    scores,
  ).state;
}

export function reduceGame(state: InternalGameState, action: GameAction): InternalGameState {
  assertLegalAction(state, action);
  const recorded = withRecordedAction(state, action);
  let next: InternalGameState;

  switch (recorded.phase.kind) {
    case "awaiting-discard": {
      if (
        action.type === "continue" ||
        action.type === "claim-chow" ||
        action.type === "claim-pung" ||
        action.type === "claim-kong" ||
        action.type === "pass"
      ) {
        throw new IllegalActionError(`Action ${action.type} is invalid while awaiting a discard`);
      }
      switch (action.type) {
        case "discard":
          next = applyDiscard(recorded, recorded.phase, action);
          break;
        case "win":
          next = winOnOwnTurn(recorded, recorded.phase);
          break;
        case "declare-concealed-kong":
          next = applyConcealedKong(recorded, action);
          break;
        case "declare-added-kong":
          next = beginAddedKong(recorded, action);
          break;
      }
      break;
    }
    case "awaiting-claims":
      if (!CLAIM_TYPES.has(action.type) || action.type === "declare-concealed-kong") {
        throw new IllegalActionError(`Action ${action.type} is not a claim response`);
      }
      next = applyClaimResponse(recorded, recorded.phase, action as ClaimResponse["action"]);
      break;
    case "awaiting-rob":
      if (action.type !== "win" && action.type !== "pass") {
        throw new IllegalActionError(`Action ${action.type} is not a robbing response`);
      }
      next = applyRobResponse(recorded, recorded.phase, action);
      break;
    case "hand-ended":
      if (action.type !== "continue") {
        throw new IllegalActionError("Only continue is legal after a hand ends");
      }
      next = continueMatch(recorded, recorded.phase.result);
      break;
    case "match-ended":
      throw new IllegalActionError("The match has already ended");
  }

  assertGameInvariants(next);
  return next;
}
