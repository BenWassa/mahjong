import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";

import type { Seat, TileId } from "@engine";

import { describeWaitingTiles, isBelowMinimumFaanWin, suggestDiscard } from "../game/assist";
import { detectConcepts, type ConceptId, type LearningProgress } from "../game/explain";
import { geometryVariables } from "../game/geometry";
import {
  claimActions,
  discardableTiles,
  initialInteraction,
  reduceInteraction,
  type ClaimAction,
  type HandInteraction,
} from "../game/interaction";
import { seatPosition, seatPositionName } from "../game/labels";
import type { SessionSnapshot } from "../game/session";
import type { SessionHandle } from "../game/useGameSession";
import { useTableGeometry } from "../game/useTableGeometry";
import type { CornerLabelMode } from "../tiles/Tile";
import { ClaimBand } from "./ClaimBand";
import { DiscardWell } from "./DiscardWell";
import { ExplainBanner } from "./ExplainBanner";
import { PlayerHand } from "./PlayerHand";
import { ResultOverlay } from "./ResultOverlay";
import { SeatCard } from "./SeatCard";
import { StatusStrip } from "./StatusStrip";

const OPPONENT_SEATS: readonly Seat[] = [1, 2, 3];

export function TableView({
  session,
  cornerLabel,
  matchSeed,
  assistOn,
  explainOn,
  learning,
}: {
  readonly session: SessionHandle;
  readonly cornerLabel: CornerLabelMode;
  readonly matchSeed: string;
  readonly assistOn: boolean;
  readonly explainOn: boolean;
  readonly learning: LearningProgress;
}): JSX.Element {
  const { snapshot, act, advance, scoreBreakdown } = session;
  const { view, legalActions } = snapshot;
  const self = view.players[view.viewer];
  const hand = self.concealed ?? [];

  const geometry = useTableGeometry(
    self.melds.filter((meld) => meld.exposure === "exposed").length,
  );

  const [interaction, setInteraction] = useState<HandInteraction>(initialInteraction);

  const discardable = useMemo(() => discardableTiles(legalActions), [legalActions]);
  const claims = useMemo(() => claimActions(legalActions), [legalActions]);

  // A selection is only meaningful for the hand it was made in. When the hand
  // or the phase changes underneath it, the lift is dropped rather than left
  // pointing at a tile the player is no longer deciding about.
  const handSignature = hand.map((tile) => tile.id).join(",");
  useEffect(() => {
    setInteraction((current) =>
      current.selected !== null && !discardable.has(current.selected)
        ? initialInteraction
        : current,
    );
  }, [handSignature, discardable]);

  const onTapTile = useCallback(
    (tileId: TileId) => {
      setInteraction((current) => {
        const result = reduceInteraction(current, { type: "tap-tile", tileId }, discardable);
        if (result.discard !== null) {
          act({ type: "discard", seat: view.viewer, tileId: result.discard });
        }
        return result.state;
      });
    },
    [act, discardable, view.viewer],
  );

  const onClaim = useCallback(
    (action: ClaimAction) => {
      setInteraction(initialInteraction);
      act(action);
    },
    [act],
  );

  const offered =
    view.phase.kind === "awaiting-claims" || view.phase.kind === "awaiting-rob"
      ? view.phase.pendingTile
      : null;
  const offeredFrom =
    view.phase.kind === "awaiting-claims"
      ? view.phase.discarder === view.viewer
        ? "You"
        : seatPositionName(seatPosition(view.phase.discarder, view.viewer))
      : view.phase.kind === "awaiting-rob"
        ? seatPositionName(seatPosition(view.phase.declarer, view.viewer))
        : null;

  // Narrowed once, so the overlay is rendered from a phase that is known to
  // carry a result rather than from a re-tested union at the call site.
  const endedPhase =
    view.phase.kind === "hand-ended" || view.phase.kind === "match-ended"
      ? view.phase
      : null;

  const seatFor = (position: "left" | "across" | "right"): Seat =>
    OPPONENT_SEATS.find(
      (seat) => seatPosition(seat, view.viewer) === position,
    ) ?? 1;

  const belowMinimumFaanWin = useMemo(() => isBelowMinimumFaanWin(snapshot), [snapshot]);

  // Explain's non-blocking banner (#9): diffs the previous snapshot against
  // this one, so a concept fires exactly on the turn it first becomes true,
  // and only the first still-unseen one of those is shown.
  const previousSnapshotRef = useRef<SessionSnapshot | null>(null);
  const [activeConcept, setActiveConcept] = useState<ConceptId | null>(null);
  useEffect(() => {
    const previous = previousSnapshotRef.current;
    previousSnapshotRef.current = snapshot;
    // A hand that just ended has nothing routine left to annotate with a
    // banner: the result sheet's own notes take over from here, and the
    // sheet is the one surface allowed to interrupt (DESIGN.md §16).
    if (endedPhase !== null) {
      setActiveConcept(null);
      return;
    }
    if (!explainOn) return;
    const triggered = detectConcepts(previous, snapshot, belowMinimumFaanWin);
    const next = triggered.find((id) => !learning.has(id));
    if (next !== undefined) {
      learning.markSeen(next);
      setActiveConcept(next);
    }
  }, [snapshot, explainOn, belowMinimumFaanWin, learning, endedPhase]);

  // The three explain notes anchored to the result sheet fire at most once
  // each. Latched to the hand they first appear on, computed during render
  // from the progress so far, so the mark-as-seen effect below cannot make
  // one vanish mid-display on the same result.
  const resultExplainRef = useRef({
    handIndex: -1,
    winSources: false,
    faanBreakdown: false,
    exhaustiveDraw: false,
  });
  if (endedPhase !== null && resultExplainRef.current.handIndex !== endedPhase.result.handIndex) {
    const isWin = endedPhase.result.outcome === "win";
    const isDraw = endedPhase.result.outcome === "draw";
    resultExplainRef.current = {
      handIndex: endedPhase.result.handIndex,
      winSources: explainOn && isWin && !learning.has("win-sources"),
      faanBreakdown: explainOn && isWin && !learning.has("faan-breakdown"),
      exhaustiveDraw: explainOn && isDraw && !learning.has("exhaustive-draw"),
    };
  }
  useEffect(() => {
    const shown = resultExplainRef.current;
    if (shown.winSources) learning.markSeen("win-sources");
    if (shown.faanBreakdown) learning.markSeen("faan-breakdown");
    if (shown.exhaustiveDraw) learning.markSeen("exhaustive-draw");
  }, [endedPhase, learning]);

  // Assist's discard suggestion and waiting-tiles readout (#9) share the
  // claim band's reserved empty space: the discard decision only exists when
  // nothing is claimable, and "waiting on" is only defined at every other
  // moment, so the two never need to be shown at once.
  const suggestion = useMemo(() => {
    if (!assistOn || claims.length > 0) return null;
    if (view.phase.kind !== "awaiting-discard" || view.phase.seat !== view.viewer) return null;
    return suggestDiscard(snapshot, matchSeed);
  }, [assistOn, claims.length, view.phase, view.viewer, snapshot, matchSeed]);
  const waitingHint = useMemo(() => {
    if (!assistOn || claims.length > 0 || suggestion !== null) return null;
    if (snapshot.waitingTiles.length === 0) return null;
    return describeWaitingTiles(snapshot.waitingTiles);
  }, [assistOn, claims.length, suggestion, snapshot.waitingTiles]);
  const assistHint =
    suggestion !== null ? (
      <p className="claimband__hint">
        Suggested: discard <strong>{suggestion.tileName}</strong> — {suggestion.reason}
      </p>
    ) : waitingHint !== null ? (
      <p className="claimband__hint">
        Waiting on: <strong>{waitingHint}</strong>
      </p>
    ) : null;

  return (
    <div className="app" style={geometryVariables(geometry)}>
      <StatusStrip view={view} />

      {activeConcept !== null && (
        <ExplainBanner concept={activeConcept} onDismiss={() => { setActiveConcept(null); }} />
      )}

      <main className="table" aria-label="Mahjong table">
        <div className="tabletop">
          <SeatCard
            player={view.players[seatFor("left")]}
            position="left"
            active={view.currentSeat === seatFor("left")}
          />

          <div className="tabletop__centre">
            <SeatCard
              player={view.players[seatFor("across")]}
              position="across"
              active={view.currentSeat === seatFor("across")}
            />
            <DiscardWell
              discards={view.discards}
              columns={geometry.discardColumns}
              rows={geometry.discardRows}
              offered={offered}
              offeredFrom={offeredFrom}
              view={view}
            />
          </div>

          <SeatCard
            player={view.players[seatFor("right")]}
            position="right"
            active={view.currentSeat === seatFor("right")}
          />
        </div>

        <ClaimBand
          actions={claims}
          hand={hand}
          onClaim={onClaim}
          assistOn={assistOn}
          assistHint={assistHint}
        />

        <PlayerHand
          tiles={hand}
          melds={self.melds}
          selected={interaction.selected}
          discardable={discardable}
          cornerLabel={cornerLabel}
          onTapTile={onTapTile}
        />
      </main>

      {endedPhase !== null && (
        <ResultOverlay
          result={endedPhase.result}
          scoring={scoreBreakdown}
          viewer={view.viewer}
          isMatchEnd={endedPhase.kind === "match-ended"}
          onContinue={advance}
          explainWinSources={resultExplainRef.current.winSources}
          explainFaanBreakdown={resultExplainRef.current.faanBreakdown}
          explainExhaustiveDraw={resultExplainRef.current.exhaustiveDraw}
        />
      )}
    </div>
  );
}
