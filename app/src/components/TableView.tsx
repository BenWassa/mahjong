import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import type { Seat, TileId } from "@engine";

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
import type { SessionHandle } from "../game/useGameSession";
import { useTableGeometry } from "../game/useTableGeometry";
import type { CornerLabelMode } from "../tiles/Tile";
import { ClaimBand } from "./ClaimBand";
import { DiscardWell } from "./DiscardWell";
import { PlayerHand } from "./PlayerHand";
import { ResultOverlay } from "./ResultOverlay";
import { SeatCard } from "./SeatCard";
import { StatusStrip } from "./StatusStrip";

const OPPONENT_SEATS: readonly Seat[] = [1, 2, 3];

export function TableView({
  session,
  cornerLabel,
}: {
  readonly session: SessionHandle;
  readonly cornerLabel: CornerLabelMode;
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

  return (
    <div className="app" style={geometryVariables(geometry)}>
      <StatusStrip view={view} />

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

        <ClaimBand actions={claims} hand={hand} onClaim={onClaim} />

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
        />
      )}
    </div>
  );
}
