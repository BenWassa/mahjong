import { reducePlayerActions, type ReducedActions } from "./interaction";
import {
  DEFAULT_RULES_PROFILE,
  createHeuristicBot,
  newGame,
  replayGame,
  type BotController,
  type GameAction,
  type GameRecord,
  type MahjongGame,
  type OrdinaryTileKind,
  type PublicGameState,
  type RulesProfile,
  type Seat,
} from "@engine";

/**
 * Drives one match: the engine, three bots, and the pacing between them.
 *
 * Kept outside React so the whole turn loop is testable without rendering, and
 * so a re-render can never advance the game. The player is always seat 0.
 *
 * The bots receive the same redacted projection the engine hands any seat.
 * Nothing here ever reads the internal state or the game record to decide a
 * bot move; that would be the cheating this project explicitly tests against.
 */

export const PLAYER_SEAT: Seat = 0;
const BOT_SEATS: readonly Seat[] = [1, 2, 3];

/**
 * Pacing. A bot move needs to be perceptible or the table appears to jump, but
 * every one of these fires dozens of times a hand, so they stay short. No
 * timer here ever gates one of the player's own legal actions: when the player
 * has something to do, the UI is live immediately and these delays apply only
 * to the opponents' moves.
 */
export const BOT_DISCARD_MS = 360;
export const BOT_RESPONSE_MS = 170;
/**
 * Delay before the session passes on the player's behalf in a claim window
 * whose every real option the interface has hidden (Beginner's reduced band).
 * Paced like a bot response so the offered tile is visibly on the table for a
 * beat, rather than the window blinking out of existence.
 */
export const AUTO_PASS_MS = BOT_RESPONSE_MS;

export interface SessionSnapshot {
  readonly view: PublicGameState;
  readonly legalActions: readonly GameAction[];
  /** True while an opponent is thinking, so the table can say whose turn it is. */
  readonly waitingOn: Seat | null;
  readonly lastAction: GameAction | null;
  /**
   * Assist-layer hints (#9), read from the player's own hand only. Tile kinds
   * that would complete it (empty except at a resting hand count), and
   * whether it already forms a legal winning shape structurally, independent
   * of the minimum-faan floor.
   */
  readonly waitingTiles: readonly OrdinaryTileKind[];
  readonly structurallyComplete: boolean;
}

export interface SessionOptions {
  readonly seed: string;
  readonly rules?: RulesProfile;
  /** Injected in tests to run the turn loop without real timers. */
  readonly schedule?: (run: () => void, ms: number) => () => void;
  /**
   * A previously persisted, still-in-progress record to resume from (#10).
   * Replayed through the engine's own seed-plus-actions reconstruction, so a
   * resumed table is byte-identical to the one that was interrupted. A record
   * that is already `completed`, or that fails to replay (corrupt or from an
   * incompatible engine version), is ignored in favour of a fresh game —
   * resuming must never be able to corrupt engine state.
   */
  readonly resumeFrom?: GameRecord;
  /**
   * Presentation-layer reduction of the player's own options (#Beginner mode).
   * It can only ever remove options; the engine remains the legality
   * authority, and anything it removes is still a legal move.
   *
   * It lives here rather than in the view for two reasons. The turn loop has
   * to answer a claim window whose every real option was hidden, and doing
   * that from a React effect would fire twice under StrictMode — the second
   * pass throwing IllegalActionError out of the tree. And every derived
   * layer (discardable tiles, the assist suggestion, concept detection) reads
   * `snapshot.legalActions`, so reducing once here keeps them all agreeing
   * with what the band actually offers.
   */
  readonly reduceActions?: (actions: readonly GameAction[]) => ReducedActions;
}

type Listener = (snapshot: SessionSnapshot) => void;

const defaultSchedule = (run: () => void, ms: number): (() => void) => {
  const handle = setTimeout(run, ms);
  return () => { clearTimeout(handle); };
};

function playerActions(game: MahjongGame, seat: Seat): readonly GameAction[] {
  return game.legalActions(seat).filter((action) => action.type !== "continue");
}

function resumeGame(record: GameRecord | undefined): MahjongGame | null {
  if (record === undefined || record.completed) return null;
  try {
    return replayGame(record);
  } catch {
    return null;
  }
}

export class GameSession {
  #game: MahjongGame;
  #lastAction: GameAction | null = null;
  #cancel: (() => void) | null = null;
  #listeners = new Set<Listener>();
  readonly #bots: ReadonlyMap<Seat, BotController>;
  readonly #schedule: (run: () => void, ms: number) => () => void;
  readonly #reduceActions: (actions: readonly GameAction[]) => ReducedActions;

  public constructor(options: SessionOptions) {
    const rules = options.rules ?? DEFAULT_RULES_PROFILE;
    this.#game = resumeGame(options.resumeFrom) ?? newGame(rules, options.seed);
    // Derived from the live game rather than options.seed, so a resumed table
    // seeds its bots from the record it actually resumed rather than from
    // whatever seed the caller happened to pass alongside it.
    const activeSeed = this.#game.gameRecord().seed;
    this.#schedule = options.schedule ?? defaultSchedule;
    this.#reduceActions =
      options.reduceActions ?? ((actions) => reducePlayerActions(actions, true));
    this.#bots = new Map(
      BOT_SEATS.map((seat) => [
        seat,
        createHeuristicBot({ seat, seed: `${activeSeed}:seat:${String(seat)}` }),
      ]),
    );
    this.#pump();
  }

  /** Trusted persistence record for the live table (#10). */
  public gameRecord(): GameRecord {
    return this.#game.gameRecord();
  }

  public snapshot(): SessionSnapshot {
    const pending = this.#pendingBotSeat();
    return {
      view: this.#game.state(PLAYER_SEAT),
      legalActions: this.#reduceActions(playerActions(this.#game, PLAYER_SEAT)).shown,
      waitingOn: pending,
      lastAction: this.#lastAction,
      waitingTiles: this.#game.waitingTiles(PLAYER_SEAT),
      structurallyComplete: this.#game.isStructurallyComplete(PLAYER_SEAT),
    };
  }

  public scoreBreakdown(): ReturnType<MahjongGame["scoreBreakdown"]> {
    return this.#game.scoreBreakdown();
  }

  public subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  /** Apply one of the player's own legal actions. Rejects anything else. */
  public act(action: GameAction): void {
    if (action.type !== "continue" && action.seat !== PLAYER_SEAT) {
      throw new Error("Only the player's own seat may be acted through the UI");
    }
    this.#apply(action);
  }

  /** Advance past an ended hand. Separate from act so the UI reads clearly. */
  public continue(): void {
    const step = this.#game
      .legalActions(PLAYER_SEAT)
      .find((action) => action.type === "continue");
    if (step !== undefined) this.#apply(step);
  }

  public dispose(): void {
    this.#cancel?.();
    this.#cancel = null;
    this.#listeners.clear();
  }

  #apply(action: GameAction): void {
    this.#cancel?.();
    this.#cancel = null;
    this.#game = this.#game.act(action);
    this.#lastAction = action;
    this.#pump();
    this.#emit();
  }

  /** The next opponent owing a move, if any. */
  #pendingBotSeat(): Seat | null {
    for (const seat of BOT_SEATS) {
      if (playerActions(this.#game, seat).length > 0) return seat;
    }
    return null;
  }

  /**
   * Schedules the next opponent move. Opponents are resolved one at a time in
   * seat order; the engine holds a claim window open until every responder has
   * answered, so a bot answering early can never close the player's window.
   */
  #pump(): void {
    if (this.#cancel !== null) return;
    if (this.#pumpAutoPass()) return;

    const seat = this.#pendingBotSeat();
    if (seat === null) return;

    const actions = playerActions(this.#game, seat);
    const isDiscard = actions.some((action) => action.type === "discard");
    const delay = isDiscard ? BOT_DISCARD_MS : BOT_RESPONSE_MS;

    this.#cancel = this.#schedule(() => {
      this.#cancel = null;
      const bot = this.#bots.get(seat);
      if (bot === undefined) return;
      const choice = bot.chooseAction(this.#game.state(seat), playerActions(this.#game, seat));
      this.#game = this.#game.act(choice);
      this.#lastAction = choice;
      this.#pump();
      this.#emit();
    }, delay);
  }

  /**
   * Answers a claim window on the player's behalf when the interface has
   * hidden every option it offered them except passing.
   *
   * The pass is applied like any other move and is recorded in the game
   * record. It must not be elided: `replayGame` reconstructs a resumed match
   * from the recorded action list, so a pass that happened but was not written
   * down would make the record fail to replay — which the persistence layer
   * treats as corruption and discards. Recording it also means a match played
   * in Beginner resumes correctly even if the player has since switched to the
   * standard table.
   */
  #pumpAutoPass(): boolean {
    const { autoPass } = this.#reduceActions(playerActions(this.#game, PLAYER_SEAT));
    if (autoPass === null) return false;

    this.#cancel = this.#schedule(() => {
      this.#cancel = null;
      this.#game = this.#game.act(autoPass);
      this.#lastAction = autoPass;
      this.#pump();
      this.#emit();
    }, AUTO_PASS_MS);
    return true;
  }

  #emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }
}
