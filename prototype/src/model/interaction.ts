import { scenarioAt, SCENARIOS } from "./scenarios.ts";
import type { ClaimOption, TableState } from "./table.ts";

/**
 * The interaction model under test, kept as a pure reducer so the rules of
 * "tap to select, tap again to discard" are verifiable without a device.
 *
 * Baseline model is `tap-tap` (PRD §7). `flick` exists only as the comparison
 * the issue asks for and is not the default.
 */
export type InteractionModel = "tap-tap" | "flick";

export type Resolution =
  | { readonly kind: "discard"; readonly tileId: string; readonly label: string }
  | { readonly kind: "claim"; readonly claim: ClaimOption }
  | { readonly kind: "pass" };

export interface Metrics {
  /** Every tap that landed on a hand tile, including inert ones. */
  readonly handTaps: number;
  /** Taps on a hand tile while the table was not asking for a discard. */
  readonly inertTaps: number;
  /** Selection moved from one tile to another before committing. */
  readonly selectionMoves: number;
  readonly discards: number;
  readonly claims: number;
  readonly passes: number;
  /** Tester-reported discards they did not intend. The device gate's real signal. */
  readonly misfires: number;
  /** Milliseconds from the first tap of a decision to the committed discard. */
  readonly discardMillis: readonly number[];
}

export const EMPTY_METRICS: Metrics = {
  handTaps: 0,
  inertTaps: 0,
  selectionMoves: 0,
  discards: 0,
  claims: 0,
  passes: 0,
  misfires: 0,
  discardMillis: [],
};

export interface InteractionState {
  readonly scenarioIndex: number;
  readonly table: TableState;
  readonly selectedTileId: string | null;
  /** When the current selection started, for the time-to-discard metric. */
  readonly selectionStartedAt: number | null;
  readonly resolution: Resolution | null;
  readonly metrics: Metrics;
  /** Newest first. Kept short; this is a prototype, not a game record. */
  readonly log: readonly string[];
}

export type InteractionEvent =
  | { readonly type: "tap-hand-tile"; readonly tileId: string; readonly at: number }
  | { readonly type: "flick-hand-tile"; readonly tileId: string; readonly at: number }
  | { readonly type: "clear-selection" }
  | { readonly type: "claim"; readonly claimId: string }
  | { readonly type: "pass" }
  | { readonly type: "report-misfire" }
  | { readonly type: "goto-scenario"; readonly index: number }
  | { readonly type: "replay-scenario" }
  | { readonly type: "reset-metrics" };

export function initialState(scenarioIndex = 0): InteractionState {
  return {
    scenarioIndex,
    table: scenarioAt(scenarioIndex),
    selectedTileId: null,
    selectionStartedAt: null,
    resolution: null,
    metrics: EMPTY_METRICS,
    log: [],
  };
}

const LOG_LIMIT = 8;

function note(state: InteractionState, line: string): readonly string[] {
  return [line, ...state.log].slice(0, LOG_LIMIT);
}

function tileLabel(state: InteractionState, tileId: string): string {
  const tile = state.table.hand.find((candidate) => candidate.id === tileId);
  return tile?.kind ?? tileId;
}

/** A hand tap only means something while the table is asking for a discard. */
function acceptsHandInput(table: TableState): boolean {
  return table.phase === "discard";
}

export function reduce(
  state: InteractionState,
  event: InteractionEvent,
  model: InteractionModel,
): InteractionState {
  switch (event.type) {
    case "tap-hand-tile":
      return tapHandTile(state, event.tileId, event.at, model);
    case "flick-hand-tile":
      return flickHandTile(state, event.tileId, event.at, model);
    case "clear-selection":
      return state.selectedTileId === null
        ? state
        : { ...state, selectedTileId: null, selectionStartedAt: null };
    case "claim":
      return applyClaim(state, event.claimId);
    case "pass":
      return applyPass(state);
    case "report-misfire":
      return {
        ...state,
        metrics: { ...state.metrics, misfires: state.metrics.misfires + 1 },
        log: note(state, "⚠ tester reported an unintended discard"),
      };
    case "goto-scenario": {
      const index = ((event.index % SCENARIOS.length) + SCENARIOS.length) % SCENARIOS.length;
      return {
        ...state,
        scenarioIndex: index,
        table: scenarioAt(index),
        selectedTileId: null,
        selectionStartedAt: null,
        resolution: null,
        log: [],
      };
    }
    case "replay-scenario":
      return {
        ...state,
        table: scenarioAt(state.scenarioIndex),
        selectedTileId: null,
        selectionStartedAt: null,
        resolution: null,
        log: [],
      };
    case "reset-metrics":
      return { ...state, metrics: EMPTY_METRICS, log: note(state, "metrics reset") };
  }
}

function tapHandTile(
  state: InteractionState,
  tileId: string,
  at: number,
  model: InteractionModel,
): InteractionState {
  const metrics = { ...state.metrics, handTaps: state.metrics.handTaps + 1 };

  if (!acceptsHandInput(state.table) || state.resolution !== null) {
    return {
      ...state,
      metrics: { ...metrics, inertTaps: metrics.inertTaps + 1 },
      log: note(state, `tap ignored — ${turnOwner(state.table)}`),
    };
  }

  // Flick mode deliberately does not commit on a second tap: the whole point of
  // the comparison is that the commit gesture is the flick, not the tap.
  if (state.selectedTileId === tileId && model === "tap-tap") {
    return commitDiscard(state, tileId, at, metrics);
  }

  const moved = state.selectedTileId !== null && state.selectedTileId !== tileId;
  return {
    ...state,
    selectedTileId: tileId,
    selectionStartedAt: state.selectedTileId === null ? at : state.selectionStartedAt,
    metrics: { ...metrics, selectionMoves: metrics.selectionMoves + (moved ? 1 : 0) },
    log: note(state, `${moved ? "selection moved to" : "lifted"} ${tileLabel(state, tileId)}`),
  };
}

function flickHandTile(
  state: InteractionState,
  tileId: string,
  at: number,
  model: InteractionModel,
): InteractionState {
  if (model !== "flick") return state;
  const metrics = { ...state.metrics, handTaps: state.metrics.handTaps + 1 };
  if (!acceptsHandInput(state.table) || state.resolution !== null) {
    return {
      ...state,
      metrics: { ...metrics, inertTaps: metrics.inertTaps + 1 },
      log: note(state, `flick ignored — ${turnOwner(state.table)}`),
    };
  }
  return commitDiscard(state, tileId, at, metrics);
}

function commitDiscard(
  state: InteractionState,
  tileId: string,
  at: number,
  metrics: Metrics,
): InteractionState {
  const label = tileLabel(state, tileId);
  const started = state.selectionStartedAt ?? at;
  return {
    ...state,
    selectedTileId: null,
    selectionStartedAt: null,
    resolution: { kind: "discard", tileId, label },
    metrics: {
      ...metrics,
      discards: metrics.discards + 1,
      discardMillis: [...metrics.discardMillis, Math.round(Math.max(0, at - started))],
    },
    table: {
      ...state.table,
      hand: state.table.hand.filter((tile) => tile.id !== tileId),
      drawnTileId: state.table.drawnTileId === tileId ? null : state.table.drawnTileId,
      discardPile: [...state.table.discardPile, kindOf(state, tileId)],
      phase: "waiting",
      turn: "right",
    },
    log: note(state, `discarded ${label}`),
  };
}

function kindOf(state: InteractionState, tileId: string): TableState["discardPile"][number] {
  const tile = state.table.hand.find((candidate) => candidate.id === tileId);
  if (tile === undefined) throw new Error(`no such tile in hand: ${tileId}`);
  return tile.kind;
}

function applyClaim(state: InteractionState, claimId: string): InteractionState {
  if (state.table.phase !== "claim" || state.resolution !== null) return state;
  const option = state.table.claims.find((candidate) => candidate.id === claimId);
  if (option === undefined) return state;
  return {
    ...state,
    selectedTileId: null,
    selectionStartedAt: null,
    resolution: { kind: "claim", claim: option },
    metrics: { ...state.metrics, claims: state.metrics.claims + 1 },
    log: note(state, `claimed ${option.gloss}${option.detail === null ? "" : ` (${option.detail})`}`),
  };
}

function applyPass(state: InteractionState): InteractionState {
  if (state.table.phase !== "claim" || state.resolution !== null) return state;
  return {
    ...state,
    selectedTileId: null,
    selectionStartedAt: null,
    resolution: { kind: "pass" },
    metrics: { ...state.metrics, passes: state.metrics.passes + 1 },
    log: note(state, "passed"),
  };
}

function turnOwner(table: TableState): string {
  if (table.phase === "claim") return "a claim is pending";
  return `${table.turn} to play`;
}

/** Tiles the pending decision depends on; used by the overlap check overlay. */
export function decisionTileIds(table: TableState): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const option of table.claims) {
    for (const id of option.usesTileIds) ids.add(id);
  }
  return ids;
}

export function medianMillis(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const low = sorted[middle - 1];
  const high = sorted[middle];
  if (low === undefined || high === undefined) return null;
  return Math.round((low + high) / 2);
}
