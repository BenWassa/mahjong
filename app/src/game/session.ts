import {
  DEFAULT_RULES_PROFILE,
  createHeuristicBot,
  newGame,
  type BotController,
  type GameAction,
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
}

type Listener = (snapshot: SessionSnapshot) => void;

const defaultSchedule = (run: () => void, ms: number): (() => void) => {
  const handle = setTimeout(run, ms);
  return () => { clearTimeout(handle); };
};

function playerActions(game: MahjongGame, seat: Seat): readonly GameAction[] {
  return game.legalActions(seat).filter((action) => action.type !== "continue");
}

export class GameSession {
  #game: MahjongGame;
  #lastAction: GameAction | null = null;
  #cancel: (() => void) | null = null;
  #listeners = new Set<Listener>();
  readonly #bots: ReadonlyMap<Seat, BotController>;
  readonly #schedule: (run: () => void, ms: number) => () => void;

  public constructor(options: SessionOptions) {
    const rules = options.rules ?? DEFAULT_RULES_PROFILE;
    this.#game = newGame(rules, options.seed);
    this.#schedule = options.schedule ?? defaultSchedule;
    this.#bots = new Map(
      BOT_SEATS.map((seat) => [
        seat,
        createHeuristicBot({ seat, seed: `${options.seed}:seat:${String(seat)}` }),
      ]),
    );
    this.#pump();
  }

  public snapshot(): SessionSnapshot {
    const pending = this.#pendingBotSeat();
    return {
      view: this.#game.state(PLAYER_SEAT),
      legalActions: playerActions(this.#game, PLAYER_SEAT),
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

  #emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }
}
