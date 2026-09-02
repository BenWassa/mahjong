import { useEffect, useRef, type JSX } from "react";

import type { TableMode } from "../game/modes";

/**
 * The one-time question a first launch asks, before any hand is dealt.
 *
 * One screen, one question, two buttons, no steps: PRD §9 rules out a
 * tutorial flow ("Learning happens inside real hands"), and this is the
 * smallest thing that can route a new player to a table they can actually
 * learn at. It is asked exactly once — answering it writes a mode, and a
 * stored mode is what "already asked" means.
 *
 * It renders ahead of the orientation split in App, so it works in whichever
 * orientation the phone happens to be in on first launch. Its own layout is a
 * single centred column with no breakpoint, which is what lets it fit both.
 */
export function ModeChoice({
  onChoose,
}: {
  readonly onChoose: (mode: TableMode) => void;
}): JSX.Element {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  return (
    <main className="choice" aria-labelledby="choice-title">
      <div className="choice__column">
        <h1 className="choice__title" id="choice-title">
          <span className="choice__han" aria-hidden="true">麻雀</span>
          New to mahjong?
        </h1>

        <button
          ref={firstRef}
          type="button"
          className="choice__option"
          onClick={() => { onChoose("beginner"); }}
        >
          <span className="choice__label">Yes — start simple</span>
          <span className="choice__detail">
            Any completed hand wins. Fewer numbers on the table. The game
            suggests a move and explains what just happened. Chow and Kong stay
            hidden until you want them.
          </span>
        </button>

        <button
          type="button"
          className="choice__option"
          onClick={() => { onChoose("standard"); }}
        >
          <span className="choice__label">No — the full table</span>
          <span className="choice__detail">
            Hong Kong Old Style as normal: a minimum faan value to win with,
            and every claim available.
          </span>
        </button>

        <p className="choice__note">
          You can change this at any time from the menu — turn the phone
          upright.
        </p>
      </div>
    </main>
  );
}
