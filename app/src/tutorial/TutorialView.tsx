import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

import type { Seat, TileId } from "@engine";

import { ClaimBand } from "../components/ClaimBand";
import { DiscardWell } from "../components/DiscardWell";
import { LayoutDebug } from "../components/LayoutDebug";
import { PlayerHand } from "../components/PlayerHand";
import { SeatCard } from "../components/SeatCard";
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
import { isLayoutDebugEnabled } from "../game/layoutDebug";
import { useTableGeometry } from "../game/useTableGeometry";
import type { CornerLabelMode } from "../tiles/Tile";
import { PeekHands } from "./PeekHands";
import { TutorialCoach } from "./TutorialCoach";
import type { TutorialHandle } from "./useTutorial";

const OPPONENT_SEATS: readonly Seat[] = [1, 2, 3];

/** Read once at module load: a link cannot switch the HUD on mid-session. */
const LAYOUT_DEBUG = isLayoutDebugEnabled();

/**
 * One lesson, on the production table.
 *
 * The composition is the table's own — status strip, three opponents around a
 * discard well, the reserved claim band, the hand — with the coach strip in
 * place of the status readout. It reuses `SeatCard`, `PlayerHand`, `ClaimBand`
 * and `DiscardWell` directly rather than drawing a teaching mock-up of them,
 * so what the player learns to tap is the thing they will be tapping five
 * minutes later, and the seats read exactly as they will at a real table.
 *
 * The opponents' open hands are not on this surface. They used to be, face up
 * in the rails for the whole lesson, and on a phone that made them too small
 * to read while taking the felt the well and the coach needed. They live
 * behind **Peek** instead — one control, one overlay, tiles at a size worth
 * reading — and the lesson holds still while it is open.
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
  const { snapshot, act, identify, advance, setPaused } = tutorial;
  const { view, legalActions, step, openHands, identified } = snapshot;
  const self = view.players[view.viewer];
  const hand = self.concealed ?? [];

  const geometry = useTableGeometry(
    self.melds.filter((meld) => meld.exposure === "exposed").length,
  );
  const { policy } = geometry;

  const [interaction, setInteraction] = useState<HandInteraction>(initialInteraction);
  const [peeking, setPeeking] = useState(false);

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

  /*
   * Peek exists only where the lesson has already decided to teach with open
   * hands. `openHands` is empty for every lesson whose `reveal` list is empty —
   * the last lesson and the guided hand — so there is no control to press and
   * no overlay to open, and no state in this component that could produce one.
   */
  const canPeek = openHands.size > 0;
  const openPeek = useCallback(() => {
    setPeeking(true);
    setPaused(true);
  }, [setPaused]);
  const closePeek = useCallback(() => {
    setPeeking(false);
    setPaused(false);
  }, [setPaused]);

  // A lesson that stops revealing seats mid-flight, or a step change while the
  // overlay is up, must not leave the pacing stopped behind a closed overlay.
  useEffect(() => {
    if (!canPeek && peeking) closePeek();
  }, [canPeek, peeking, closePeek]);
  useEffect(() => () => { setPaused(false); }, [setPaused]);

  const offered =
    view.phase.kind === "awaiting-claims" || view.phase.kind === "awaiting-rob"
      ? view.phase.pendingTile
      : null;

  const seatFor = (position: "left" | "across" | "right"): Seat =>
    OPPONENT_SEATS.find((seat) => seatPosition(seat, view.viewer) === position) ?? 1;

  const onAdvance = useCallback(() => {
    advance();
    if (snapshot.stepIndex + 1 === snapshot.stepCount) onFinish();
  }, [advance, onFinish, snapshot.stepCount, snapshot.stepIndex]);

  return (
    <div
      className="app tutorial"
      data-tier={policy.tier}
      style={geometryVariables(geometry)}
    >
      <TutorialCoach
        snapshot={snapshot}
        onAdvance={onAdvance}
        onQuit={onQuit}
        onPeek={canPeek ? openPeek : null}
      />

      <main className="table" aria-label="Mahjong table">
        {/*
          The table proper's own composition, seat for seat: the across seat
          heads the centre column above the well, with the two side rails
          beside it. The lesson used to break this apart to fit thirteen
          face-up tiles across the whole width; with the open hands behind Peek
          there is nothing left to break it for.
        */}
        <div className="tabletop">
          <SeatCard
            player={view.players[seatFor("left")]}
            position="left"
            active={view.currentSeat === seatFor("left")}
            showMeta={policy.showSeatMeta}
            showMelds={policy.showSeatMelds}
          />

          <div className="tabletop__centre">
            <SeatCard
              player={view.players[seatFor("across")]}
              position="across"
              active={view.currentSeat === seatFor("across")}
              showMeta={policy.showSeatMeta}
              showMelds={policy.showSeatMelds}
            />
            <DiscardWell
              discards={view.discards}
              columns={geometry.discardColumns}
              rows={geometry.discardRows}
              offered={offered}
              offeredFrom={null}
              view={view}
            />
          </div>

          <SeatCard
            player={view.players[seatFor("right")]}
            position="right"
            active={view.currentSeat === seatFor("right")}
            showMeta={policy.showSeatMeta}
            showMelds={policy.showSeatMelds}
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

      {peeking && (
        <PeekHands view={view} openHands={openHands} onClose={closePeek} />
      )}

      {LAYOUT_DEBUG && <LayoutDebug geometry={geometry} />}
    </div>
  );
}
