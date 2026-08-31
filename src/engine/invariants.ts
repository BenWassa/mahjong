import { createTileSet, isBonusTile } from "./tiles.js";
import type { InternalGameState, Tile, TileId } from "./types.js";

export class InvariantViolationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvariantViolationError";
  }
}

function fail(message: string): never {
  throw new InvariantViolationError(message);
}

function addTile(seen: Map<TileId, string>, tile: Tile, zone: string): void {
  const previous = seen.get(tile.id);
  if (previous !== undefined) {
    fail(`Tile ${tile.id} appears in both ${previous} and ${zone}`);
  }
  seen.set(tile.id, zone);
  if (isBonusTile(tile) && zone !== "wall" && !zone.includes("bonuses")) {
    fail(`Bonus tile ${tile.id} is illegally present in ${zone}`);
  }
}

/**
 * Checks physical conservation and the state-shape facts that must hold after
 * every transition. Historical events and claimed discard ledger entries are
 * references, not additional tile zones.
 */
export function assertGameInvariants(state: InternalGameState): void {
  const expected = createTileSet(state.config.tileSetSize);
  const expectedById = new Map(expected.map((tile) => [tile.id, tile.kind]));
  const seen = new Map<TileId, string>();

  for (const tile of state.wall) {
    addTile(seen, tile, "wall");
  }

  for (const player of state.players) {
    if (player.seat < 0 || player.seat > 3) {
      fail(`Invalid player seat ${String(player.seat)}`);
    }
    for (const tile of player.concealed) {
      addTile(seen, tile, `player ${String(player.seat)} concealed`);
    }
    for (const [meldIndex, meld] of player.melds.entries()) {
      if (meld.tiles.length !== (meld.type === "kong" ? 4 : 3)) {
        fail(
          `Player ${String(player.seat)} meld ${String(meldIndex)} has an invalid tile count`,
        );
      }
      for (const tile of meld.tiles) {
        addTile(seen, tile, `player ${String(player.seat)} meld ${String(meldIndex)}`);
      }
    }
    for (const tile of player.bonuses) {
      addTile(seen, tile, `player ${String(player.seat)} bonuses`);
    }
  }

  for (const discard of state.discards) {
    if (discard.claimedBy === null) {
      addTile(seen, discard.tile, `discard ${String(discard.index)}`);
      continue;
    }
    const claimant = state.players[discard.claimedBy];
    const claimedTileExists = claimant.melds.some((meld) =>
      meld.tiles.some((tile) => tile.id === discard.tile.id),
    );
    if (!claimedTileExists) {
      fail(
        `Claimed discard ${String(discard.index)} is absent from claimant ${String(discard.claimedBy)}'s melds`,
      );
    }
  }

  if (seen.size !== expected.length) {
    const missing = expected.filter((tile) => !seen.has(tile.id)).map((tile) => tile.id);
    fail(
      `Expected ${String(expected.length)} physical tiles, found ${String(seen.size)}; missing: ${missing.join(", ")}`,
    );
  }

  for (const [id, zone] of seen) {
    const expectedKind = expectedById.get(id);
    if (expectedKind === undefined) {
      fail(`Unknown physical tile ${id} in ${zone}`);
    }
  }

  if (state.record.seed !== state.seed) {
    fail("Game record seed differs from engine seed");
  }
  if (JSON.stringify(state.record.config) !== JSON.stringify(state.config)) {
    fail("Game record config differs from engine config");
  }
  if (state.record.hands.length > state.handIndex + 1) {
    fail("Game record contains a result for a future hand");
  }
  if (state.phase.kind === "awaiting-discard" && state.phase.seat !== state.players[state.phase.seat].seat) {
    fail("Awaiting-discard phase points to an invalid player");
  }
}
