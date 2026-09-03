import { DEFAULT_RULES_PROFILE } from "@engine";
import type {
  GameAction,
  OrdinaryTileKind,
  PublicGameState,
  ScenarioSpec,
  Seat,
} from "@engine";

import type { LessonId } from "./ids";
import type { StepFocus } from "./targets";

/**
 * The five core lessons of Learn to Play (#30).
 *
 * Every lesson is a deterministic scenario — an arranged wall dealt through
 * the production deal (`src/engine/scenario.ts`) — plus a short sequence of
 * steps. The steps are the teaching; the engine is still the only authority on
 * what is legal, and `TutorialRunner` plays every move through it.
 *
 * The guiding rule, from the issue: **teach by changing the game state, not by
 * explaining the game state**. So a Pung is taught by putting two matching
 * tiles in the player's hand, having an opponent throw the third, and letting
 * them take it — the sentence explaining what a Pung is arrives afterwards,
 * about something they have already done.
 *
 * Scoring is deliberately almost absent. #30 puts faan, qualifying hands and
 * pattern recognition in a later Learn layer; these five cover shape, turns,
 * discards, claims and winning, and nothing else.
 *
 * All five run under the **standard** profile. A lesson taught at Beginner's
 * zero-faan floor would be teaching a simplified rule as if it were the game,
 * which #30 rules out; the one place the floor matters — declaring a win —
 * uses a hand that qualifies under the real minimum.
 */

export interface LessonStepBase {
  /** Stable within its lesson; used as a React key and in tests. */
  readonly id: string;
  /** The instruction while the step is live. Imperative, one or two sentences. */
  readonly prompt: string;
  /**
   * Runs the table on until this is true before the step's prompt applies.
   * Used by the steps that are about something an opponent does — the pump
   * stops the moment it holds, so the player reads the note against the
   * position it describes rather than three moves later.
   */
  readonly until?: (view: PublicGameState) => boolean;
  /**
   * The object this step is about, and the sentence to put beside it (#33).
   *
   * A step with no focus is a whole-table idea with no single target — "play
   * moves to your right", "nothing in this hand is scripted" — and belongs in
   * the coach strip. A step *with* a focus must never rely on the strip alone:
   * `ONBOARDING_DESIGN.md` §5.1 puts object-specific instruction next to its
   * object, and §5.6 says what happens when the phone has no room for it.
   */
  readonly focus?: StepFocus;
  /**
   * Progressively stronger cues for a learner who has stopped (§5.4), from
   * soft to explicit. Empty or absent means the prompt is the only cue.
   */
  readonly hints?: readonly string[];
  /**
   * True for a step whose subject is a private interface convention rather
   * than a judgement — tap once to lift, tap again to discard. There is
   * nothing to reason out, so the explicit cue is shown immediately instead of
   * making the player discover a convention nobody told them about.
   */
  readonly immediateHint?: boolean;
  /**
   * Holds the step open after it is satisfied, until the player continues.
   *
   * Onboarding steps otherwise advance themselves once the player has acted:
   * §5.3 rules out a Next press after every micro-step, and the consequence
   * note is a thing to read, not a thing to acknowledge. Set this where the
   * note genuinely needs to be sat with.
   */
  readonly hold?: boolean;
}

export interface NoteStep extends LessonStepBase {
  readonly kind: "note";
  /** Shown with the prompt; a note step is read, then acknowledged. */
  readonly note: string;
}

export interface IdentifyStep extends LessonStepBase {
  readonly kind: "identify";
  /**
   * The shapes that satisfy the step, each written as the tile kinds it is
   * made of — repeats included, so a pung names its kind three times and the
   * runner knows to light three tiles up.
   */
  readonly groups: readonly (readonly OrdinaryTileKind[])[];
  readonly note: string;
  readonly wrong: string;
}

export interface ActStep extends LessonStepBase {
  readonly kind: "act";
  /**
   * The move to perform on the player's behalf when they take the rescue
   * offered at the end of the hint ladder (§5.4). Absent where a step has no
   * single right answer, in which case no rescue is offered.
   *
   * Taking it is recorded and deliberately not counted as demonstrated
   * comprehension — §14.6 asks for rescue hints to be measured separately from
   * ordinary assistance for exactly this reason.
   */
  readonly rescue?: (
    view: PublicGameState,
    offered: readonly GameAction[],
  ) => GameAction | null;
  /**
   * Narrows what the interface offers to the decision being taught. It is a
   * filter over actions the engine has already declared legal and can only
   * ever remove one; everything it hides is still a legal move.
   */
  readonly offer?: (action: GameAction, view: PublicGameState) => boolean;
  /** The move the step is asking for. Checked before anything is applied. */
  readonly goal: (action: GameAction, view: PublicGameState) => boolean;
  readonly note: string;
  /** Answer to a legal move that is not the one being taught. */
  readonly wrong?: string | ((action: GameAction, view: PublicGameState) => string);
}

export type LessonStep = NoteStep | IdentifyStep | ActStep;

export interface ScriptedDiscard {
  readonly seat: Seat;
  readonly discard: OrdinaryTileKind;
}

export interface Lesson {
  /**
   * Widened from the five replayable lesson ids so the #33 first-run phases
   * can use the same runner. `LESSONS` below stays narrowly typed, so nothing
   * that records lesson progress lost its guarantee.
   */
  readonly id: string;
  readonly title: string;
  /** One line on the Learn menu. Says what the player will do, not what they will read. */
  readonly summary: string;
  readonly scenario: ScenarioSpec;
  /**
   * The seats revealed to the Peek overlay, for teaching only.
   *
   * The first four lessons open the table so the player can see why a claim
   * became available; the fifth closes it again and says so, which is the
   * progressive-hidden-information transition #30 asks for. This list only
   * ever reaches the tutorial's own view — see `TutorialRunner`'s `openHands`
   * for why it cannot leak into normal play or into a bot.
   */
  readonly reveal: readonly Seat[];
  /**
   * The opponent discards this lesson depends on, matched by seat and consumed
   * in order. Everything not named here is the production heuristic bot
   * playing off its own redacted view.
   */
  readonly script?: readonly ScriptedDiscard[];
  readonly steps: readonly LessonStep[];
}

const PROFILE = DEFAULT_RULES_PROFILE;

function isDiscardOf(action: GameAction, kind: OrdinaryTileKind, view: PublicGameState): boolean {
  if (action.type !== "discard") return false;
  const hand = view.players[view.viewer].concealed ?? [];
  return hand.some((tile) => tile.id === action.tileId && tile.kind === kind);
}

function discardKind(action: GameAction, view: PublicGameState): OrdinaryTileKind | null {
  if (action.type !== "discard") return null;
  const hand = view.players[view.viewer].concealed ?? [];
  const kind = hand.find((tile) => tile.id === action.tileId)?.kind;
  return kind === undefined ? null : (kind as OrdinaryTileKind);
}

/**
 * A free discard, minus the tiles a later step still needs.
 *
 * The claims lesson hands the player three real discard decisions, and every
 * one of them is genuinely theirs — but a player who throws away the three
 * Seven of Characters cannot then be shown a Kong. Reserving those tiles keeps
 * the lesson's own setup intact while leaving eight or more tiles to choose
 * between, and it reduces rather than adds: everything held back is still a
 * legal move the interface is simply not offering yet.
 */
function spareDiscard(
  action: GameAction,
  view: PublicGameState,
  reserved: readonly OrdinaryTileKind[],
): boolean {
  const kind = discardKind(action, view);
  return kind !== null && !reserved.includes(kind);
}

function discardedBy(view: PublicGameState, seat: Seat, kind: OrdinaryTileKind): boolean {
  return view.discards.some(
    (discard) => discard.seat === seat && discard.tile.kind === kind,
  );
}

/**
 * 1. Make a hand.
 *
 * The one deliberately static lesson. The player is dealt a hand that is
 * already finished, and names its parts by pointing at them — four sets and a
 * pair, seen whole, before anything moves. Every later lesson is about getting
 * to this shape, and none of them make sense without it.
 */
const SHAPE: CoreLesson = {
  id: "shape",
  title: "Four sets and a pair",
  summary: "See a finished hand and name the shapes it is made of.",
  reveal: [1, 2, 3],
  scenario: {
    id: "learn-shape",
    profile: PROFILE,
    dealer: 0,
    hands: [
      [
        "characters-6", "characters-7", "characters-8",
        "bamboo-2", "bamboo-3", "bamboo-4",
        "dots-5", "dots-5", "dots-5",
        "dots-7", "dots-8", "dots-9",
        "dragon-red", "dragon-red",
      ],
      [], [], [],
    ],
  },
  steps: [
    {
      kind: "note",
      id: "target",
      prompt: "This is your hand, at the bottom. The other three players sit around you.",
      note:
        "Every hand in mahjong is aiming at the same target: four sets of three, plus one pair. Yours is already there — this is what a finished hand looks like. The other three hold thirteen tiles each; Peek hands will show you theirs while these lessons are running, which a real game never does.",
    },
    {
      kind: "identify",
      id: "chow",
      prompt: "Tap any tile that is part of a run — three tiles of one suit, in order.",
      groups: [
        ["characters-6", "characters-7", "characters-8"],
        ["bamboo-2", "bamboo-3", "bamboo-4"],
        ["dots-7", "dots-8", "dots-9"],
      ],
      note:
        "That is a Chow 食 — three consecutive tiles of the same suit. You are holding three of them.",
      wrong:
        "Not a run. Look for three tiles of one suit whose numbers climb by one, like 6, 7, 8.",
    },
    {
      kind: "identify",
      id: "pung",
      prompt: "Now tap a tile in the set of three identical tiles.",
      groups: [["dots-5", "dots-5", "dots-5"]],
      note:
        "That is a Pung 碰 — three of exactly the same tile. All four of a kind is a Kong 槓, which still counts as one set and earns you a replacement tile.",
      wrong: "Those are not identical. Look for three tiles with the same face.",
    },
    {
      kind: "identify",
      id: "pair",
      prompt: "One group is left, and it has only two tiles in it. Tap it.",
      groups: [["dragon-red", "dragon-red"]],
      note:
        "That is your pair — the eyes 眼. Four sets and a pair, fourteen tiles, and the hand is complete.",
    wrong: "That tile belongs to a set of three. The pair is the only group of two.",
    },
    {
      kind: "note",
      id: "done",
      prompt: "That is the whole target.",
      note:
        "You will build it out of tiles you draw and tiles you take from other players. Next: how a turn works.",
    },
  ],
};

/**
 * 2. Take a turn.
 *
 * Draw one, throw one, and watch it go round. The player's own discard is a
 * real engine discard, and the three opponent turns that follow are real
 * turns — this is the first time the table moves under them.
 */
const TURN: CoreLesson = {
  id: "turn",
  title: "Taking a turn",
  summary: "Draw a tile, choose a discard, and watch the table come round to you.",
  reveal: [1, 2, 3],
  scenario: {
    id: "learn-turn",
    profile: PROFILE,
    dealer: 0,
    hands: [
      [
        "characters-1", "characters-2", "characters-3",
        "bamboo-5", "bamboo-6", "bamboo-7",
        "dots-3", "dots-4", "dots-5",
        "dragon-red", "dragon-red",
        "dots-9", "wind-north",
        "wind-west",
      ],
      ["wind-north"],
      ["wind-north"],
      ["wind-north"],
    ],
    draws: ["wind-south", "wind-south", "wind-south", "characters-9"],
  },
  script: [
    { seat: 1, discard: "wind-north" },
    { seat: 2, discard: "wind-north" },
    { seat: 3, discard: "wind-north" },
  ],
  steps: [
    {
      kind: "note",
      id: "fourteen",
      prompt: "You are East, and East starts.",
      note:
        "You are holding fourteen tiles: your thirteen, plus one you have just drawn. A turn is always the same two things — take a tile, then throw one away. You always end a turn holding thirteen.",
    },
    {
      kind: "act",
      id: "first-discard",
      prompt:
        "You drew the West Wind, and nothing in your hand builds with it. Tap it once to lift it, then tap it again to throw it.",
      offer: (action, view) => isDiscardOf(action, "wind-west", view),
      goal: (action, view) => isDiscardOf(action, "wind-west", view),
      note:
        "That is a discard. It lands face up in the middle where everyone can see it — which also means anyone at the table may be able to claim it.",
    },
    {
      kind: "note",
      id: "around",
      prompt: "Now watch the other three take their turns.",
      until: (view) => view.currentSeat === 0 && view.discards.length >= 4,
      note:
        "Play moves to your right, one seat at a time: each player draws a tile and throws one away. When it comes back to you, you draw again — that has just happened.",
    },
    {
      kind: "act",
      id: "second-discard",
      prompt:
        "You have drawn the Nine of Characters. It builds with nothing either — throw it.",
      offer: (action, view) => isDiscardOf(action, "characters-9", view),
      goal: (action, view) => isDiscardOf(action, "characters-9", view),
      note:
        "That is the whole loop: draw one, discard one, round and round, until somebody completes a hand or the wall runs out.",
    },
  ],
};

/**
 * 3. Improve your hand.
 *
 * Three discards where the tiles are chosen so one answer is clearly better,
 * and the wrong answers each get the reason they are wrong. The vocabulary is
 * avoided on purpose — the player learns that a hand has a distance left to
 * run without being handed the word "shanten" to carry.
 */
const IMPROVE: CoreLesson = {
  id: "improve",
  title: "Choosing what to throw",
  summary: "Three discards where one choice moves you forward and the others do not.",
  reveal: [1, 2, 3],
  scenario: {
    id: "learn-improve",
    profile: PROFILE,
    dealer: 0,
    hands: [
      [
        "characters-3", "characters-4", "characters-5",
        "bamboo-7", "bamboo-8",
        "dots-2", "dots-3", "dots-4",
        "dots-6", "dots-7",
        "wind-east", "wind-east",
        "dragon-green",
        "characters-9",
      ],
      ["wind-north", "wind-west"],
      ["wind-north", "wind-west"],
      ["wind-north", "wind-west"],
    ],
    draws: [
      "wind-south", "wind-south", "wind-south", "bamboo-6",
      "dragon-white", "dragon-white", "dragon-white", "dots-1",
    ],
  },
  script: [
    { seat: 1, discard: "wind-north" },
    { seat: 2, discard: "wind-north" },
    { seat: 3, discard: "wind-north" },
    { seat: 1, discard: "wind-west" },
    { seat: 2, discard: "wind-west" },
    { seat: 3, discard: "wind-west" },
  ],
  steps: [
    {
      kind: "note",
      id: "read",
      prompt: "Read your hand before you throw anything.",
      note:
        "You have two finished runs — 3·4·5 of Characters and 2·3·4 of Dots — a pair of East Winds, and two half-finished runs waiting on one tile each. Everything else is spare.",
    },
    {
      kind: "act",
      id: "lonely",
      prompt: "Three tiles are offered. Throw the one that is doing the least for you.",
      offer: (action, view) => {
        const kind = discardKind(action, view);
        return kind === "characters-9" || kind === "bamboo-7" || kind === "wind-east";
      },
      goal: (action, view) => isDiscardOf(action, "characters-9", view),
      note:
        "The Nine of Characters had nothing beside it — no copy, and no neighbour to build a run with. A tile with nothing around it is the cheapest thing you own.",
      wrong: (action, view) =>
        discardKind(action, view) === "bamboo-7"
          ? "The Seven and Eight of Bamboo are one tile from a run: a Six or a Nine finishes it. Breaking that up costs you a set. Look for the tile with nothing beside it."
          : "That East Wind is half of your pair — and you are East, in the East round, so a set of them would be worth double. Look for the tile with nothing beside it.",
    },
    {
      kind: "note",
      id: "drew",
      prompt: "The table comes round, and you draw the Six of Bamboo.",
      until: (view) => view.currentSeat === 0 && view.discards.length >= 4,
      note:
        "That finishes your Bamboo run: 6·7·8. Three sets down, one to go — and you are holding one tile too many again.",
    },
    {
      kind: "act",
      id: "single-honour",
      prompt: "Same question. Which of these three should go?",
      offer: (action, view) => {
        const kind = discardKind(action, view);
        return kind === "dragon-green" || kind === "dots-6" || kind === "wind-east";
      },
      goal: (action, view) => isDiscardOf(action, "dragon-green", view),
      note:
        "A single Green Dragon can only ever become a set if you draw two more of it, and there are just three left in the game. The tiles beside your runs are far likelier to arrive.",
      wrong: (action, view) =>
        discardKind(action, view) === "dots-6"
          ? "Six and Seven of Dots need only a Five or an Eight to finish. There are eight tiles in the wall that would do it. Throw something with worse odds."
          : "You would be breaking your pair, and a hand needs one. Throw something that is on its own instead.",
    },
    {
      kind: "note",
      id: "close",
      prompt: "Round it goes again, and you draw the One of Dots.",
      until: (view) => view.currentSeat === 0 && view.discards.length >= 8,
      note:
        "Nothing useful. But look at what you are holding: three finished sets, a pair of East Winds, and 6·7 of Dots. One tile — a Five or an Eight of Dots — and the hand is done.",
    },
    {
      kind: "act",
      id: "final",
      prompt: "Throw the One of Dots and leave yourself one tile from a finished hand.",
      offer: (action, view) => isDiscardOf(action, "dots-1", view),
      goal: (action, view) => isDiscardOf(action, "dots-1", view),
      note:
        "That is the whole idea of a discard: every one of them should leave you closer than you were. You are now waiting on two tiles, and either of them wins the hand.",
    },
  ],
};

/**
 * 4. Claim tiles.
 *
 * Each claim is set up by putting the tiles in the player's hand and having an
 * opponent throw the one that completes the shape — including the one that
 * proves the Chow restriction by *not* being claimable. Every one of those
 * decisions is readable from public information alone; the revealed hands
 * behind Peek explain what the opponents were doing, and are never the
 * evidence a claim depends on (§8.1).
 */
/** The tiles the claims lesson's own later steps are built on. */
const CLAIMS_RESERVED: readonly OrdinaryTileKind[] = [
  "characters-7",
  "wind-west",
  "bamboo-4",
  "bamboo-5",
];

const CLAIMS: CoreLesson = {
  id: "claims",
  title: "Taking other players' tiles",
  summary: "Pung, Chow, Kong and pass — each on a tile thrown in front of you.",
  reveal: [1, 2, 3],
  scenario: {
    id: "learn-claims",
    profile: PROFILE,
    dealer: 1,
    hands: [
      [
        "dots-3", "dots-3",
        "bamboo-4", "bamboo-5",
        "characters-7", "characters-7", "characters-7",
        "wind-west", "wind-west",
        "dots-8", "dots-9", "bamboo-1", "dragon-white",
      ],
      ["dots-3", "bamboo-6"],
      ["characters-7", "wind-west"],
      ["bamboo-3"],
    ],
  },
  script: [
    { seat: 1, discard: "dots-3" },
    { seat: 1, discard: "bamboo-6" },
    { seat: 3, discard: "bamboo-3" },
    { seat: 2, discard: "characters-7" },
    { seat: 2, discard: "wind-west" },
  ],
  steps: [
    {
      kind: "note",
      id: "open",
      prompt: "This hand you are North, and the player on your right deals.",
      note:
        "When somebody throws a tile away, you may be able to take it — even when it is not your turn. Everything you need is public: your own tiles and the tile in the middle. Peek hands is there if you want to see what the others were holding.",
    },
    {
      kind: "act",
      id: "pung",
      prompt:
        "The player on your right has thrown a Three of Dots, and you are holding two. Tap Pung 碰 to take it.",
      goal: (action) => action.type === "claim-pung",
      note:
        "That is a Pung. The three tiles are now face up in front of you: a set nobody can break, in exchange for everybody knowing you have it.",
      wrong:
        "Passing lets it go. You are holding two Three of Dots and the third has just been thrown — taking it turns them into a finished set.",
    },
    {
      kind: "act",
      id: "pung-discard",
      prompt: "Claiming does not end your turn. Throw one tile away, as usual.",
      offer: (action, view) => spareDiscard(action, view, CLAIMS_RESERVED),
      goal: (action) => action.type === "discard",
      note:
        "Whenever you claim a tile you take your turn there and then — no draw, just a discard. Play carries on from you, so the players between you and the thrower lose their turn.",
    },
    {
      kind: "note",
      id: "no-chow",
      prompt: "Look at the middle: a Six of Bamboo, thrown by the player on your right.",
      until: (view) => discardedBy(view, 1, "bamboo-6"),
      note:
        "You are holding Four and Five of Bamboo, so that Six would finish a run — and no Chow was offered. A run can only be claimed from the player to your left, because you are the next to play anyway. Any other seat, and it is simply gone.",
    },
    {
      kind: "act",
      id: "chow",
      prompt:
        "Now the player on your left has thrown a Three of Bamboo, and you hold Four and Five. Tap Chow 食.",
      until: (view) => discardedBy(view, 3, "bamboo-3"),
      goal: (action) => action.type === "claim-chow",
      note:
        "That is a Chow 食 — a run of three, taken from the one seat you are allowed to take runs from.",
      wrong:
        "This is the seat you can Chow from — the player on your left. Take it, and see what an exposed run looks like.",
    },
    {
      kind: "act",
      id: "chow-discard",
      prompt: "Throw one away again.",
      offer: (action, view) => spareDiscard(action, view, CLAIMS_RESERVED),
      goal: (action) => action.type === "discard",
      note: "Two sets down, both face up on the table.",
    },
    {
      kind: "act",
      id: "kong",
      prompt:
        "A fourth Seven of Characters has just been thrown, and you hold the other three. That is a Kong 槓 — tap it.",
      until: (view) => discardedBy(view, 2, "characters-7"),
      goal: (action) => action.type === "claim-kong",
      note:
        "A Kong is all four of a kind. It still counts as one set, so it leaves you a tile short — which is why taking one earns you a replacement tile from the far end of the wall.",
      wrong:
        "Pung would take only three of them and leave the fourth stranded. Tap Kong 槓 instead, and see what taking all four does.",
    },
    {
      kind: "act",
      id: "kong-discard",
      prompt: "You have your replacement tile. Discard.",
      offer: (action, view) => spareDiscard(action, view, CLAIMS_RESERVED),
      goal: (action) => action.type === "discard",
      note: "Three sets, all exposed. One more and a pair, and the hand is finished.",
    },
    {
      kind: "act",
      id: "pass",
      prompt:
        "A West Wind, and you hold two — so Pung is offered. This time, tap Pass 過.",
      until: (view) => discardedBy(view, 2, "wind-west"),
      offer: (action) => action.type === "claim-pung" || action.type === "pass",
      goal: (action) => action.type === "pass",
      note:
        "You are never obliged to claim. West is neither your seat wind nor the round wind, so a set of them scores nothing extra — and every claim spends tiles and shows the table part of your hand. Sometimes the trade is not worth it.",
      wrong:
        "Pung is legal here, and that is the point: legal is not the same as worth it. Take the offer to leave it — tap Pass 過.",
    },
  ],
};

/**
 * 5. Win.
 *
 * Also where the revealed hands go. Peek is unavailable from the first move,
 * with the change named out loud, so the player's last lesson is played under
 * exactly the conditions the real game is played under.
 *
 * The winning hand is built around a Red Dragon pung, which is worth one faan
 * on its own. That is deliberate: it clears the standard minimum, so nothing
 * here teaches Beginner's zero-faan floor as though it were the rule.
 */
const WIN: CoreLesson = {
  id: "win",
  title: "Declaring a win",
  summary: "Spot the tile that finishes your hand, and call it.",
  reveal: [],
  scenario: {
    id: "learn-win",
    profile: PROFILE,
    dealer: 1,
    hands: [
      [
        "dragon-red", "dragon-red", "dragon-red",
        "bamboo-2", "bamboo-3", "bamboo-4",
        "characters-5", "characters-6", "characters-7",
        "dots-2", "dots-3", "dots-4",
        "dots-8",
      ],
      ["wind-north", "dots-8"],
      [],
      [],
    ],
    // The dealer opens by discarding from its fourteen without drawing, so the
    // next three draws belong to seats 2, 3 and the player in that order.
    draws: ["wind-south", "wind-south", "characters-1"],
  },
  script: [
    { seat: 1, discard: "wind-north" },
    { seat: 1, discard: "dots-8" },
  ],
  steps: [
    {
      kind: "note",
      id: "closed",
      prompt: "You cannot look at the other three hands from here on.",
      note:
        "That is how a real game looks: you know your own tiles, everything anybody has thrown away, and nothing else. The other hands were only ever available so the last four lessons could explain themselves.",
    },
    {
      kind: "note",
      id: "one-away",
      prompt: "Read your own hand.",
      note:
        "Three Red Dragons, three finished runs, and a single Eight of Dots. One more Eight of Dots would make it your pair — and that would be four sets and a pair.",
    },
    {
      kind: "act",
      id: "wait",
      prompt: "You have drawn a One of Characters, which does not help. Throw it back.",
      until: (view) => view.currentSeat === 0,
      offer: (action, view) => isDiscardOf(action, "characters-1", view),
      goal: (action, view) => isDiscardOf(action, "characters-1", view),
      note:
        "Now you wait. A hand one tile from finished is the whole point of every discard you have made.",
    },
    {
      kind: "act",
      id: "declare",
      prompt: "Look at what was just thrown. Tap Win 糊.",
      goal: (action) => action.type === "win",
      note:
        "That is a win. Hong Kong Old Style asks a hand to be worth at least one faan before you may declare it — a set of Red Dragons is worth one on its own, so yours qualifies.",
      wrong:
        "That is the tile you were waiting for. Your hand is complete: three Red Dragons, three runs, and now a pair of Eight of Dots. Tap Win 糊.",
    },
    {
      kind: "note",
      id: "finished",
      prompt: "That is the game.",
      note:
        "Build four sets and a pair, take a tile and throw a tile, claim what helps you, and declare when you get there. Everything else — what a hand is worth, when to defend — you can pick up while playing.",
    },
  ],
};

export type CoreLesson = Lesson & { readonly id: LessonId };

export const LESSONS: readonly CoreLesson[] = [SHAPE, TURN, IMPROVE, CLAIMS, WIN];

export function lessonById(id: LessonId): CoreLesson {
  const lesson = LESSONS.find((candidate) => candidate.id === id);
  if (lesson === undefined) throw new Error(`Unknown lesson ${id}`);
  return lesson;
}
