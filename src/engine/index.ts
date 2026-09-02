export {
  MahjongGame,
  ReplayMismatchError,
  newGame,
  newScenarioGame,
  replayGame,
} from "./adapter.js";
export { ScenarioSpecError, buildScenarioWall, createScenarioState } from "./scenario.js";
export type { ScenarioSpec } from "./scenario.js";
export type {
  BonusTileKind,
  Discard,
  FaanBreakdown,
  FaanItem,
  GameAction,
  GameRecord,
  HandResult,
  MatchLength,
  MinimumFaan,
  OrdinaryTileKind,
  PublicGameState,
  PublicMeld,
  PublicPlayerState,
  Meld,
  RulesProfile,
  Seat,
  Tile,
  TileId,
  TileKind,
  TileSetSize,
  WinSource,
  WinningStructure,
  Wind,
} from "./types.js";
export { DEFAULT_RULES_PROFILE, IllegalActionError } from "./types.js";
