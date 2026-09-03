import { useEffect, useRef, type JSX } from "react";

import { useEscapeToClose, useOverlayBack } from "../game/useOverlayBack";
import type { TableMode } from "../game/modes";
import type { CornerLabelMode } from "../tiles/Tile";

/**
 * The menu, opened from the table (#33).
 *
 * This is the surface that replaces rotate-to-portrait as this app's
 * navigation. `ONBOARDING_DESIGN.md` §4.2 requires Menu, Learn, rules, stats
 * and settings to be reachable **without rotating the phone**, and requires
 * them to be usable in landscape, because landscape is the grip the player is
 * already in. So it is a sheet over the table rather than a screen the player
 * is sent to: the table stays visible behind it, closing it lands exactly
 * where they were, and nothing about the match moves while it is up.
 *
 * It lays out in either orientation for the same reason — §4.2 allows a
 * secondary surface to reflow into portrait but forbids portrait from being
 * its trigger. A player who rotates with the menu open keeps the menu.
 *
 * Its contents are the portrait menu's, unchanged in meaning: the same
 * toggles, the same wording, the same promise that none of them is ever
 * required to make a legal move. Only the way in is different.
 */

const LABEL_MODES: readonly CornerLabelMode[] = ["off", "rank", "rank-suit"];
const LABEL_NAME: Record<CornerLabelMode, string> = {
  off: "Off",
  rank: "Rank",
  "rank-suit": "Rank and suit",
};

export function nextCornerLabel(current: CornerLabelMode): CornerLabelMode {
  return LABEL_MODES[(LABEL_MODES.indexOf(current) + 1) % LABEL_MODES.length] ?? "off";
}

export function MenuSheet({
  mode,
  cornerLabel,
  assistOn,
  explainOn,
  showAllClaims,
  onClose,
  onChooseMode,
  onCycleLabel,
  onToggleAssist,
  onToggleExplain,
  onToggleAllClaims,
  onRestart,
  onLearn,
  onRules,
  onStats,
}: {
  readonly mode: TableMode;
  readonly cornerLabel: CornerLabelMode;
  readonly assistOn: boolean;
  readonly explainOn: boolean;
  readonly showAllClaims: boolean;
  readonly onClose: () => void;
  readonly onChooseMode: (mode: TableMode) => void;
  readonly onCycleLabel: () => void;
  readonly onToggleAssist: () => void;
  readonly onToggleExplain: () => void;
  readonly onToggleAllClaims: () => void;
  readonly onRestart: () => void;
  readonly onLearn: () => void;
  readonly onRules: () => void;
  readonly onStats: () => void;
}): JSX.Element {
  const requestClose = useOverlayBack(onClose);
  useEscapeToClose(requestClose);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  /*
   * Focus moves in on open and back to the Menu button on close, and Tab is
   * kept inside while it is up — the contract the result sheet and Peek
   * already honour (DESIGN.md §16). A sheet a keyboard player can tab out of,
   * onto a table they cannot reach, is worse than no sheet at all.
   */
  useEffect(() => {
    const restoreTo = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (restoreTo instanceof HTMLElement) restoreTo.focus();
    };
  }, []);

  useEffect(() => {
    const node = panelRef.current;
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

  return (
    <div
      className="overlay menu"
      role="presentation"
      onClick={(event) => { if (event.target === event.currentTarget) requestClose(); }}
    >
      <div
        className="menu__panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-headline"
      >
        <div className="menu__head">
          <h2 className="menu__headline" id="menu-headline">Menu</h2>
          <button type="button" className="menu__close" ref={closeRef} onClick={requestClose}>
            Back to the table
          </button>
        </div>

        <div className="menu__settings">
          <Setting id="menu-table" label="Table">
            <button
              type="button"
              className="menu__toggle"
              aria-describedby="menu-table"
              onClick={() => { onChooseMode(mode === "beginner" ? "standard" : "beginner"); }}
            >
              {mode === "beginner" ? "Beginner" : "Standard"}
            </button>
          </Setting>

          {mode === "beginner" && (
            <Setting id="menu-claims" label="Chow and Kong">
              <button
                type="button"
                className="menu__toggle"
                aria-describedby="menu-claims"
                aria-pressed={showAllClaims}
                onClick={onToggleAllClaims}
              >
                {showAllClaims ? "Shown" : "Hidden"}
              </button>
            </Setting>
          )}

          <Setting id="menu-restart" label="New match">
            <button
              type="button"
              className="menu__toggle"
              aria-describedby="menu-restart"
              onClick={onRestart}
            >
              Restart
            </button>
          </Setting>

          <Setting id="menu-assist" label="Assist">
            <button
              type="button"
              className="menu__toggle"
              aria-describedby="menu-assist"
              aria-pressed={assistOn}
              onClick={onToggleAssist}
            >
              {assistOn ? "On" : "Off"}
            </button>
          </Setting>

          <Setting id="menu-explain" label="Explain">
            <button
              type="button"
              className="menu__toggle"
              aria-describedby="menu-explain"
              aria-pressed={explainOn}
              onClick={onToggleExplain}
            >
              {explainOn ? "On" : "Off"}
            </button>
          </Setting>

          <Setting id="menu-labels" label="Corner labels">
            <button
              type="button"
              className="menu__toggle"
              aria-describedby="menu-labels"
              onClick={onCycleLabel}
            >
              {LABEL_NAME[cornerLabel]}
            </button>
          </Setting>

          <Setting id="menu-learn" label="Learn to play">
            <button
              type="button"
              className="menu__toggle"
              aria-describedby="menu-learn"
              onClick={onLearn}
            >
              Lessons
            </button>
          </Setting>

          <Setting id="menu-rules" label="Full rules">
            <button
              type="button"
              className="menu__toggle"
              aria-describedby="menu-rules"
              onClick={onRules}
            >
              Reference
            </button>
          </Setting>

          <Setting id="menu-stats" label="Stats">
            <button
              type="button"
              className="menu__toggle"
              aria-describedby="menu-stats"
              onClick={onStats}
            >
              View
            </button>
          </Setting>
        </div>

        <p className="menu__hint">
          Changing the table changes the rules for your next match, not the one
          you are in — Restart deals a new one straight away. Assist highlights
          legal actions and can suggest a discard. Explain shows a short note
          the first time a rule matters. Corner labels are a learning layer over
          the traditional face. None is ever required to make a legal move. The
          lessons can be replayed as often as you like and never affect the
          match you are in.
        </p>
      </div>
    </div>
  );
}

function Setting({
  id,
  label,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly children: JSX.Element;
}): JSX.Element {
  return (
    <div className="menu__setting">
      <span id={id}>{label}</span>
      {children}
    </div>
  );
}
