import { useCallback, useEffect, useRef, type JSX } from "react";

import type { PublicGameState, Seat, Tile as TileType } from "@engine";

import { seatPosition, type SeatPosition } from "../game/labels";
import { OpenSeat } from "./OpenSeat";

/**
 * Peek: all three intentionally-open tutorial hands, at a size worth reading.
 *
 * Learn to Play used to keep the open hands face up in the seat rails for the
 * whole lesson. On a real phone that is 13-16px of tile — small enough that
 * the thing the lesson exists to show cannot be read at all — and it was
 * spending the felt the discard well and the coach strip needed. Keeping every
 * piece of information permanently visible was what made the table unreadable,
 * so the hands moved to a surface that can afford them and the table went back
 * to the compact seat summaries it shows in a real game.
 *
 * Three rules hold here:
 *
 * - **It shows the lesson's own state.** The tiles are the runner's
 *   `openHands` — the engine's named hidden-information accessor, narrowed to
 *   the seats this lesson reveals. Nothing is copied, mirrored or mocked, and
 *   a lesson that reveals no seat produces no panel and no control to open one.
 * - **The table holds still behind it.** The caller pauses the lesson's
 *   opponent pacing while this is up, so the position the player is reading is
 *   the position that is still there when they close it.
 * - **Every way out works.** The close control, a tap on the backdrop, Escape,
 *   and the Android back button all do the same thing.
 */
export function PeekHands({
  view,
  openHands,
  onClose,
}: {
  readonly view: PublicGameState;
  readonly openHands: ReadonlyMap<Seat, readonly TileType[]>;
  readonly onClose: () => void;
}): JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  /*
   * Focus moves in on open and back to whatever opened it on close, and Tab is
   * kept inside while it is up — the same contract the result sheet honours
   * (DESIGN.md §16). A reading surface a keyboard player can tab out of, onto
   * a table they cannot see, is worse than no overlay at all.
   */
  useEffect(() => {
    const restoreTo = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (restoreTo instanceof HTMLElement) restoreTo.focus();
    };
  }, []);

  /*
   * The Android back button.
   *
   * Peek pushes one history entry while it is open, so back closes the overlay
   * rather than leaving the lesson — which is what back means to somebody
   * looking at a panel over a table.
   *
   * Every other exit routes through that same entry rather than closing
   * directly: `requestClose` pops it, and the resulting `popstate` is what
   * actually closes. One door, so the button never has to be pressed twice to
   * get anywhere, and there is no ordering to get wrong between the two
   * mechanisms.
   *
   * The ref guards the push against StrictMode's deliberate double-invoke of
   * effects in development, which would otherwise stack two entries and make
   * the first back press a no-op on the dev server only — exactly the class of
   * bug that survives to a phone because production never reproduces it.
   */
  const pushedRef = useRef(false);
  useEffect(() => {
    if (!pushedRef.current) {
      pushedRef.current = true;
      window.history.pushState({ mahjongPeek: true }, "");
    }
    const onPop = (): void => {
      pushedRef.current = false;
      onClose();
    };
    window.addEventListener("popstate", onPop);
    return () => { window.removeEventListener("popstate", onPop); };
  }, [onClose]);

  const requestClose = useCallback(() => {
    // Falls through to closing directly if the entry was never pushed — a
    // browsing context that refuses `pushState` must still be able to shut the
    // overlay.
    if (pushedRef.current) window.history.back();
    else onClose();
  }, [onClose]);

  useEffect(() => {
    const node = dialogRef.current;
    if (node === null) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = node.querySelectorAll<HTMLElement>("button");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    // Escape is bound on the document rather than on the panel so it works
    // wherever focus happens to be, including after a tap moved it to the body.
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); };
  }, [requestClose]);

  const seats = [...openHands.keys()].sort(
    (left, right) => ORDER[seatPosition(left, view.viewer)] - ORDER[seatPosition(right, view.viewer)],
  );

  return (
    <div
      className="overlay peek"
      role="presentation"
      // A tap on the felt around the panel closes it, which is the gesture a
      // phone player reaches for before they find a button.
      onClick={(event) => { if (event.target === event.currentTarget) requestClose(); }}
    >
      <div
        className="peek__panel"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="peek-headline"
      >
        <div className="peek__head">
          <h2 className="peek__headline" id="peek-headline">
            The other hands
          </h2>
          <p className="peek__note">
            Shown because this lesson is teaching with them. A real game never
            shows you these.
          </p>
          <button type="button" className="peek__close" ref={closeRef} onClick={requestClose}>
            Close
          </button>
        </div>

        <div className="peek__seats">
          {seats.map((seat) => (
            <OpenSeat
              key={seat}
              player={view.players[seat]}
              position={seatPosition(seat, view.viewer)}
              active={view.currentSeat === seat}
              open={openHands.get(seat) ?? []}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Left, across, right — the order they sit in around the table. */
const ORDER: Record<SeatPosition, number> = { left: 0, across: 1, right: 2, self: 3 };
