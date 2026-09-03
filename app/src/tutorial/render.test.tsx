import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PlayerHand } from "../components/PlayerHand";
import { tileName } from "../game/labels";
import { LearnMenu } from "./LearnMenu";
import { LESSONS, lessonById } from "./lessons";
import { OpenSeat } from "./OpenSeat";
import { PeekHands } from "./PeekHands";
import { TutorialCoach } from "./TutorialCoach";
import { TutorialRunner, TUTORIAL_SEAT } from "./runner";

/**
 * What Learn to Play's markup promises a screen reader and a colourblind
 * player, asserted the same way `components/render.test.tsx` asserts the
 * table's: rendered to static markup rather than driven in a DOM. Live
 * behaviour is covered by the Playwright passes in `scripts/`.
 */

const runner = new TutorialRunner({
  lesson: lessonById("claims"),
  // No pacing at all: these tests read the opening frame, and a real timer
  // would make what they read depend on when they happened to look.
  schedule: () => () => undefined,
});
const snapshot = runner.snapshot();

describe("the coach strip", () => {
  const markup = renderToStaticMarkup(
    <TutorialCoach snapshot={snapshot} onAdvance={() => undefined} onQuit={() => undefined} />,
  );

  it("announces the instruction through a polite live region", () => {
    // The prompt changes without the player moving focus, so it has to be
    // spoken where they are rather than waiting to be found.
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
  });

  it("states the step count in words as well as in the 1/9 glyph", () => {
    expect(markup).toContain('class="coach__steps" aria-hidden="true"');
    expect(markup).toMatch(/Step\s*1\s*of\s*9/);
  });

  it("carries the current prompt as real text", () => {
    expect(markup).toContain(snapshot.step.prompt);
  });

  it("gives both of its controls a visible label", () => {
    expect(markup).toContain(">Leave</button>");
    expect(markup).toContain(">Next</button>");
  });
});

describe("an opponent shown face up, inside Peek", () => {
  const player = snapshot.view.players[1];
  const open = snapshot.openHands.get(1) ?? [];

  const shown = renderToStaticMarkup(
    <OpenSeat player={player} position="right" active={false} open={open} />,
  );

  it("says in its name that the hand is being shown for teaching", () => {
    expect(shown).toContain("shown for teaching");
  });

  it("names every tile it draws, rather than showing thirteen anonymous faces", () => {
    expect(open.length).toBeGreaterThan(0);
    for (const tile of open) {
      expect(shown).toContain(`aria-label="${tileName(tile.kind)}"`);
    }
  });

  it("marks the seat to play with more than a colour", () => {
    const active = renderToStaticMarkup(
      <OpenSeat player={player} position="right" active open={open} />,
    );
    expect(active).toContain('data-active="true"');
    expect(active).toContain("to play");
  });
});

describe("the Peek overlay", () => {
  const markup = renderToStaticMarkup(
    <PeekHands view={snapshot.view} openHands={snapshot.openHands} onClose={() => undefined} />,
  );

  it("is a real modal, not a panel that happens to sit on top", () => {
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
  });

  it("draws a panel for every seat the lesson reveals, and no others", () => {
    expect(snapshot.openHands.size).toBe(3);
    expect(markup.split("shown for teaching").length - 1).toBe(3);
  });

  it("says why these hands are visible, so the lesson is not misread", () => {
    expect(markup).toContain("A real game never");
  });

  it("keeps a way out on the screen as well as on the keyboard", () => {
    expect(markup).toContain(">Close</button>");
  });
});

describe("the Peek control", () => {
  it("is absent for a lesson that reveals nothing", () => {
    // The last lesson and the guided hand play with the hidden information a
    // real table has. There is no control, so there is nothing to press.
    const closed = new TutorialRunner({
      lesson: lessonById("win"),
      schedule: () => () => undefined,
    });
    expect(closed.snapshot().openHands.size).toBe(0);
    const markup = renderToStaticMarkup(
      <TutorialCoach
        snapshot={closed.snapshot()}
        onAdvance={() => undefined}
        onQuit={() => undefined}
        onPeek={null}
      />,
    );
    // Asserted on the control rather than on its label: the label is copy and
    // a lesson may legitimately mention Peek in a sentence, but a lesson that
    // reveals no seat must have no way to open the overlay at all. The absence
    // of the button is the guarantee.
    expect(markup).not.toContain("coach__peek");
  });

  it("is offered by the coach strip for a lesson that does reveal hands", () => {
    const markup = renderToStaticMarkup(
      <TutorialCoach
        snapshot={snapshot}
        onAdvance={() => undefined}
        onQuit={() => undefined}
        onPeek={() => undefined}
      />,
    );
    expect(markup).toContain(">Peek hands</button>");
  });
});

describe("a hand in an identify step", () => {
  const hand = snapshot.view.players[TUTORIAL_SEAT].concealed ?? [];
  const marked = new Set([hand[0]?.id].filter((id) => id !== undefined));
  const markup = renderToStaticMarkup(
    <PlayerHand
      tiles={hand}
      melds={[]}
      selected={null}
      discardable={new Set(hand.map((tile) => tile.id))}
      cornerLabel="off"
      onTapTile={() => undefined}
      tapAction="identify"
      marked={marked}
    />,
  );

  it("does not promise a discard the tap will not deliver", () => {
    expect(markup).not.toContain("Tap again to discard");
  });

  it("says in words which tiles are part of the shape just named", () => {
    expect(markup).toContain("part of the shape you named");
    expect(markup.split('aria-pressed="true"').length - 1).toBe(1);
  });

  it("marks them in the DOM as well, so the state is not carried by colour", () => {
    expect(markup).toContain('data-marked="true"');
  });
});

describe("the Learn menu", () => {
  const markup = renderToStaticMarkup(
    <LearnMenu
      completed={new Set(["shape"])}
      onStart={() => undefined}
      onPlay={() => undefined}
    />,
  );

  it("offers every lesson, finished or not, so nothing is ever locked", () => {
    // React escapes an apostrophe in static markup, so the comparison is made
    // against escaped text rather than against the source string.
    const escaped = (text: string): string => text.replaceAll("'", "&#x27;");
    for (const lesson of LESSONS) {
      expect(markup).toContain(escaped(lesson.title));
      expect(markup).toContain(escaped(lesson.summary));
    }
  });

  it("distinguishes a finished lesson by its verb, not only by a tick", () => {
    expect(markup).toContain("Replay lesson 1");
    expect(markup).toContain("Start lesson 2");
  });

  it("keeps a way out of the lessons on the screen", () => {
    // Always "back", never "skip": #33 made this a reference library reached
    // from the Menu rather than the first-run router, so everybody who arrives
    // here already has a table and is returning to it.
    expect(markup).toContain("Back to the game");
    expect(markup).not.toContain("Skip to the game");
  });
});

