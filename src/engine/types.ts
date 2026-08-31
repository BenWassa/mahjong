export type Seat = 0 | 1 | 2 | 3;

export type Wind = "east" | "south" | "west" | "north";

export type Suit = "characters" | "bamboo" | "dots";

export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type BonusIndex = 1 | 2 | 3 | 4;

export type SuitedTileKind = `${Suit}-${Rank}`;
export type WindTileKind = `wind-${Wind}`;
export type DragonTileKind = "dragon-red" | "dragon-green" | "dragon-white";
export type BonusTileKind = `flower-${BonusIndex}` | `season-${BonusIndex}`;
export type OrdinaryTileKind = SuitedTileKind | WindTileKind | DragonTileKind;
export type TileKind = OrdinaryTileKind | BonusTileKind;
export type TileId = `${TileKind}-${number}`;

export interface Tile {
  readonly id: TileId;
  readonly kind: TileKind;
}

export type MinimumFaan = 0 | 1 | 3;
export type TileSetSize = 136 | 144;
export type MatchLength = "single-hand" | "east-round" | "four-rounds";

export interface RulesProfile {
  readonly tileSetSize: TileSetSize;
  readonly minimumFaan: MinimumFaan;
  readonly matchLength: MatchLength;
}

export const DEFAULT_RULES_PROFILE: RulesProfile = Object.freeze({
  tileSetSize: 144,
  minimumFaan: 1,
  matchLength: "east-round",
});

export type MeldType = "chow" | "pung" | "kong";
export type MeldExposure = "exposed" | "concealed";

export interface Meld {
  readonly type: MeldType;
  readonly exposure: MeldExposure;
  readonly tiles: readonly Tile[];
  readonly claimedFrom: Seat | null;
}

export interface Discard {
  readonly index: number;
  readonly seat: Seat;
  readonly tile: Tile;
  readonly claimedBy: Seat | null;
  readonly claimType: "chow" | "pung" | "kong" | null;
}

export interface PlayerState {
  readonly seat: Seat;
  readonly concealed: readonly Tile[];
  readonly melds: readonly Meld[];
  readonly bonuses: readonly Tile[];
  readonly score: number;
}

export interface ChowSet {
  readonly type: "chow";
  readonly tiles: readonly [OrdinaryTileKind, OrdinaryTileKind, OrdinaryTileKind];
}

export interface PungSet {
  readonly type: "pung";
  readonly tile: OrdinaryTileKind;
}

export type ConcealedSet = ChowSet | PungSet;

export interface StandardWinningStructure {
  readonly type: "standard";
  readonly pair: OrdinaryTileKind;
  readonly sets: readonly ConcealedSet[];
}

export interface ThirteenOrphansStructure {
  readonly type: "thirteen-orphans";
  readonly pair: OrdinaryTileKind;
}

export type WinningStructure =
  | StandardWinningStructure
  | ThirteenOrphansStructure;

export interface FaanItem {
  readonly id: string;
  readonly name: string;
  readonly chineseName: string;
  readonly faan: number;
}

export interface FaanBreakdown {
  readonly qualifyingFaan: number;
  readonly totalFaan: number;
  readonly items: readonly FaanItem[];
  readonly basePoints: number;
  readonly payments: readonly [number, number, number, number];
  readonly limitHand: string | null;
}

export type WinSource =
  | "self-draw"
  | "discard"
  | "kong-replacement"
  | "robbed-kong"
  | "seven-flowers"
  | "eight-immortals";

export interface WinHandResult {
  readonly outcome: "win";
  readonly handIndex: number;
  readonly roundWind: Wind;
  readonly dealer: Seat;
  readonly winner: Seat;
  readonly fromSeat: Seat | null;
  readonly source: WinSource;
  readonly winningTile: Tile | null;
  readonly structure: WinningStructure | null;
  readonly circumstances: {
    readonly lastWallTile: boolean;
    readonly lastDiscard: boolean;
    readonly openingDealerHand: boolean;
    readonly dealerFirstDiscard: boolean;
  };
  readonly scoring: FaanBreakdown | null;
}

export interface DrawHandResult {
  readonly outcome: "draw";
  readonly handIndex: number;
  readonly roundWind: Wind;
  readonly dealer: Seat;
  readonly reason: "wall-exhausted";
  readonly scoring: null;
}

export type HandResult = WinHandResult | DrawHandResult;

export type GameAction =
  | { readonly type: "discard"; readonly seat: Seat; readonly tileId: TileId }
  | {
      readonly type: "claim-chow";
      readonly seat: Seat;
      readonly tileIds: readonly [TileId, TileId];
    }
  | {
      readonly type: "claim-pung";
      readonly seat: Seat;
      readonly tileIds: readonly [TileId, TileId];
    }
  | {
      readonly type: "claim-kong";
      readonly seat: Seat;
      readonly tileIds: readonly [TileId, TileId, TileId];
    }
  | { readonly type: "win"; readonly seat: Seat }
  | { readonly type: "pass"; readonly seat: Seat }
  | {
      readonly type: "declare-concealed-kong";
      readonly seat: Seat;
      readonly tileIds: readonly [TileId, TileId, TileId, TileId];
    }
  | {
      readonly type: "declare-added-kong";
      readonly seat: Seat;
      readonly tileId: TileId;
      readonly meldIndex: number;
    }
  | { readonly type: "continue" };

export interface RecordedAction {
  readonly index: number;
  readonly handIndex: number;
  readonly action: GameAction;
}

export type GameEvent =
  | { readonly type: "match-started"; readonly seed: string }
  | {
      readonly type: "hand-started";
      readonly handIndex: number;
      readonly handSeed: string;
      readonly dealer: Seat;
      readonly roundWind: Wind;
    }
  | {
      readonly type: "tile-drawn";
      readonly handIndex: number;
      readonly seat: Seat;
      readonly tile: Tile;
      readonly source: "deal" | "wall" | "bonus-replacement" | "kong-replacement";
    }
  | {
      readonly type: "bonus-revealed";
      readonly handIndex: number;
      readonly seat: Seat;
      readonly tile: Tile;
    }
  | {
      readonly type: "discarded";
      readonly handIndex: number;
      readonly seat: Seat;
      readonly tile: Tile;
      readonly discardIndex: number;
    }
  | {
      readonly type: "meld-declared";
      readonly handIndex: number;
      readonly seat: Seat;
      readonly meld: Meld;
    }
  | {
      readonly type: "kong-robbed";
      readonly handIndex: number;
      readonly declarer: Seat;
      readonly winner: Seat;
      readonly tile: Tile;
    }
  | {
      readonly type: "hand-ended";
      readonly handIndex: number;
      readonly result: HandResult;
    }
  | { readonly type: "match-ended"; readonly handIndex: number };

export interface GameRecord {
  readonly version: 1;
  readonly seed: string;
  readonly config: RulesProfile;
  readonly actions: readonly RecordedAction[];
  readonly events: readonly GameEvent[];
  readonly hands: readonly HandResult[];
  readonly completed: boolean;
}

export interface AwaitingDiscardPhase {
  readonly kind: "awaiting-discard";
  readonly seat: Seat;
  readonly source: "deal" | "wall" | "claim" | "kong-replacement";
  readonly drawnTile: Tile | null;
  readonly lastWallTile: boolean;
}

export interface ClaimResponse {
  readonly seat: Seat;
  readonly action: Extract<
    GameAction,
    { readonly type: "claim-chow" | "claim-pung" | "claim-kong" | "win" | "pass" }
  >;
}

export interface AwaitingClaimsPhase {
  readonly kind: "awaiting-claims";
  readonly discardIndex: number;
  readonly discarder: Seat;
  readonly responders: readonly Seat[];
  readonly responses: readonly ClaimResponse[];
  readonly lastWallDiscard: boolean;
}

export interface AwaitingRobPhase {
  readonly kind: "awaiting-rob";
  readonly declarer: Seat;
  readonly tileId: TileId;
  readonly meldIndex: number;
  readonly responders: readonly Seat[];
  readonly responses: readonly ClaimResponse[];
}

export interface HandEndedPhase {
  readonly kind: "hand-ended";
  readonly result: HandResult;
}

export interface MatchEndedPhase {
  readonly kind: "match-ended";
  readonly result: HandResult;
}

export type GamePhase =
  | AwaitingDiscardPhase
  | AwaitingClaimsPhase
  | AwaitingRobPhase
  | HandEndedPhase
  | MatchEndedPhase;

export interface InternalGameState {
  readonly version: 1;
  readonly seed: string;
  readonly config: RulesProfile;
  readonly handIndex: number;
  readonly dealer: Seat;
  readonly roundStarter: Seat;
  readonly roundWind: Wind;
  readonly players: readonly [PlayerState, PlayerState, PlayerState, PlayerState];
  readonly wall: readonly Tile[];
  readonly discards: readonly Discard[];
  readonly phase: GamePhase;
  readonly record: GameRecord;
}

export interface PublicMeld {
  readonly type: MeldType;
  readonly exposure: MeldExposure;
  readonly tiles: readonly Tile[] | null;
  readonly tileCount: 3 | 4;
  readonly claimedFrom: Seat | null;
}

export interface PublicPlayerState {
  readonly seat: Seat;
  readonly seatWind: Wind;
  readonly concealedCount: number;
  readonly concealed: readonly Tile[] | null;
  readonly melds: readonly PublicMeld[];
  readonly bonuses: readonly Tile[];
  readonly score: number;
}

export type PublicPhase =
  | {
      readonly kind: "awaiting-discard";
      readonly seat: Seat;
      readonly source: AwaitingDiscardPhase["source"];
    }
  | {
      readonly kind: "awaiting-claims";
      readonly discarder: Seat;
      readonly pendingTile: Tile;
      /**
       * Whether the viewing seat still owes a response. The full responder list
       * stays inside the engine: it is derived from concealed hands, so telling
       * one seat that another *can* claim a tile would leak what that opponent
       * holds. RULE-REDACT-5
       */
      readonly youMayRespond: boolean;
    }
  | {
      readonly kind: "awaiting-rob";
      readonly declarer: Seat;
      readonly pendingTile: Tile;
      /** As above: a robbing responder is by definition waiting on this tile. */
      readonly youMayRespond: boolean;
    }
  | { readonly kind: "hand-ended"; readonly result: HandResult }
  | { readonly kind: "match-ended"; readonly result: HandResult };

export interface PublicGameState {
  readonly version: 1;
  readonly viewer: Seat;
  readonly config: RulesProfile;
  readonly handIndex: number;
  readonly dealer: Seat;
  readonly roundWind: Wind;
  readonly currentSeat: Seat | null;
  readonly players: readonly [
    PublicPlayerState,
    PublicPlayerState,
    PublicPlayerState,
    PublicPlayerState,
  ];
  readonly wallCount: number;
  readonly discards: readonly Discard[];
  readonly phase: PublicPhase;
}

export class IllegalActionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "IllegalActionError";
  }
}
