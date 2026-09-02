import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PlayerHand } from "../components/PlayerHand";
import { tileName } from "../game/labels";
import { LearnFinish, LearnMenu } from "./LearnMenu";
import { LESSONS, lessonById } from "./lessons";
import { OpenSeat } from "./OpenSeat";
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

describe("an opponent shown face up", () => {
  const player = snapshot.view.players[1];
  const open = snapshot.openHands.get(1) ?? [];

  const shown = renderToStaticMarkup(
    <OpenSeat player={player} position="right" active={false} open={open} />,
  );
  const hidden = renderToStaticMarkup(
    <OpenSeat player={player} position="right" active={false} open={null} />,
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

  it("falls back to the table's own count when the lesson reveals nothing", () => {
    expect(hidden).toContain("tiles in hand");
    expect(hidden).not.toContain("shown for teaching");
    expect(hidden).toContain(`>${String(player.concealedCount)}<`);
  });

  it("marks whether it is open in the DOM, not only in the paint", () => {
    expect(shown).toContain('data-open="true"');
    expect(hidden).toContain('data-open="false"');
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
      firstRun
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
    expect(markup).toContain("Skip to the game");
  });

  it("stops calling it skipping once the player is coming back to replay one", () => {
    const returning = renderToStaticMarkup(
      <LearnMenu
        completed={new Set(["shape"])}
        firstRun={false}
        onStart={() => undefined}
        onPlay={() => undefined}
      />,
    );
    expect(returning).toContain("Back to the game");
    expect(returning).not.toContain("Skip to the game");
  });
});

describe("the graduation screen", () => {
  const markup = renderToStaticMarkup(<LearnFinish onChoose={() => undefined} />);

  it("names the one rule the beginner table relaxes", () => {
    // #30: Beginner and Standard must be told apart wherever they differ, and
    // this is the only screen in the tutorial where the player picks between
    // them.
    expect(markup).toContain("faan");
    expect(markup).toContain("any completed hand may be declared");
  });

  it("offers the full table as an equal choice", () => {
    expect(markup).toContain("Start on the full table");
  });
});
