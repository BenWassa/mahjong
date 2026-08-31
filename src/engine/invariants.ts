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

function addTile(
  seen: Map<TileId, string>,
  expectedById: ReadonlyMap<TileId, Tile["kind"]>,
  tile: Tile,
  zone: string,
): void {
  const previous = seen.get(tile.id);
  if (previous !== undefined) {
    fail(`Tile ${tile.id} appears in both ${previous} and ${zone}`);
  }

  const expectedKind = expectedById.get(tile.id);
  if (expectedKind === undefined) {
    fail(`Unknown physical tile ${tile.id} in ${zone}`);
  }
  if (expectedKind !== tile.kind) {
    fail(
      `Physical tile ${tile.id} has kind ${tile.kind} in ${zone}; expected ${expectedKind}`,
    );
  }
  if (isBonusTile(tile) && zone !== "wall" && !zone.includes("bonuses")) {
    fail(`Bonus tile ${tile.id} is illegally present in ${zone}`);
  }
  seen.set(tile.id, zone);
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

  for (const [seatIndex, player] of state.players.entries()) {
    if (player.seat !== seatIndex) {
      fail(
        `Player tuple index ${String(seatIndex)} contains seat ${String(player.seat)}`,
      );
    }
  }

  for (const tile of state.wall) {
    addTile(seen, expectedById, tile, "wall");
  }

  for (const player of state.players) {
    for (const tile of player.concealed) {
      addTile(seen, expectedById, tile, `player ${String(player.seat)} concealed`);
    }
    for (const [meldIndex, meld] of player.melds.entries()) {
      if (meld.tiles.length !== (meld.type === "kong" ? 4 : 3)) {
        fail(
          `Player ${String(player.seat)} meld ${String(meldIndex)} has an invalid tile count`,
        );
      }
      if (meld.exposure === "concealed" && meld.claimedFrom !== null) {
        fail(
          `Player ${String(player.seat)} concealed meld ${String(meldIndex)} names a claiming seat`,
        );
      }
      for (const tile of meld.tiles) {
        addTile(
          seen,
          expectedById,
          tile,
          `player ${String(player.seat)} meld ${String(meldIndex)}`,
        );
      }
    }
    for (const tile of player.bonuses) {
      addTile(seen, expectedById, tile, `player ${String(player.seat)} bonuses`);
    }
  }

  for (const [position, discard] of state.discards.entries()) {
    if (discard.index !== position) {
      fail(
        `Discard position ${String(position)} carries index ${String(discard.index)}`,
      );
    }
    if (discard.claimedBy === null) {
      if (discard.claimType !== null) {
        fail(`Unclaimed discard ${String(discard.index)} has claim type ${discard.claimType}`);
      }
      addTile(seen, expectedById, discard.tile, `discard ${String(discard.index)}`);
      continue;
    }
    if (discard.claimType === null) {
      fail(`Claimed discard ${String(discard.index)} has no claim type`);
    }
    const claimant = state.players[discard.claimedBy];
    const claimedTileExists = claimant.melds.some((meld) => {
      const compatibleType =
        meld.type === discard.claimType ||
        (discard.claimType === "pung" && meld.type === "kong");
      return (
        compatibleType &&
        meld.exposure === "exposed" &&
        meld.tiles.some((tile) => tile.id === discard.tile.id)
      );
    });
    if (!claimedTileExists) {
      fail(
        `Claimed discard ${String(discard.index)} is absent from a compatible exposed meld for claimant ${String(discard.claimedBy)}`,
      );
    }
  }

  if (seen.size !== expected.length) {
    const missing = expected.filter((tile) => !seen.has(tile.id)).map((tile) => tile.id);
    fail(
      `Expected ${String(expected.length)} physical tiles, found ${String(seen.size)}; missing: ${missing.join(", ")}`,
    );
  }

  if (state.record.seed !== state.seed) {
    fail("Game record seed differs from engine seed");
  }
  if (JSON.stringify(state.record.config) !== JSON.stringify(state.config)) {
    fail("Game record config differs from engine config");
  }
  for (const [position, recorded] of state.record.actions.entries()) {
    if (recorded.index !== position) {
      fail(
        `Recorded action position ${String(position)} carries index ${String(recorded.index)}`,
      );
    }
    if (recorded.handIndex > state.handIndex) {
      fail(
        `Recorded action ${String(recorded.index)} belongs to future hand ${String(recorded.handIndex)}`,
      );
    }
  }
  if (state.record.hands.length > state.handIndex + 1) {
    fail("Game record contains a result for a future hand");
  }
  if (
    state.phase.kind === "awaiting-discard" &&
    state.phase.seat !== state.players[state.phase.seat].seat
  ) {
    fail("Awaiting-discard phase points to an invalid player");
  }
}
