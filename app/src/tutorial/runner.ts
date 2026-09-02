import {
  createHeuristicBot,
  newScenarioGame,
  type BotController,
  type GameAction,
  type MahjongGame,
  type PublicGameState,
  type Seat,
  type Tile,
  type TileId,
  type TileKind,
} from "@engine";

import type { ActStep, Lesson, LessonStep, ScriptedDiscard } from "./lessons";

/**
 * Drives one Learn to Play lesson (#30).
 *
 * The lesson is content; this is the mechanism, and it is deliberately the
 * same shape as `game/session.ts`: a plain class that owns the engine and the
 * pacing, with React subscribing to it, so a re-render can never advance a
 * lesson and the whole flow is testable without rendering.
 *
 * Three rules hold for every lesson:
 *
 * - **Every move is a real engine move.** The player's actions and the
 *   opponents' both go through `MahjongGame.act`, which is the production
 *   reducer. A lesson can say which tile an opponent discards; it cannot say
 *   that an illegal discard is allowed, and the engine rejects it if it tries.
 * - **A step may only ever remove options.** `step.offer` filters actions the
 *   engine has already declared legal, exactly as Beginner's claim band does
 *   (`game/interaction.ts`). Nothing here invents an action.
 * - **A wrong answer changes nothing.** The lesson checks the player's choice
 *   against the step's goal *before* applying it, so a mistake produces an
 *   explanation and another go rather than a game state nobody designed.
 */

export const TUTORIAL_SEAT: Seat = 0;
const OPPONENT_SEATS: readonly Seat[] = [1, 2, 3];

/**
 * Opponent pacing. Slower than the table's own 360ms: a tutorial opponent's
 * move is something to read rather than something to wait through, and #30
 * asks for readable bot pacing with no time pressure.
 */
export const TUTORIAL_MOVE_MS = 620;

export interface TutorialFeedback {
  readonly tone: "note" | "correction";
  readonly text: string;
}

export interface TutorialSnapshot {
  readonly lessonId: Lesson["id"];
  readonly title: string;
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly step: LessonStep;
  /** The ordinary redacted projection. Opponents' hands are not in here. */
  readonly view: PublicGameState;
  /** Legal actions, reduced to what this step offers. Never widened. */
  readonly legalActions: readonly GameAction[];
  /**
   * Tutorial-only visibility (#30): the seats this lesson is teaching with
   * their hands face up, and the tiles they hold.
   *
   * Deliberately not merged into `view`. A doctored `PublicGameState` carrying
   * opponents' tiles could be passed to a bot by accident; a separate map
   * cannot, because `BotController.chooseAction` takes a `PublicGameState` and
   * this is not one.
   */
  readonly openHands: ReadonlyMap<Seat, readonly Tile[]>;
  /** Tiles the player has correctly pointed at during an identify step. */
  readonly identified: readonly TileId[];
  readonly feedback: TutorialFeedback | null;
  /** True once the player has satisfied the current step and may continue. */
  readonly stepSatisfied: boolean;
  /** The opponent the lesson is waiting on, so the coach can say so. */
  readonly waitingOn: Seat | null;
  /**
   * True while the lesson is deliberately held still — Peek is open over the
   * table. The engine state is untouched; only the pacing is stopped.
   */
  readonly paused: boolean;
  readonly finished: boolean;
}

type Listener = (snapshot: TutorialSnapshot) => void;

export interface TutorialRunnerOptions {
  readonly lesson: Lesson;
  /** Injected in tests to run the lesson without real timers. */
  readonly schedule?: (run: () => void, ms: number) => () => void;
}

const defaultSchedule = (run: () => void, ms: number): (() => void) => {
  const handle = setTimeout(run, ms);
  return () => { clearTimeout(handle); };
};

function actionsFor(game: MahjongGame, seat: Seat): readonly GameAction[] {
  return game.legalActions(seat).filter((action) => action.type !== "continue");
}

export class TutorialRunner {
  readonly #lesson: Lesson;
  readonly #schedule: (run: () => void, ms: number) => () => void;
  readonly #bots: ReadonlyMap<Seat, BotController>;
  readonly #listeners = new Set<Listener>();

  #game: MahjongGame;
  #stepIndex = 0;
  #identified: TileId[] = [];
  #feedback: TutorialFeedback | null = null;
  #satisfied = false;
  #finished = false;
  #paused = false;
  #script: readonly ScriptedDiscard[];
  #cancel: (() => void) | null = null;

  public constructor(options: TutorialRunnerOptions) {
    this.#lesson = options.lesson;
    this.#schedule = options.schedule ?? defaultSchedule;
    this.#game = newScenarioGame(options.lesson.scenario);
    this.#script = [...(options.lesson.script ?? [])];
    this.#bots = new Map(
      OPPONENT_SEATS.map((seat) => [
        seat,
        createHeuristicBot({
          seat,
          seed: `${options.lesson.scenario.id}:seat:${String(seat)}`,
        }),
      ]),
    );
    this.#pump();
  }

  public snapshot(): TutorialSnapshot {
    const step = this.#currentStep();
    return {
      lessonId: this.#lesson.id,
      title: this.#lesson.title,
      stepIndex: this.#stepIndex,
      stepCount: this.#lesson.steps.length,
      step,
      view: this.#game.state(TUTORIAL_SEAT),
      legalActions: this.#offeredActions(step),
      openHands: this.#openHands(),
      identified: [...this.#identified],
      feedback: this.#feedback,
      stepSatisfied: this.#satisfied,
      waitingOn: this.#cancel === null ? null : this.#pendingOpponent(),
      paused: this.#paused,
      finished: this.#finished,
    };
  }

  /**
   * Holds the lesson still, or lets it go again.
   *
   * Peek opens a reading surface over the table, and an opponent moving
   * behind it would change the hands the player came here to read — worse, it
   * would do so silently, because the seat rails are underneath the overlay.
   * So the pacing stops and the position the player is looking at is the
   * position that is still there when they close it.
   *
   * This is pacing only. No engine state is saved, copied or restored: the
   * pending timer is cancelled and the pump is re-entered on resume, which
   * re-derives what is owed from the same game it was already holding.
   */
  public setPaused(paused: boolean): void {
    if (this.#paused === paused) return;
    this.#paused = paused;
    if (paused) {
      this.#cancel?.();
      this.#cancel = null;
    } else {
      this.#pump();
    }
    this.#emit();
  }

  public subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  public dispose(): void {
    this.#cancel?.();
    this.#cancel = null;
    this.#listeners.clear();
  }

  /**
   * The player pointing at a tile during an `identify` step.
   *
   * Nothing about the game moves here: this step is the one place #30 asks for
   * a static hand, and pointing at a Chow is not a move. It is still driven off
   * real dealt tiles rather than a picture of a hand.
   */
  public identify(tileId: TileId): void {
    const step = this.#currentStep();
    if (step.kind !== "identify" || this.#satisfied) return;
    const hand = this.#game.state(TUTORIAL_SEAT).players[TUTORIAL_SEAT].concealed ?? [];
    const tile = hand.find((candidate) => candidate.id === tileId);
    if (tile === undefined) return;

    const group = step.groups.find((kinds) => widen(kinds).includes(tile.kind));
    if (group === undefined) {
      this.#feedback = { tone: "correction", text: step.wrong };
      this.#emit();
      return;
    }
    const kinds = widen(group);
    this.#identified = hand
      .filter((candidate) => kinds.includes(candidate.kind))
      .map((candidate) => candidate.id)
      // A group names kinds, and a hand can hold more copies of a kind than the
      // group is about — a pung of 5 Dots alongside a fourth 5 Dots elsewhere.
      // Highlighting only as many tiles as the group has keeps the shape the
      // player just named the shape they see lit up.
      .slice(0, group.length);
    this.#satisfied = true;
    this.#feedback = { tone: "note", text: step.note };
    this.#emit();
  }

  /**
   * One of the player's own legal actions, offered by the current step.
   *
   * Checked against the step's goal before it is applied. A legal move that is
   * not what the step is teaching is answered with the step's correction and
   * left unplayed, so the player can try again against the same position.
   */
  public act(action: GameAction): void {
    const step = this.#currentStep();
    if (step.kind !== "act" || this.#satisfied) return;
    if (action.type !== "continue" && action.seat !== TUTORIAL_SEAT) {
      throw new Error("Only the player's own seat may be acted through the tutorial");
    }
    if (!this.#offeredActions(step).some((offered) => sameAction(offered, action))) return;

    const view = this.#game.state(TUTORIAL_SEAT);
    if (!step.goal(action, view)) {
      this.#feedback = { tone: "correction", text: correctionFor(step, action, view) };
      this.#emit();
      return;
    }

    this.#game = this.#game.act(action);
    this.#satisfied = true;
    this.#feedback = { tone: "note", text: step.note };
    this.#emit();
  }

  /** A `note` step, or the acknowledgement that ends any other step. */
  public advance(): void {
    const step = this.#currentStep();
    if (step.kind !== "note" && !this.#satisfied) return;

    if (this.#stepIndex >= this.#lesson.steps.length - 1) {
      this.#finished = true;
      this.#feedback = null;
      this.#emit();
      return;
    }
    this.#stepIndex += 1;
    this.#satisfied = false;
    this.#identified = [];
    this.#feedback = null;
    this.#pump();
    this.#emit();
  }

  #currentStep(): LessonStep {
    const step = this.#lesson.steps[this.#stepIndex];
    if (step === undefined) throw new Error(`Lesson ${this.#lesson.id} has no step to run`);
    return step;
  }

  /**
   * Tutorial-only visibility, taken straight from the engine's own named
   * hidden-information accessor and narrowed to the seats this lesson reveals.
   * A lesson that reveals nothing gets an empty map, which is what the last
   * lessons and the guided hand use.
   */
  #openHands(): ReadonlyMap<Seat, readonly Tile[]> {
    if (this.#lesson.reveal.length === 0) return new Map();
    const all = this.#game.openHandsForTutorial();
    return new Map(
      this.#lesson.reveal.map((seat) => [seat, all.get(seat) ?? []] as const),
    );
  }

  /**
   * The step's reduction of the player's legal actions.
   *
   * This can only remove. `offer` is a predicate over actions the engine has
   * already ruled legal, and everything it hides remains a legal move the
   * player is simply not being asked about yet.
   */
  #offeredActions(step: LessonStep): readonly GameAction[] {
    if (step.kind !== "act" || this.#satisfied) return [];
    const legal = actionsFor(this.#game, TUTORIAL_SEAT);
    const offer = step.offer;
    if (offer === undefined) return legal;
    return legal.filter((action) => offer(action, this.#game.state(TUTORIAL_SEAT)));
  }

  #pendingOpponent(): Seat | null {
    for (const seat of OPPONENT_SEATS) {
      if (actionsFor(this.#game, seat).length > 0) return seat;
    }
    return null;
  }

  /**
   * Runs the table up to the point where the lesson needs the player.
   *
   * A step that declares `until` has named the position it is about — the tile
   * that makes a Pung available, the turn coming back round — and the table
   * runs on until that holds and then stops dead, whatever else is on offer in
   * between. A step that names no position is simply waiting for the player,
   * so the pump stops the moment there is something for them and a step never
   * begins mid-move.
   */
  #pump(): void {
    this.#cancel?.();
    this.#cancel = null;
    if (this.#finished || this.#paused) return;

    const step = this.#currentStep();
    const view = this.#game.state(TUTORIAL_SEAT);
    // `null` when the step named no moment to travel to; otherwise whether the
    // table has reached the one it named.
    const arrived = step.until === undefined ? null : step.until(view);
    const playerLegal = actionsFor(this.#game, TUTORIAL_SEAT);

    if (playerLegal.length > 0) {
      const asking = step.kind === "act" && this.#offeredActions(step).length > 0;
      if (arrived !== false && (asking || step.kind !== "act")) return;
      // The player owes an answer this step is not asking them for — the
      // lesson is still travelling to its position, or the step narrowed the
      // window down to nothing. Pass for them.
      //
      // This is not a convenience. The engine holds a claim window open until
      // every responder answers, so one nobody answers stalls the table for
      // good; `GameSession` carries the same obligation for Beginner's reduced
      // claim band, for the same reason. Reaching it with `arrived === true`
      // means a step named a position and then offered nothing at it, which is
      // a lesson bug — passing keeps the table moving rather than freezing on
      // it.
      const pass = playerLegal.find((action) => action.type === "pass");
      if (pass === undefined) return;
      this.#cancel = this.#schedule(() => { this.#applyOpponent(pass); }, TUTORIAL_MOVE_MS);
      return;
    }

    // Nothing is owed to the player. A step that named a position stops on it;
    // one that did not runs the opponents on until there is.
    if (arrived === true) return;

    const seat = this.#pendingOpponent();
    if (seat === null) return;
    this.#cancel = this.#schedule(() => {
      this.#applyOpponent(this.#chooseOpponentAction(seat));
    }, TUTORIAL_MOVE_MS);
  }

  #applyOpponent(action: GameAction): void {
    this.#cancel = null;
    this.#game = this.#game.act(action);
    this.#pump();
    this.#emit();
  }

  /**
   * What an opponent does next.
   *
   * The lesson's script names only the discards it actually depends on — the
   * tile that makes a Pung available, the tile that completes the player's
   * hand. Everything else is the production heuristic bot, reading the same
   * redacted view it reads at a real table. A scripted discard is still played
   * through the engine and is rejected by it if it is not legal.
   */
  #chooseOpponentAction(seat: Seat): GameAction {
    const legal = actionsFor(this.#game, seat);
    const next = this.#script[0];
    if (next !== undefined && next.seat === seat) {
      const scripted = legal.find(
        (action) =>
          action.type === "discard" &&
          this.#tileKindOf(seat, action.tileId) === next.discard,
      );
      if (scripted !== undefined) {
        this.#script = this.#script.slice(1);
        return scripted;
      }
    }
    const bot = this.#bots.get(seat);
    const chosen = bot?.chooseAction(this.#game.state(seat), legal);
    if (chosen !== undefined) return chosen;
    const fallback = legal[0];
    if (fallback === undefined) throw new Error(`Seat ${String(seat)} owes no action`);
    return fallback;
  }

  #tileKindOf(seat: Seat, tileId: TileId): string | null {
    const tiles = this.#game.openHandsForTutorial().get(seat) ?? [];
    return tiles.find((tile) => tile.id === tileId)?.kind ?? null;
  }

  #emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }
}

/** Structural equality over the small, flat action union. */
function sameAction(left: GameAction, right: GameAction): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * A lesson names its shapes in ordinary kinds, because a flower is never part
 * of one; a tile in hand is typed as any kind. Widening here keeps the lesson
 * data precise without making every comparison a cast.
 */
function widen(kinds: readonly TileKind[]): readonly TileKind[] {
  return kinds;
}

/**
 * The step's answer to a legal move that was not the one being taught.
 *
 * A step may write one sentence for every wrong answer, or compose one from
 * the move itself — the discard lessons do the latter, because "that tile is
 * half of a run" and "that tile is half of your pair" are different lessons
 * and a single line covering both teaches neither.
 */
function correctionFor(
  step: ActStep,
  action: GameAction,
  view: PublicGameState,
): string {
  if (step.wrong === undefined) return "";
  return typeof step.wrong === "string" ? step.wrong : step.wrong(action, view);
}
