import { useEffect, useRef, type JSX } from "react";

import type { TableMode } from "../game/modes";

/**
 * The one-time question a first launch asks, before any hand is dealt.
 *
 * One screen, one question, three buttons, no steps. It is asked exactly once
 * — answering it writes a mode, and a stored mode is what "already asked"
 * means — and every answer, Learn to Play included, writes one, so there is
 * still a single field recording that the question was put.
 *
 * Learn to Play leads because #30 recommends it, but it is never imposed:
 * both other doors go straight to a table, and Learn stays reachable forever
 * from the portrait menu. Nothing here can lock a player out of the game.
 *
 * It renders ahead of the orientation split in App, so it works in whichever
 * orientation the phone happens to be in on first launch. Its own layout is a
 * single centred column with no breakpoint, which is what lets it fit both.
 */
export function ModeChoice({
  onChoose,
  onLearn,
}: {
  readonly onChoose: (mode: TableMode) => void;
  readonly onLearn: () => void;
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
          className="choice__option choice__option--lead"
          onClick={onLearn}
        >
          <span className="choice__label">
            Learn to play
            <span className="choice__badge">about 6 minutes</span>
          </span>
          <span className="choice__detail">
            Five short lessons on a real table: make a hand, take a turn, choose
            a discard, claim a tile, win. You play them — there is nothing to
            read through.
          </span>
        </button>

        <button
          type="button"
          className="choice__option"
          onClick={() => { onChoose("beginner"); }}
        >
          <span className="choice__label">I know mahjong — start simple</span>
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
          <span className="choice__label">I know mahjong — the full table</span>
          <span className="choice__detail">
            Hong Kong Old Style as normal: a minimum faan value to win with,
            and every claim available.
          </span>
        </button>

        <p className="choice__note">
          You can change this, or run the lessons again, at any time from the
          menu — turn the phone upright.
        </p>
      </div>
    </main>
  );
}
