import { seatWind } from "./seats.js";
import { compareTileKinds } from "./tiles.js";
import type {
  AwaitingClaimsPhase,
  AwaitingRobPhase,
  InternalGameState,
  PublicGameState,
  PublicMeld,
  PublicPhase,
  PublicPlayerState,
  Seat,
  Tile,
} from "./types.js";

function sortedTiles(tiles: readonly Tile[]): readonly Tile[] {
  return [...tiles].sort(
    (left, right) => compareTileKinds(left.kind, right.kind) || left.id.localeCompare(right.id),
  );
}

function publicMeld(meld: InternalGameState["players"][number]["melds"][number], own: boolean): PublicMeld {
  const revealIdentity = own || meld.exposure === "exposed";
  return {
    type: meld.type,
    exposure: meld.exposure,
    tiles: revealIdentity ? sortedTiles(meld.tiles) : null,
    tileCount: meld.tiles.length as 3 | 4,
    claimedFrom: revealIdentity ? meld.claimedFrom : null,
  };
}

function publicPlayer(
  state: InternalGameState,
  seat: Seat,
  viewer: Seat,
): PublicPlayerState {
  const player = state.players[seat];
  const own = seat === viewer;
  return {
    seat,
    seatWind: seatWind(seat, state.dealer),
    concealedCount: player.concealed.length,
    concealed: own ? sortedTiles(player.concealed) : null,
    melds: player.melds.map((meld) => publicMeld(meld, own)),
    bonuses: sortedTiles(player.bonuses),
    score: player.score,
  };
}

function pendingDiscard(state: InternalGameState, phase: AwaitingClaimsPhase): Tile {
  const discard = state.discards[phase.discardIndex];
  if (discard === undefined) {
    throw new Error(`Pending discard ${String(phase.discardIndex)} is missing`);
  }
  return discard.tile;
}

function pendingAddedKong(state: InternalGameState, phase: AwaitingRobPhase): Tile {
  const tile = state.players[phase.declarer].concealed.find(
    (candidate) => candidate.id === phase.tileId,
  );
  if (tile === undefined) {
    throw new Error(`Pending added-kong tile ${phase.tileId} is missing`);
  }
  return tile;
}

function publicPhase(state: InternalGameState): PublicPhase {
  switch (state.phase.kind) {
    case "awaiting-discard":
      return {
        kind: "awaiting-discard",
        seat: state.phase.seat,
        source: state.phase.source,
      };
    case "awaiting-claims":
      return {
        kind: "awaiting-claims",
        discarder: state.phase.discarder,
        pendingTile: pendingDiscard(state, state.phase),
        responders: state.phase.responders,
      };
    case "awaiting-rob":
      return {
        kind: "awaiting-rob",
        declarer: state.phase.declarer,
        pendingTile: pendingAddedKong(state, state.phase),
        responders: state.phase.responders,
      };
    case "hand-ended":
      return { kind: "hand-ended", result: state.phase.result };
    case "match-ended":
      return { kind: "match-ended", result: state.phase.result };
  }
}

/** Returns only information the requested seat is permitted to observe. */
export function projectPublicState(state: InternalGameState, viewer: Seat): PublicGameState {
  const players = [0, 1, 2, 3].map((seat) =>
    publicPlayer(state, seat as Seat, viewer),
  ) as [PublicPlayerState, PublicPlayerState, PublicPlayerState, PublicPlayerState];
  return {
    version: 1,
    viewer,
    config: state.config,
    handIndex: state.handIndex,
    dealer: state.dealer,
    roundWind: state.roundWind,
    currentSeat: state.phase.kind === "awaiting-discard" ? state.phase.seat : null,
    players,
    wallCount: state.wall.length,
    discards: state.discards,
    phase: publicPhase(state),
  };
}
