import {
  createInitialGame as createStructuralGame,
  legalActionsFor as structuralLegalActionsFor,
  legalSystemActions as structuralLegalSystemActions,
  reduceGame as reduceStructuralGame,
} from "./core.js";
import {
  evaluateWinningHand,
  meetsMinimumFaan,
  scoreInstantBonusWin,
  type ScoreContext,
} from "./scoring.js";
import type {
  AwaitingClaimsPhase,
  AwaitingDiscardPhase,
  AwaitingRobPhase,
  Discard,
  GameAction,
  GameRecord,
  HandResult,
  InternalGameState,
  RulesProfile,
  Seat,
  Tile,
  WinHandResult,
} from "./types.js";
import { IllegalActionError } from "./types.js";

function structuralProfile(profile: RulesProfile): RulesProfile {
  return profile.minimumFaan === 0 ? profile : { ...profile, minimumFaan: 0 };
}

function withProfile(state: InternalGameState, profile: RulesProfile): InternalGameState {
  if (state.config === profile && state.record.config === profile) {
    return state;
  }
  return {
    ...state,
    config: profile,
    record: { ...state.record, config: profile },
  };
}

function asStructuralState(state: InternalGameState): InternalGameState {
  return withProfile(state, structuralProfile(state.config));
}

function scoreContext(
  state: InternalGameState,
  winner: Seat,
  source: WinHandResult["source"],
  fromSeat: Seat | null,
  winningTile: Tile | null,
  circumstances: WinHandResult["circumstances"],
): ScoreContext {
  return {
    profile: state.config,
    player: state.players[winner],
    winner,
    dealer: state.dealer,
    roundWind: state.roundWind,
    source,
    fromSeat,
    winningTile,
    circumstances,
  };
}

function discardForPhase(state: InternalGameState, phase: AwaitingClaimsPhase): Discard {
  const discard = state.discards[phase.discardIndex];
  if (discard === undefined || discard.claimedBy !== null) {
    throw new Error(`Pending discard ${String(phase.discardIndex)} is unavailable`);
  }
  return discard;
}

function robbedTile(state: InternalGameState, phase: AwaitingRobPhase): Tile {
  const tile = state.players[phase.declarer].concealed.find(
    (candidate) => candidate.id === phase.tileId,
  );
  if (tile === undefined) {
    throw new Error("The promoted tile is unavailable while awaiting a rob response");
  }
  return tile;
}

function ownTurnWinIsLegal(
  state: InternalGameState,
  phase: AwaitingDiscardPhase,
): boolean {
  if (phase.source === "claim") {
    return false;
  }
  const source = phase.source === "kong-replacement" ? "kong-replacement" : "self-draw";
  const evaluation = evaluateWinningHand(
    scoreContext(
      state,
      phase.seat,
      source,
      null,
      phase.drawnTile,
      {
        lastWallTile: phase.lastWallTile,
        lastDiscard: false,
        openingDealerHand: phase.source === "deal" && state.discards.length === 0,
        dealerFirstDiscard: false,
      },
    ),
  );
  return evaluation !== null && meetsMinimumFaan(evaluation.scoring, state.config);
}

function discardWinIsLegal(
  state: InternalGameState,
  phase: AwaitingClaimsPhase,
  winner: Seat,
): boolean {
  const discard = discardForPhase(state, phase);
  const evaluation = evaluateWinningHand(
    scoreContext(
      state,
      winner,
      "discard",
      discard.seat,
      discard.tile,
      {
        lastWallTile: false,
        lastDiscard: phase.lastWallDiscard,
        openingDealerHand: false,
        dealerFirstDiscard:
          state.discards.length === 1 && discard.seat === state.dealer && winner !== state.dealer,
      },
    ),
    discard.tile,
  );
  return evaluation !== null && meetsMinimumFaan(evaluation.scoring, state.config);
}

function robbedKongWinIsLegal(
  state: InternalGameState,
  phase: AwaitingRobPhase,
  winner: Seat,
): boolean {
  const tile = robbedTile(state, phase);
  const evaluation = evaluateWinningHand(
    scoreContext(
      state,
      winner,
      "robbed-kong",
      phase.declarer,
      tile,
      {
        lastWallTile: false,
        lastDiscard: false,
        openingDealerHand: false,
        dealerFirstDiscard: false,
      },
    ),
    tile,
  );
  return evaluation !== null && meetsMinimumFaan(evaluation.scoring, state.config);
}

function scoringAllowsWin(state: InternalGameState, seat: Seat): boolean {
  switch (state.phase.kind) {
    case "awaiting-discard":
      return state.phase.seat === seat && ownTurnWinIsLegal(state, state.phase);
    case "awaiting-claims":
      return state.phase.responders.includes(seat) && discardWinIsLegal(state, state.phase, seat);
    case "awaiting-rob":
      return state.phase.responders.includes(seat) && robbedKongWinIsLegal(state, state.phase, seat);
    case "hand-ended":
    case "match-ended":
      return false;
  }
}

export function legalActionsFor(state: InternalGameState, seat: Seat): readonly GameAction[] {
  const structural = structuralLegalActionsFor(asStructuralState(state), seat);
  return structural.filter((action) => action.type !== "win" || scoringAllowsWin(state, seat));
}

export function legalSystemActions(state: InternalGameState): readonly GameAction[] {
  return structuralLegalSystemActions(state);
}

function replaceResultInRecord(record: GameRecord, result: WinHandResult): GameRecord {
  return {
    ...record,
    hands: record.hands.map((hand) =>
      hand.handIndex === result.handIndex && hand.outcome === "win" ? result : hand,
    ),
    events: record.events.map((event) =>
      event.type === "hand-ended" && event.handIndex === result.handIndex
        ? { ...event, result }
        : event,
    ),
  };
}

function scoreWinResult(state: InternalGameState, result: WinHandResult): WinHandResult {
  const context = scoreContext(
    state,
    result.winner,
    result.source,
    result.fromSeat,
    result.winningTile,
    result.circumstances,
  );
  if (result.source === "seven-flowers" || result.source === "eight-immortals") {
    return { ...result, scoring: scoreInstantBonusWin(context) };
  }
  const addedTile =
    result.source === "discard" || result.source === "robbed-kong" ? result.winningTile : null;
  const evaluation = evaluateWinningHand(context, addedTile);
  if (evaluation === null) {
    throw new Error("A completed structural win could not be scored");
  }
  if (!meetsMinimumFaan(evaluation.scoring, state.config)) {
    throw new Error("A below-minimum hand reached settlement");
  }
  return {
    ...result,
    structure: evaluation.structure,
    scoring: evaluation.scoring,
  };
}

function settleTerminalState(state: InternalGameState): InternalGameState {
  if (state.phase.kind !== "hand-ended" && state.phase.kind !== "match-ended") {
    return state;
  }
  const result = state.phase.result;
  if (result.outcome !== "win" || result.scoring !== null) {
    return state;
  }
  const scored = scoreWinResult(state, result);
  const scoring = scored.scoring;
  if (scoring === null) {
    throw new Error("A scored win did not contain a faan breakdown");
  }
  const players = state.players.map((player) => ({
    ...player,
    score: player.score + scoring.payments[player.seat],
  })) as unknown as InternalGameState["players"];
  return {
    ...state,
    players,
    phase: { ...state.phase, result: scored },
    record: replaceResultInRecord(state.record, scored),
  };
}

function assertRequestedActionIsLegal(state: InternalGameState, action: GameAction): void {
  const legal =
    action.type === "continue" ? legalSystemActions(state) : legalActionsFor(state, action.seat);
  if (!legal.some((candidate) => JSON.stringify(candidate) === JSON.stringify(action))) {
    throw new IllegalActionError(
      `Illegal action ${JSON.stringify(action)} in phase ${state.phase.kind}`,
    );
  }
}

function stripAutomaticPass(
  before: InternalGameState,
  after: InternalGameState,
  profile: RulesProfile,
): InternalGameState {
  return {
    ...withProfile(after, profile),
    record: {
      ...withProfile(after, profile).record,
      actions: before.record.actions,
    },
  };
}

function pendingResponders(state: InternalGameState): readonly Seat[] {
  if (state.phase.kind !== "awaiting-claims" && state.phase.kind !== "awaiting-rob") {
    return [];
  }
  return state.phase.responders.filter(
    (seat) => !state.phase.responses.some((response) => response.seat === seat),
  );
}

function autoPassBelowMinimumOnlyResponders(state: InternalGameState): InternalGameState {
  let current = state;
  for (;;) {
    if (current.phase.kind !== "awaiting-claims" && current.phase.kind !== "awaiting-rob") {
      return settleTerminalState(current);
    }
    const autoPassSeat = pendingResponders(current).find((seat) => {
      const actions = legalActionsFor(current, seat);
      return actions.length === 1 && actions[0]?.type === "pass";
    });
    if (autoPassSeat === undefined) {
      return current;
    }
    const profile = current.config;
    const reduced = reduceStructuralGame(asStructuralState(current), {
      type: "pass",
      seat: autoPassSeat,
    });
    current = stripAutomaticPass(current, reduced, profile);
  }
}

export function createInitialGame(
  seed: string,
  profile: RulesProfile,
): InternalGameState {
  const structural = createStructuralGame(seed, structuralProfile(profile));
  const restored = withProfile(structural, profile);
  return autoPassBelowMinimumOnlyResponders(settleTerminalState(restored));
}

export function reduceGame(state: InternalGameState, action: GameAction): InternalGameState {
  assertRequestedActionIsLegal(state, action);
  const profile = state.config;
  const structural = reduceStructuralGame(asStructuralState(state), action);
  const restored = withProfile(structural, profile);
  const settled = settleTerminalState(restored);
  return autoPassBelowMinimumOnlyResponders(settled);
}
