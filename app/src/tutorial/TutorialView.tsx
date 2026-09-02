import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import type { Seat, TileId } from "@engine";

import { ClaimBand } from "../components/ClaimBand";
import { DiscardWell } from "../components/DiscardWell";
import { PlayerHand } from "../components/PlayerHand";
import { geometryVariables } from "../game/geometry";
import { hapticClaim, hapticDiscard } from "../game/haptics";
import {
  claimActions,
  discardableTiles,
  initialInteraction,
  reduceInteraction,
  type ClaimAction,
  type HandInteraction,
} from "../game/interaction";
import { seatPosition } from "../game/labels";
import { useTableGeometry } from "../game/useTableGeometry";
import type { CornerLabelMode } from "../tiles/Tile";
import { OpenSeat } from "./OpenSeat";
import { TutorialCoach } from "./TutorialCoach";
import type { TutorialHandle } from "./useTutorial";

const OPPONENT_SEATS: readonly Seat[] = [1, 2, 3];

/**
 * One lesson, on the production table.
 *
 * The composition is the table's own — status strip, three opponents around a
 * discard well, the reserved claim band, the hand — with the coach strip in
 * place of the status readout and the seats able to show their tiles. It reuses
 * `PlayerHand`, `ClaimBand` and `DiscardWell` directly rather than drawing a
 * teaching mock-up of them, so what the player learns to tap is the thing they
 * will be tapping five minutes later.
 *
 * It renders in both orientations. The table proper asks for landscape because
 * fourteen tiles have to be simultaneously readable (§4); a lesson's hand is
 * the same size, so portrait wraps it rather than pretending it fits — which
 * is the one place the tutorial's layout differs from the table's.
 */
export function TutorialView({
  tutorial,
  cornerLabel,
  onQuit,
  onFinish,
}: {
  readonly tutorial: TutorialHandle;
  readonly cornerLabel: CornerLabelMode;
  readonly onQuit: () => void;
  readonly onFinish: () => void;
}): JSX.Element {
  const { snapshot, act, identify, advance } = tutorial;
  const { view, legalActions, step, openHands, identified } = snapshot;
  const self = view.players[view.viewer];
  const hand = self.concealed ?? [];

  const geometry = useTableGeometry(
    self.melds.filter((meld) => meld.exposure === "exposed").length,
  );

  const [interaction, setInteraction] = useState<HandInteraction>(initialInteraction);

  const identifying = step.kind === "identify";
  // The hand's contents, not the array's identity: every snapshot builds a new
  // array, and what the memo below actually depends on is which tiles are in
  // it.
  const handSignature = hand.map((tile) => tile.id).join(",");
  const discardable = useMemo(
    // An identify step responds to a tap on any tile, because pointing at the
    // wrong shape is an answer the lesson has something to say about — a hand
    // where only the right tiles are tappable would be answering for them.
    () => (identifying ? new Set(hand.map((tile) => tile.id)) : discardableTiles(legalActions)),
    [identifying, legalActions, handSignature],
  );
  const claims = useMemo(() => claimActions(legalActions), [legalActions]);
  const marked = useMemo(() => new Set(identified), [identified]);

  // A lift only means something for the position it was made in. When the step
  // or the hand moves underneath it, the selection is dropped rather than left
  // pointing at a tile the player is no longer deciding about.
  useEffect(() => {
    setInteraction((current) =>
      current.selected !== null && !discardable.has(current.selected)
        ? initialInteraction
        : current,
    );
  }, [discardable]);

  const onTapTile = useCallback(
    (tileId: TileId) => {
      if (identifying) {
        identify(tileId);
        return;
      }
      setInteraction((current) => {
        const result = reduceInteraction(current, { type: "tap-tile", tileId }, discardable);
        if (result.discard !== null) {
          act({ type: "discard", seat: view.viewer, tileId: result.discard });
          hapticDiscard();
        }
        return result.state;
      });
    },
    [act, discardable, identify, identifying, view.viewer],
  );

  const onClaim = useCallback(
    (action: ClaimAction) => {
      setInteraction(initialInteraction);
      act(action);
      if (action.type !== "pass") hapticClaim();
    },
    [act],
  );

  const offered =
    view.phase.kind === "awaiting-claims" || view.phase.kind === "awaiting-rob"
      ? view.phase.pendingTile
      : null;

  const seatFor = (position: "left" | "across" | "right"): Seat =>
    OPPONENT_SEATS.find((seat) => seatPosition(seat, view.viewer) === position) ?? 1;

  const openFor = (seat: Seat): readonly typeof hand[number][] | null =>
    openHands.get(seat) ?? null;

  const onAdvance = useCallback(() => {
    advance();
    if (snapshot.stepIndex + 1 === snapshot.stepCount) onFinish();
  }, [advance, onFinish, snapshot.stepCount, snapshot.stepIndex]);

  return (
    <div className="app tutorial" style={geometryVariables(geometry)}>
      <TutorialCoach snapshot={snapshot} onAdvance={onAdvance} onQuit={onQuit} />

      <main className="table" aria-label="Mahjong table">
        {/*
          The across seat is a row of its own rather than a header inside the
          centre column, which is where the table proper puts it. Thirteen face
          -up tiles need the width of the whole table to stay on one line, and
          on a short landscape phone the alternative was four wrapped rows
          shouldering the discard well down into the hand.
        */}
        <div className="tabletop">
          <OpenSeat
            player={view.players[seatFor("across")]}
            position="across"
            active={view.currentSeat === seatFor("across")}
            open={openFor(seatFor("across"))}
          />

          <OpenSeat
            player={view.players[seatFor("left")]}
            position="left"
            active={view.currentSeat === seatFor("left")}
            open={openFor(seatFor("left"))}
          />

          <div className="tabletop__centre">
            <DiscardWell
              discards={view.discards}
              columns={geometry.discardColumns}
              rows={geometry.discardRows}
              offered={offered}
              offeredFrom={null}
              view={view}
            />
          </div>

          <OpenSeat
            player={view.players[seatFor("right")]}
            position="right"
            active={view.currentSeat === seatFor("right")}
            open={openFor(seatFor("right"))}
          />
        </div>

        <ClaimBand actions={claims} hand={hand} onClaim={onClaim} assistOn />

        <PlayerHand
          tiles={hand}
          melds={self.melds}
          selected={interaction.selected}
          discardable={discardable}
          cornerLabel={cornerLabel}
          onTapTile={onTapTile}
          tapAction={identifying ? "identify" : "discard"}
          marked={marked}
        />
      </main>
    </div>
  );
}
