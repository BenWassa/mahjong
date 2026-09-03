import type { JSX } from "react";

/**
 * Portrait, while a table is live (#33).
 *
 * This screen used to be the menu. `ONBOARDING_DESIGN.md` §4.2 ends that:
 * rotating the hardware must not change the information architecture, and a
 * player who tilts their phone while thinking about a discard should not
 * arrive somewhere else. So portrait now does the one honest thing it can —
 * it says the table needs the long edge, and holds.
 *
 * "Holds" is literal and is the whole point. Nothing is torn down: the match,
 * the hand, the pending claim and the walkthrough phase are all still mounted
 * behind this, because only the render swaps. Rotating back returns the exact
 * table that was there, mid-decision.
 *
 * The Menu button is here as well, so portrait is never a dead end for
 * somebody who rotated *looking* for the menu — which, after several builds of
 * teaching them that rotation was the menu, some players will.
 */
export function RotateNotice({
  onMenu,
  beginner = false,
  teaching = false,
}: {
  readonly onMenu: () => void;
  readonly beginner?: boolean;
  /** True while a walkthrough is running, which is also being held. */
  readonly teaching?: boolean;
}): JSX.Element {
  return (
    <div className="portrait" data-beginner={beginner}>
      <h1 className="portrait__title">
        <span className="portrait__han" aria-hidden="true">麻雀</span>
        Mahjong
      </h1>
      <p className="portrait__note">Hong Kong Old Style</p>

      <p className="portrait__prompt">
        Turn the phone sideways to carry on. Fourteen tiles have to be readable
        at once, and portrait cannot seat them at a size worth reading.
      </p>
      <p className="portrait__hint">
        {teaching
          ? "Your walkthrough is exactly where you left it — nothing has moved."
          : "Your hand is exactly where you left it — nothing has moved."}
      </p>

      <div className="portrait__settings">
        <div className="portrait__setting">
          <span id="portrait-menu">Menu</span>
          <button
            type="button"
            className="portrait__toggle"
            aria-describedby="portrait-menu"
            onClick={onMenu}
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}
