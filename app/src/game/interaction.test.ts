import { describe, expect, it } from "vitest";

import type { GameAction, TileId } from "@engine";

import {
  claimActions,
  discardableTiles,
  initialInteraction,
  reduceInteraction,
} from "./interaction";

/**
 * The #7 interaction model. Tap to lift, tap the same tile again to discard.
 * An accidental discard is release-blocking, so the reducer is tested rather
 * than assumed.
 */

const A = "characters-1-0" as TileId;
const B = "characters-2-0" as TileId;
const legal = new Set<TileId>([A, B]);

describe("tap to lift, tap again to discard", () => {
  it("lifts on the first tap without discarding", () => {
    const result = reduceInteraction(initialInteraction, { type: "tap-tile", tileId: A }, legal);
    expect(result.state.selected).toBe(A);
    expect(result.discard).toBeNull();
  });

  it("discards on a second tap of the same tile", () => {
    const lifted = reduceInteraction(initialInteraction, { type: "tap-tile", tileId: A }, legal);
    const committed = reduceInteraction(lifted.state, { type: "tap-tile", tileId: A }, legal);
    expect(committed.discard).toBe(A);
    expect(committed.state.selected).toBeNull();
  });

  it("moves the selection when another tile is tapped, and discards nothing", () => {
    const lifted = reduceInteraction(initialInteraction, { type: "tap-tile", tileId: A }, legal);
    const moved = reduceInteraction(lifted.state, { type: "tap-tile", tileId: B }, legal);
    expect(moved.state.selected).toBe(B);
    expect(moved.discard).toBeNull();
  });

  it("needs two taps again after the selection moves", () => {
    let state = reduceInteraction(initialInteraction, { type: "tap-tile", tileId: A }, legal).state;
    state = reduceInteraction(state, { type: "tap-tile", tileId: B }, legal).state;
    const first = reduceInteraction(state, { type: "tap-tile", tileId: B }, legal);
    expect(first.discard).toBe(B);
  });

  it("ignores a tile that cannot legally be discarded, and keeps the selection", () => {
    const lifted = reduceInteraction(initialInteraction, { type: "tap-tile", tileId: A }, legal);
    const other = "dragon-red-0" as TileId;
    const result = reduceInteraction(lifted.state, { type: "tap-tile", tileId: other }, legal);
    expect(result.state.selected).toBe(A);
    expect(result.discard).toBeNull();
  });

  it("never discards from a cleared state in one tap", () => {
    const cleared = reduceInteraction(
      { selected: A },
      { type: "clear" },
      legal,
    );
    expect(cleared.state.selected).toBeNull();
    const next = reduceInteraction(cleared.state, { type: "tap-tile", tileId: A }, legal);
    expect(next.discard).toBeNull();
  });
});

describe("discardableTiles", () => {
  it("collects only the ids of legal discards", () => {
    const actions: GameAction[] = [
      { type: "discard", seat: 0, tileId: A },
      { type: "pass", seat: 0 },
      { type: "discard", seat: 0, tileId: B },
    ];
    expect([...discardableTiles(actions)]).toEqual([A, B]);
  });

  it("is empty when the player owes no discard", () => {
    expect(discardableTiles([{ type: "pass", seat: 0 }]).size).toBe(0);
  });
});

describe("claim ordering", () => {
  const actions: GameAction[] = [
    { type: "pass", seat: 0 },
    { type: "claim-chow", seat: 0, tileIds: [A, B] },
    { type: "win", seat: 0 },
    { type: "claim-pung", seat: 0, tileIds: [A, B] },
  ];

  it("leads with Win and trails with Pass", () => {
    const ordered = claimActions(actions).map((action) => action.type);
    expect(ordered[0]).toBe("win");
    expect(ordered.at(-1)).toBe("pass");
  });

  it("never places Pass adjacent to Win", () => {
    const ordered = claimActions(actions).map((action) => action.type);
    const win = ordered.indexOf("win");
    const pass = ordered.indexOf("pass");
    expect(Math.abs(win - pass)).toBeGreaterThan(1);
  });

  it("drops discards and system steps from the claim band", () => {
    const mixed = claimActions([
      { type: "discard", seat: 0, tileId: A },
      { type: "continue" },
      { type: "pass", seat: 0 },
    ]);
    expect(mixed.map((action) => action.type)).toEqual(["pass"]);
  });
});
