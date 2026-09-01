import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DEFAULT_RULES_PROFILE, newGame, type FaanBreakdown, type HandResult, type TileKind } from "@engine";

import { tileName, tileShortLabel } from "../game/labels";
import { Tile } from "../tiles/Tile";
import { ClaimBand } from "./ClaimBand";
import { DiscardWell } from "./DiscardWell";
import { PlayerHand } from "./PlayerHand";
import { ResultOverlay } from "./ResultOverlay";
import { SeatCard } from "./SeatCard";
import { StatusStrip } from "./StatusStrip";

/**
 * Accessible names and non-colour state differentiation.
 *
 * Rendered to static markup rather than driven in a DOM: what these assert is
 * what the markup promises a screen reader and a colourblind player. The live
 * behaviour is covered by the Playwright pass in scripts/visual-qa.mjs.
 */

const game = newGame(DEFAULT_RULES_PROFILE, "render-test");
const view = game.state(0);
const hand = view.players[0].concealed ?? [];

const ALL_KINDS: readonly TileKind[] = [
  ...(["characters", "bamboo", "dots"] as const).flatMap((suit) =>
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((rank) => `${suit}-${String(rank)}` as TileKind),
  ),
  "wind-east",
  "wind-south",
  "wind-west",
  "wind-north",
  "dragon-red",
  "dragon-green",
  "dragon-white",
  "flower-1",
  "flower-2",
  "flower-3",
  "flower-4",
  "season-1",
  "season-2",
  "season-3",
  "season-4",
];

describe("the tile set", () => {
  it("covers all 42 distinct faces", () => {
    // 27 suited + 4 winds + 3 dragons = 34 ordinary kinds, plus 4 flowers and
    // 4 seasons. A 144-tile set draws these 42 faces.
    expect(ALL_KINDS).toHaveLength(42);
  });

  it("gives every tile a spoken name that is not its raw kind", () => {
    for (const kind of ALL_KINDS) {
      const name = tileName(kind);
      expect(name).not.toBe(kind);
      expect(name.length).toBeGreaterThan(2);
    }
  });

  it("gives every tile a distinct spoken name", () => {
    const names = new Set(ALL_KINDS.map((kind) => tileName(kind)));
    expect(names.size).toBe(ALL_KINDS.length);
  });

  it("draws engraving for every tile rather than an empty face", () => {
    for (const kind of ALL_KINDS) {
      const markup = renderToStaticMarkup(<Tile kind={kind} />);
      expect(markup).toContain(`aria-label="${tileName(kind)}"`);
      // Every face has to put something inside the body beyond the two rects
      // and the bevel highlight the shared body draws.
      const drawn = markup.split("<").length;
      expect(drawn).toBeGreaterThan(6);
    }
  });

  it("labels a face-down tile as face down and never names the tile behind it", () => {
    const markup = renderToStaticMarkup(<Tile kind="dragon-red" facedown />);
    expect(markup).toContain("Face-down tile");
    expect(markup).not.toContain("Red Dragon");
  });

  it("keeps the corner label a separate short layer from the spoken name", () => {
    expect(tileShortLabel("characters-5", "rank-suit")).toBe("5C");
    expect(tileShortLabel("dragon-green", "rank")).toBe("G");
    const plain = renderToStaticMarkup(<Tile kind="characters-5" />);
    const labelled = renderToStaticMarkup(
      <Tile kind="characters-5" cornerLabel="rank-suit" />,
    );
    // The label adds a layer; it does not change the face or the name.
    expect(labelled.length).toBeGreaterThan(plain.length);
    expect(labelled).toContain('aria-label="Five of Characters"');
  });
});

describe("the hand", () => {
  const markup = renderToStaticMarkup(
    <PlayerHand
      tiles={hand}
      melds={[]}
      selected={hand[0]?.id ?? null}
      discardable={new Set(hand.map((tile) => tile.id))}
      cornerLabel="off"
      onTapTile={() => undefined}
    />,
  );

  it("makes every tile a real button", () => {
    expect(markup.split("<button").length - 1).toBe(hand.length);
  });

  it("announces the selected tile and what a second tap will do", () => {
    expect(markup).toContain("selected. Tap again to discard.");
    expect(markup).toContain('aria-pressed="true"');
  });

  it("marks selection with a data attribute, not with colour alone", () => {
    expect(markup).toContain('data-selected="true"');
  });

  it("does not dim the hand when no discard is legal, so a claim stays readable", () => {
    // #7 found a dimmed hand obscured the tiles a claim depends on.
    const claiming = renderToStaticMarkup(
      <PlayerHand
        tiles={hand}
        melds={[]}
        selected={null}
        discardable={new Set()}
        cornerLabel="off"
        onTapTile={() => undefined}
      />,
    );
    expect(claiming).not.toContain('data-discardable="false"');
  });
});

describe("the claim band", () => {
  it("names each claim and the tiles it would spend", () => {
    const first = hand[0];
    const second = hand[1];
    if (first === undefined || second === undefined) throw new Error("short hand");
    const markup = renderToStaticMarkup(
      <ClaimBand
        actions={[
          { type: "win", seat: 0 },
          { type: "claim-chow", seat: 0, tileIds: [first.id, second.id] },
          { type: "pass", seat: 0 },
        ]}
        hand={hand}
        onClaim={() => undefined}
      />,
    );
    expect(markup).toContain('aria-label="Win"');
    expect(markup).toContain(`Chow using ${tileName(first.kind)} and ${tileName(second.kind)}`);
    expect(markup).toContain('aria-label="Pass"');
  });

  it("says so when nothing is claimable rather than rendering an unlabelled strip", () => {
    const markup = renderToStaticMarkup(
      <ClaimBand actions={[]} hand={hand} onClaim={() => undefined} />,
    );
    expect(markup).toContain("No claim available");
  });

  it("rings a legal claim with assist on, but never Pass, and leaves it unmarked with assist off", () => {
    const actions = [
      { type: "win", seat: 0 } as const,
      { type: "pass", seat: 0 } as const,
    ];
    const assisted = renderToStaticMarkup(
      <ClaimBand actions={actions} hand={hand} onClaim={() => undefined} assistOn />,
    );
    expect(assisted).toContain('data-assist="true"');
    // Pass never carries the assist ring: it is not the action being suggested.
    expect(assisted).toMatch(/claim--pass" data-assist="false"/);

    const plain = renderToStaticMarkup(
      <ClaimBand actions={actions} hand={hand} onClaim={() => undefined} />,
    );
    expect(plain).not.toContain('data-assist="true"');
  });

  it("shows an assist hint only in the band's reserved empty space, never alongside real claims", () => {
    const hint = <p className="claimband__hint">Suggested: discard something</p>;
    const empty = renderToStaticMarkup(
      <ClaimBand actions={[]} hand={hand} onClaim={() => undefined} assistHint={hint} />,
    );
    expect(empty).toContain("Suggested: discard something");

    const busy = renderToStaticMarkup(
      <ClaimBand
        actions={[{ type: "pass", seat: 0 }]}
        hand={hand}
        onClaim={() => undefined}
        assistHint={hint}
      />,
    );
    expect(busy).not.toContain("Suggested: discard something");
  });
});

describe("the result overlay's explain notes", () => {
  const winResult: HandResult = {
    outcome: "win",
    handIndex: 0,
    roundWind: "east",
    dealer: 0,
    winner: 0,
    fromSeat: null,
    source: "self-draw",
    winningTile: null,
    structure: null,
    circumstances: {
      lastWallTile: false,
      lastDiscard: false,
      openingDealerHand: false,
      dealerFirstDiscard: false,
    },
    scoring: null,
  };
  const drawResult: HandResult = {
    outcome: "draw",
    handIndex: 0,
    roundWind: "east",
    dealer: 0,
    reason: "wall-exhausted",
    scoring: null,
  };
  const scoring: FaanBreakdown = {
    qualifyingFaan: 1,
    totalFaan: 1,
    items: [{ id: "A1", name: "Common Hand", chineseName: "平糊", faan: 1 }],
    basePoints: 2,
    payments: [2, -2, 0, 0],
    limitHand: null,
  };

  it("shows nothing extra by default, itemised breakdown aside", () => {
    const markup = renderToStaticMarkup(
      <ResultOverlay
        result={winResult}
        scoring={scoring}
        viewer={0}
        onContinue={() => undefined}
        isMatchEnd={false}
      />,
    );
    expect(markup).not.toContain("sheet__explain");
  });

  it("adds the self-draw/discard and stacking notes once, only when asked", () => {
    const markup = renderToStaticMarkup(
      <ResultOverlay
        result={winResult}
        scoring={scoring}
        viewer={0}
        onContinue={() => undefined}
        isMatchEnd={false}
        explainWinSources
        explainFaanBreakdown
      />,
    );
    expect(markup).toContain("A win off a");
    expect(markup).toContain("stacking");
  });

  it("adds the exhaustive-draw note on a drawn hand, only when asked", () => {
    const withoutExplain = renderToStaticMarkup(
      <ResultOverlay
        result={drawResult}
        scoring={null}
        viewer={0}
        onContinue={() => undefined}
        isMatchEnd={false}
      />,
    );
    expect(withoutExplain).not.toContain("wall ran out");

    const withExplain = renderToStaticMarkup(
      <ResultOverlay
        result={drawResult}
        scoring={null}
        viewer={0}
        onContinue={() => undefined}
        isMatchEnd={false}
        explainExhaustiveDraw
      />,
    );
    expect(withExplain).toContain("wall ran out");
  });
});

describe("opponents and status", () => {
  it("names a seat by position, wind and turn state", () => {
    const markup = renderToStaticMarkup(
      <SeatCard player={view.players[1]} position="right" active />,
    );
    expect(markup).toContain("Right opponent");
    expect(markup).toContain("to play");
    expect(markup).toContain("tiles in hand");
  });

  it("marks the acting seat with a data attribute as well as a colour", () => {
    const markup = renderToStaticMarkup(
      <SeatCard player={view.players[1]} position="right" active />,
    );
    expect(markup).toContain('data-active="true"');
  });

  it("never renders an opponent's concealed tiles", () => {
    const markup = renderToStaticMarkup(
      <SeatCard player={view.players[2]} position="across" active={false} />,
    );
    expect(markup).not.toContain("of Characters");
    expect(markup).not.toContain("of Bamboo");
  });

  it("states whose turn it is in words, not only as a marker", () => {
    const markup = renderToStaticMarkup(<StatusStrip view={view} />);
    expect(markup).toMatch(/Your turn|to play|Claim open|Hand over/);
    expect(markup).toContain('role="status"');
  });
});

describe("the discard well", () => {
  const tiles = hand.slice(0, 4);
  const [first, second, third, fourth] = tiles;
  if (
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined
  ) {
    throw new Error("short hand");
  }

  const discards = [
    { index: 0, seat: 1 as const, tile: first, claimedBy: null, claimType: null },
    { index: 1, seat: 2 as const, tile: second, claimedBy: 3 as const, claimType: "pung" as const },
    { index: 2, seat: 3 as const, tile: third, claimedBy: null, claimType: null },
    { index: 3, seat: 1 as const, tile: fourth, claimedBy: null, claimType: null },
  ];

  it("leaves a claimed tile out of the pile, because it is in a meld now", () => {
    const markup = renderToStaticMarkup(
      <DiscardWell
        discards={discards}
        columns={12}
        rows={3}
        offered={null}
        offeredFrom={null}
        view={view}
      />,
    );
    expect(markup).toContain(`Discard pile, 3 tiles`);
  });

  it("leaves the tile currently on offer out of the pile", () => {
    // It is already drawn at hand size above the pile. Drawn twice, the player
    // has to work out whether they are looking at one tile or two at the exact
    // moment they are deciding whether to claim it.
    const markup = renderToStaticMarkup(
      <DiscardWell
        discards={discards}
        columns={12}
        rows={3}
        offered={fourth}
        offeredFrom="Left"
        view={view}
      />,
    );
    expect(markup).toContain(`Discard pile, 2 tiles`);
    expect(markup).toContain("Left discarded");
  });

  it("shows the round plaque when nothing is on offer, and not when something is", () => {
    const idle = renderToStaticMarkup(
      <DiscardWell
        discards={discards}
        columns={12}
        rows={3}
        offered={null}
        offeredFrom={null}
        view={view}
      />,
    );
    const claiming = renderToStaticMarkup(
      <DiscardWell
        discards={discards}
        columns={12}
        rows={3}
        offered={fourth}
        offeredFrom="Left"
        view={view}
      />,
    );
    expect(idle).toContain("plaque");
    expect(claiming).not.toContain("plaque");
  });
});
