import { useEffect, useRef, type JSX } from "react";

import type { FaanBreakdown, HandResult, Seat } from "@engine";

import { seatPosition, seatPositionName, tileName, windName } from "../game/labels";

/**
 * End-of-hand result. The faan breakdown is itemised every hand whether or not
 * the learning layer is on, because a total with no working is the arithmetic
 * the PRD calls a release-blocking failure.
 *
 * A real modal: focus moves in on open, is trapped while it is up, and Escape
 * is not offered, because there is no state to return to behind it.
 */
export function ResultOverlay({
  result,
  scoring,
  viewer,
  onContinue,
  isMatchEnd,
}: {
  readonly result: HandResult;
  readonly scoring: FaanBreakdown | null;
  readonly viewer: Seat;
  readonly onContinue: () => void;
  readonly isMatchEnd: boolean;
}): JSX.Element {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  useEffect(() => {
    const node = dialogRef.current;
    if (node === null) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
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
    node.addEventListener("keydown", onKeyDown);
    return () => { node.removeEventListener("keydown", onKeyDown); };
  }, []);

  const headline =
    result.outcome === "draw"
      ? "Wall exhausted"
      : result.winner === viewer
        ? "You win"
        : `${seatPositionName(seatPosition(result.winner, viewer))} wins`;

  return (
    <div className="overlay" role="presentation">
      <div
        className="sheet"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-headline"
      >
        <h2 className="sheet__headline" id="result-headline">
          {headline}
        </h2>

        <p className="sheet__meta">
          {windName(result.roundWind)} round, hand {result.handIndex + 1}
          {result.outcome === "win" && result.winningTile !== null
            ? `, on ${tileName(result.winningTile.kind)}`
            : ""}
        </p>

        {scoring === null ? (
          <p className="sheet__meta">No score is paid on an exhausted wall.</p>
        ) : (
          <>
            <p className="sheet__total">
              <span className="sheet__faan tabular">{scoring.totalFaan}</span>
              <span className="sheet__faanword">faan</span>
              {scoring.limitHand !== null && (
                <span className="sheet__limit">{scoring.limitHand}</span>
              )}
            </p>

            <ul className="sheet__items">
              {scoring.items.map((item) => (
                <li key={item.id} className="sheet__item">
                  <span className="sheet__itemname">
                    {item.name}
                    <span className="sheet__itemhan" aria-hidden="true">
                      {item.chineseName}
                    </span>
                  </span>
                  <span className="sheet__itemfaan tabular">{item.faan}</span>
                </li>
              ))}
            </ul>

            <ul className="sheet__payments" aria-label="Payments">
              {scoring.payments.map((payment, seat) => (
                <li key={seat} className="sheet__payment">
                  <span>
                    {seat === viewer
                      ? "You"
                      : seatPositionName(seatPosition(seat as Seat, viewer))}
                  </span>
                  <span className="tabular">
                    {payment > 0 ? `+${String(payment)}` : String(payment)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <button type="button" className="sheet__go" ref={confirmRef} onClick={onContinue}>
          {isMatchEnd ? "Finish match" : "Next hand"}
        </button>
      </div>
    </div>
  );
}
