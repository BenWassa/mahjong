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
import { Attention } from "./Attention";
import { OnboardingCoach } from "./OnboardingCoach";
import type { CalloutRung } from "./placement";
import { teachSelector } from "./targets";
import type { TutorialHandle } from "./useTutorial";

const OPPONENT_SEATS: readonly Seat[] = [1, 2, 3];

/** Read once at module load: a link cannot switch the HUD on mid-session. */
const LAYOUT_DEBUG = isLayoutDebugEnabled();

/**
 * One phase of the first run, on the production table (#33).
 *
 * The composition is the table's own, component for component — three seats
 * around a discard well, the reserved claim band, the hand — because what the
 * learner is taught to read has to be the thing they will still be reading
 * five minutes later. Over it sits the attention layer: a spotlight on the
 * object the current step is about, and the sentence about it placed beside
 * that object rather than in a strip above the whole table.
 *
 * Three things are deliberately absent compared with the #30 lesson view:
 *
 * - **Peek.** No first-run phase reveals a seat, so `openHands` is empty and
 *   there is no control to draw and no state here that could produce one. A
 *   real player cannot inspect a concealed hand, so nothing on this path
 *   teaches a decision that depends on inspecting one (§8.1).
 * - **A portrait layout.** The #30 lessons wrapped the hand to two rows in
 *   portrait, which taught a novice on a surface they would never play on.
 *   Interactive teaching is landscape, like the game (§4.2).
 * - **A step counter.** See `OnboardingCoach`.
 */
export function OnboardingView({
  tutorial,
  cornerLabel,
  phaseIndex,
  phaseCount,
  onLeave,
  onMenu,
}: {
  readonly tutorial: TutorialHandle;
  readonly cornerLabel: CornerLabelMode;
  readonly phaseIndex: number;
  readonly phaseCount: number;
  /** Leave the walkthrough for the table the entry choice selected. */
  readonly onLeave: () => void;
  readonly onMenu: () => void;
}): JSX.Element {
  const { snapshot, act, advance, rescue } = tutorial;
  const { view, legalActions, step } = snapshot;
  const self = view.players[view.viewer];
  const hand = self.concealed ?? [];

  const geometry = useTableGeometry(
    self.melds.filter((meld) => meld.exposure === "exposed").length,
  );
  const { policy } = geometry;

  const [interaction, setInteraction] = useState<HandInteraction>(initialInteraction);
  const [rung, setRung] = useState<CalloutRung>("adjacent");

  const handSignature = hand.map((tile) => tile.id).join(",");
  const discardable = useMemo(
    () => discardableTiles(legalActions),
    [legalActions, handSignature],
  );
  const claims = useMemo(() => claimActions(legalActions), [legalActions]);

  // A lift only means something for the position it was made in. When the step
  // or the hand moves underneath it the selection is dropped, rather than left
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
      setInteraction((current) => {
        const result = reduceInteraction(current, { type: "tap-tile", tileId }, discardable);
        if (result.discard !== null) {
          act({ type: "discard", seat: view.viewer, tileId: result.discard });
          hapticDiscard();
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

  /*
   * What the current step is pointing at, and what must not be covered.
   *
   * The claim band is only a decision input while a claim is actually offered.
   * Treating it as permanently sacred would push every callout in the
   * walkthrough down a rung for nothing — §5.5 protects live decision inputs,
   * not reserved empty space.
   */
  const focus = step.focus;
  const targets = useMemo(
    () => focus?.targets(view) ?? [],
    [focus, view],
  );
  const protect = useMemo(() => {
    const keys = focus?.protect ?? [];
    const live = keys.filter((key) => key !== "claims" || claims.length > 0);
    return [teachSelector("hand"), ...live.map(teachSelector)];
  }, [focus, claims.length]);

  // The note replaces the instruction once the step is satisfied, so the
  // anchored sentence goes with it: keeping "tap this tile" beside a tile that
  // has already gone is worse than saying nothing.
  const showCallout = focus !== undefined && !snapshot.stepSatisfied;

  const onAdvance = useCallback(() => { advance(); }, [advance]);

  return (
    <div
      className="app tutorial onboarding"
      data-tier={policy.tier}
      style={geometryVariables(geometry)}
    >
      <OnboardingCoach
        snapshot={snapshot}
        phaseIndex={phaseIndex}
        phaseCount={phaseCount}
        onAdvance={onAdvance}
        onLeave={onLeave}
        onRescue={rescue}
        onMenu={onMenu}
        strandedCallout={showCallout && rung === "global" ? focus.callout : null}
      />

      <main className="table" aria-label="Mahjong table">
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
        />
      </main>

      {showCallout && (
        <Attention
          viewport={geometry.viewport}
          targets={targets}
          callout={focus.callout}
          protect={protect}
          level={snapshot.hintLevel}
          onRung={setRung}
        />
      )}

      {LAYOUT_DEBUG && <LayoutDebug geometry={geometry} />}
    </div>
  );
}
