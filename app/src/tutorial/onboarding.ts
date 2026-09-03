import { DEFAULT_RULES_PROFILE } from "@engine";
import type { GameAction, OrdinaryTileKind, PublicGameState } from "@engine";

import type { OnboardingPath } from "../game/experience";
import type { Lesson } from "./lessons";
import { handTiles, teachSelector, claimSelector } from "./targets";

/**
 * The first run (#33), as data.
 *
 * `ONBOARDING_DESIGN.md` §6 and §10 specify these; this is that specification
 * turned into scenarios. Everything structural about them is the #30 runner,
 * unchanged — an arranged wall dealt through the production deal, every move
 * played through the production engine, a step that can only ever *remove*
 * legal options, and a wrong answer that leaves the position exactly where it
 * was. #33 is a teaching-architecture correction, not a second game engine.
 *
 * What is new is the shape of the sequence:
 *
 * - it is **linear**. No lesson picker, no returning to a menu between
 *   phases, and no graduation screen. A novice has no schema with which to
 *   choose between "four sets and a pair" and "taking other players' tiles",
 *   and being sent back to a list after every phase turns continuity into
 *   administration (§4.3 of the research);
 * - every object-specific instruction is **tethered to its object** through
 *   `focus`, rather than being a sentence in a strip above a dense table that
 *   the learner then has to search (§5.1, and Mayer's spatial-contiguity
 *   result behind it);
 * - **nothing is revealed that a real player could not see.** Every `reveal`
 *   here is empty, so the first claim is taught from the player's own tiles
 *   plus the public discard — which is the information model they will
 *   actually play with. Peek does not appear on this path at all (§8.1);
 * - terminology **follows** the thing it names. The word Pung arrives after
 *   the player has made one (§9);
 * - it ends by dealing the next hand on the same table rather than by
 *   announcing that teaching is over (§6, N5).
 *
 * The pacing targets in §6 are design targets, not claims. Whether a novice
 * actually arrives at the intended understanding is a question only the human
 * gate in §14 can answer, and no test in this repository should be read as
 * having answered it.
 */

/**
 * All phases run under the **standard** profile, including the novice path
 * that graduates to Beginner.
 *
 * Teaching at Beginner's zero-faan floor would teach a simplification as
 * though it were the game — the same reason #30 gave — so the one moment the
 * floor could matter, declaring a win, uses a hand that clears the real
 * minimum on its own.
 */
const PROFILE = DEFAULT_RULES_PROFILE;

export type OnboardingPhaseId =
  | "table"
  | "claim"
  | "win"
  | "refresh";

export interface OnboardingPhase extends Lesson {
  readonly id: OnboardingPhaseId;
}

function handKind(action: GameAction, view: PublicGameState): OrdinaryTileKind | null {
  if (action.type !== "discard") return null;
  const hand = view.players[view.viewer].concealed ?? [];
  const kind = hand.find((tile) => tile.id === action.tileId)?.kind;
  return kind === undefined ? null : (kind as OrdinaryTileKind);
}

function isDiscardOf(action: GameAction, kind: OrdinaryTileKind, view: PublicGameState): boolean {
  return handKind(action, view) === kind;
}

/** The first legal discard of `kind`, for a step's rescue. */
function discardRescue(kind: OrdinaryTileKind) {
  return (view: PublicGameState): GameAction | null => {
    const hand = view.players[view.viewer].concealed ?? [];
    const tile = hand.find((candidate) => candidate.kind === kind);
    return tile === undefined ? null : { type: "discard", seat: view.viewer, tileId: tile.id };
  };
}

function discardCount(view: PublicGameState): number {
  return view.discards.length;
}

/* ==========================================================================
   Phase 1 — "Your table": N0, N1 and N2 in one continuous hand
   ==========================================================================

   §6 splits these into three phases for the purposes of naming their learning
   objectives. They are one *scenario* because they are one hand: orientation,
   watching the table come round, and taking an unaided turn are consecutive
   turns of the same game, and cutting between three arranged walls to teach
   them would make the loop look like three unrelated exercises rather than the
   thing that repeats.

   The dealt hand is arranged exactly as §6 asks: two finished groups, a pair,
   one group a tile short, and clearly spare tiles — with the dealer's
   fourteenth tile being the one that completes the short group, so the first
   thing the learner ever sees a draw do is improve their hand.

   It also leaves *two* spare tiles standing after the taught discard. That is
   what makes N2 a real decision rather than a second guided one: the learner
   ends the phase choosing between three defensible throws with nothing
   pointing at the answer. */
const TABLE: OnboardingPhase = {
  id: "table",
  title: "Your table",
  summary: "Read your hand, see what a draw is for, and throw your first tile.",
  reveal: [],
  scenario: {
    id: "onboard-table",
    profile: PROFILE,
    dealer: 0,
    hands: [
      [
        "characters-2", "characters-3", "characters-4",
        "dots-6", "dots-7", "dots-8",
        "dragon-red", "dragon-red",
        "bamboo-5", "bamboo-6",
        "wind-north", "wind-west", "dots-2",
        // The dealer's fourteenth tile: what the opening phase reports as
        // just drawn, and the tile the first beat is about.
        "bamboo-7",
      ],
      [], [], [],
    ],
    // Three harmless honours for the opponents' turns, then the learner's own
    // draw. Deliberately three *different* tiles: three copies of one kind
    // going through the discard pile invites a bot to Pung its neighbour and
    // skip the seat the learner is being shown.
    draws: ["wind-south", "wind-west", "dragon-green", "characters-9"],
  },
  script: [
    { seat: 1, discard: "wind-south" },
    { seat: 2, discard: "wind-west" },
    { seat: 3, discard: "dragon-green" },
  ],
  steps: [
    {
      kind: "note",
      id: "your-hand",
      prompt: "This row along the bottom is your hand. Nobody else can see it.",
      focus: {
        targets: () => [teachSelector("hand")],
        callout: "Your tiles. You are building four groups of three, plus one pair.",
      },
      note:
        "You already have two finished groups and a pair. Everything in mahjong is aimed at that same shape: four groups and a pair.",
    },
    {
      kind: "note",
      id: "the-draw",
      prompt: "One of those tiles has just been drawn.",
      focus: {
        targets: (view) => handTiles(view, ["bamboo-5", "bamboo-6", "bamboo-7"]),
        callout: "The tile you just drew finishes this group. Worth keeping.",
      },
      note:
        "That is what a draw is for. Every turn hands you one more tile, and you keep it if it builds towards four groups and a pair.",
    },
    {
      kind: "act",
      id: "first-discard",
      prompt:
        "You are holding one tile too many. Tap the North Wind once to lift it, then tap it again to throw it.",
      // §5.4: the subject here is a private interface convention, not a
      // judgement. There is nothing to work out, so the explicit cue is
      // there from the first moment rather than after ten seconds of a
      // novice wondering why one tap did nothing.
      immediateHint: true,
      focus: {
        targets: (view) => handTiles(view, ["wind-north"]),
        callout: "Tap this one. Then tap it again to throw it.",
      },
      hints: [
        "Tap the lit tile once — it lifts. Tap the same tile again and it goes.",
        "Two taps on the same tile: the first lifts it, the second throws it.",
      ],
      offer: (action, view) => isDiscardOf(action, "wind-north", view),
      goal: (action, view) => isDiscardOf(action, "wind-north", view),
      rescue: discardRescue("wind-north"),
      note:
        "That is the whole loop: draw one, keep what builds your hand, throw one away.",
      hold: true,
    },
    {
      kind: "note",
      id: "the-middle",
      prompt: "Your tile went to the middle of the table.",
      focus: {
        targets: () => [teachSelector("discard-well")],
        callout: "Thrown tiles stay here, face up. Everyone can see them.",
      },
      note:
        "This is the only part of anyone's hand you ever get to see. Yours is public now too.",
    },
    {
      kind: "note",
      id: "the-others",
      prompt: "Now the other three take their turns.",
      // Runs the table on until all three opponents have thrown, so the
      // learner watches the cycle happen underneath the sentence describing
      // it rather than reading about it and then being asked to imagine it.
      until: (view) => discardCount(view) >= 4,
      focus: {
        targets: () => [
          teachSelector("seat-right"),
          teachSelector("seat-across"),
          teachSelector("seat-left"),
        ],
        callout: "Three opponents. Play moves to your right and comes back to you.",
      },
      note:
        "Each of them draws a tile and throws one away, exactly as you did. Their own tiles stay hidden — you only ever see what they throw.",
    },
    {
      kind: "act",
      id: "your-turn",
      prompt:
        "Your turn again, and you have drawn a Nine of Characters. Keep what builds your groups; throw whatever helps least.",
      until: (view) => view.currentSeat === 0 && discardCount(view) >= 4,
      focus: {
        targets: () => [teachSelector("hand")],
        callout: "Your call this time. Which tile is doing the least for you?",
      },
      hints: [
        "Look for tiles with nothing beside them — no matching tile, no neighbouring number.",
        "The Nine of Characters, the West Wind and the Two of Dots are each on their own. Any of them is a fair throw.",
      ],
      /*
       * §6 N2, as amended after implementation review: the goal is **tolerant,
       * not exact**. This step is testing whether the learner reasons about
       * their hand, so every throw that does not damage it is accepted — the
       * three lone tiles, not one designated answer. Refusing a defensible
       * discard because it was not the tile written down here would teach
       * exactly the behaviour §14.9 lists as a critical failure sign: hunting
       * for the highlighted answer instead of reading the hand.
       */
      goal: (action, view) => {
        const kind = handKind(action, view);
        return kind === "characters-9" || kind === "wind-west" || kind === "dots-2";
      },
      rescue: discardRescue("characters-9"),
      wrong: (action, view) => {
        const kind = handKind(action, view);
        if (kind === "dragon-red") {
          return "Those two Red Dragons are your pair, and a finished hand needs one. Throw a tile that has nothing beside it instead.";
        }
        return "That tile is part of a group you have already finished — throwing it breaks the group up. Look for a tile standing on its own.";
      },
      note:
        "Good. That is a normal turn, and it is most of the game: draw one, decide, throw one.",
    },
  ],
};

/* ==========================================================================
   Phase 2 — the first claim
   ==========================================================================

   Taught entirely from public information: the learner's own two matching
   tiles and the tile an opponent has just thrown. No hand is revealed, because
   a real player cannot inspect one, and a first run that leaned on Peek would
   be teaching a decision procedure the game does not support (§8.1).

   Pung only. Chow's source-seat restriction and Kong's replacement draw are
   deliberately not in the mandatory spine (§6, N3) — they are two more rules
   to hold before the learner has used a single claim, and they arrive
   contextually or in the replayable lessons instead.

   The phase ends on a Pass, because "you may" and "you should" are different
   lessons and a learner who has only ever been told to take a claim has been
   taught the first as though it were the second. */
const CLAIM_RESERVED: readonly OrdinaryTileKind[] = ["wind-west", "dots-3"];

const CLAIM: OnboardingPhase = {
  id: "claim",
  title: "Taking a thrown tile",
  summary: "Turn somebody else's discard into a finished group.",
  reveal: [],
  scenario: {
    id: "onboard-claim",
    profile: PROFILE,
    dealer: 1,
    hands: [
      [
        "dots-3", "dots-3",
        "characters-2", "characters-3", "characters-4",
        "bamboo-6", "bamboo-7", "bamboo-8",
        "dragon-red", "dragon-red",
        "wind-west", "wind-west",
        "dots-9",
      ],
      ["dots-3", "wind-west"],
      [], [],
    ],
  },
  script: [
    { seat: 1, discard: "dots-3" },
    { seat: 1, discard: "wind-west" },
  ],
  steps: [
    {
      kind: "act",
      id: "pung",
      prompt: "A Three of Dots has just been thrown, and you are holding two.",
      until: (view) => view.discards.some((discard) => discard.tile.kind === "dots-3"),
      focus: {
        targets: (view) => [
          teachSelector("offer"),
          ...handTiles(view, ["dots-3"], 2),
          claimSelector("claim-pung"),
        ],
        callout: "Two of yours, plus that one, makes three. Take it.",
        // The claim band is the decision here, so the sentence must not sit on
        // top of it (§5.5); the placement engine drops a rung rather than
        // cover the button it is telling the player to press.
        protect: ["claims"],
      },
      hints: [
        "You have two tiles that match the one in the middle.",
        "Tap Pung 碰 to take the thrown tile and finish the group.",
      ],
      offer: (action) => action.type === "claim-pung" || action.type === "pass",
      goal: (action) => action.type === "claim-pung",
      rescue: (_view, offered) => offered.find((action) => action.type === "claim-pung") ?? null,
      wrong:
        "Passing lets it go to the next player. You are holding two of that tile and the third has just been thrown — this is the moment to take it.",
      note:
        "That is a Pung 碰 — three matching tiles. It sits face up in front of you now, which is the price: a set nobody can break, in exchange for everybody knowing you hold it.",
      hold: true,
    },
    {
      kind: "act",
      id: "pung-discard",
      prompt: "Claiming does not end your turn. Throw one tile away, as usual.",
      focus: {
        targets: () => [teachSelector("hand")],
        callout: "Still your turn. Pick one to throw.",
      },
      hints: ["Any tile that is not part of a group you are building will do."],
      offer: (action, view) => {
        const kind = handKind(action, view);
        return kind !== null && !CLAIM_RESERVED.includes(kind);
      },
      goal: (action) => action.type === "discard",
      note:
        "A claim takes your turn there and then — no draw, just a throw. Play carries on from you, so anyone sitting between you and the thrower loses a turn.",
    },
    {
      kind: "act",
      id: "pass",
      prompt: "A West Wind, and you hold two — so Pung is offered again.",
      until: (view) => view.discards.some((discard) => discard.tile.kind === "wind-west"),
      focus: {
        targets: () => [teachSelector("claims")],
        callout: "This one is legal too. It does not have to be worth it.",
      },
      hints: [
        "You are allowed to leave a claim.",
        "Tap Pass 過 to let this one go.",
      ],
      offer: (action) => action.type === "claim-pung" || action.type === "pass",
      goal: (action) => action.type === "pass",
      rescue: (_view, offered) => offered.find((action) => action.type === "pass") ?? null,
      wrong:
        "Pung is legal here, and that is exactly the point — legal is not the same as worth having. Tap Pass 過 and leave it.",
      note:
        "You are never obliged to claim. Every claim spends tiles and shows the table part of your hand, so sometimes the trade is simply not worth it.",
    },
  ],
};

/* ==========================================================================
   Phase 3 — the first win
   ==========================================================================

   Closes the loop by returning to the shape the very first beat opened on. The
   spotlight goes to the offered tile, then to the group it completes, and only
   then to Win — §6 N4 asks for the relation to be visible before the control
   is, so the learner declares because they can see a finished hand rather than
   because a button lit up.

   The hand is built round a Red Dragon pung, worth one faan on its own, so it
   clears the standard minimum. The learner graduates to Beginner, where that
   floor is relaxed, and nothing here teaches the relaxed rule as if it were
   the game. Scoring is not the subject and is not explained. */
const WIN: OnboardingPhase = {
  id: "win",
  title: "Finishing a hand",
  summary: "Spot the tile that completes your hand, and call it.",
  reveal: [],
  scenario: {
    id: "onboard-win",
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
      [], [],
    ],
    // The dealer opens by throwing from its fourteen without drawing, so the
    // next draws belong to seats 2, 3 and the player, in that order.
    draws: ["wind-south", "wind-south", "characters-1"],
  },
  script: [
    { seat: 1, discard: "wind-north" },
    { seat: 1, discard: "dots-8" },
  ],
  steps: [
    {
      kind: "note",
      id: "one-away",
      prompt: "Read your own hand before anything else happens.",
      focus: {
        targets: () => [teachSelector("hand")],
        callout: "Three groups, three Red Dragons — and one lone Eight of Dots.",
      },
      note:
        "One more Eight of Dots would pair that up, and then you would have four groups and a pair. You are one tile away.",
    },
    {
      kind: "act",
      id: "wait",
      prompt: "You have drawn a One of Characters, which does not help. Throw it back.",
      until: (view) => view.currentSeat === 0,
      focus: {
        targets: (view) => handTiles(view, ["characters-1"]),
        callout: "No use to you. Throw it and keep waiting.",
      },
      hints: ["Tap the lit tile twice to throw it."],
      immediateHint: true,
      offer: (action, view) => isDiscardOf(action, "characters-1", view),
      goal: (action, view) => isDiscardOf(action, "characters-1", view),
      rescue: discardRescue("characters-1"),
      note: "Now you wait for the tile you need — from the wall, or from somebody's throw.",
    },
    {
      kind: "act",
      id: "declare",
      prompt: "Look at what has just been thrown into the middle.",
      focus: {
        targets: (view) => [
          teachSelector("offer"),
          ...handTiles(view, ["dots-8"], 1),
          claimSelector("win"),
        ],
        callout: "That is your Eight of Dots. Your hand is finished.",
        protect: ["claims"],
      },
      hints: [
        "That thrown tile pairs with the one you were holding.",
        "Four groups and a pair — tap Win 糊.",
      ],
      goal: (action) => action.type === "win",
      rescue: (_view, offered) => offered.find((action) => action.type === "win") ?? null,
      wrong:
        "That is the tile you were waiting for. Three Red Dragons, three runs, and now a pair of Eights — four groups and a pair. Tap Win 糊.",
      note: "You completed the hand. That is the whole game.",
      hold: true,
    },
  ],
};

/* ==========================================================================
   The rusty refresher (§10)
   ==========================================================================

   Not a shortened rules course. Somebody who has played mahjong before does
   not need four-groups-and-a-pair explained again; what they do not know is
   *this* table — that a discard is two taps rather than a drag, where claims
   appear, and where everything else went. So every beat here is about the
   interface, and the whole thing is over in about a minute.

   §10 is explicit that re-teaching obvious rules is the failure mode: a rusty
   player abandoning the refresher because it is telling them things they know
   is listed in §14.9 as a critical failure sign. */
const REFRESH: OnboardingPhase = {
  id: "refresh",
  title: "This table",
  summary: "How this app handles discards, claims and everything else.",
  reveal: [],
  scenario: {
    id: "onboard-refresh",
    profile: PROFILE,
    dealer: 0,
    hands: [
      [
        "characters-2", "characters-3", "characters-4",
        "dots-6", "dots-7", "dots-8",
        "bamboo-5", "bamboo-6", "bamboo-7",
        "dragon-red", "dragon-red",
        "dots-2", "dots-3",
        "wind-north",
      ],
      [], [], [],
    ],
    draws: ["wind-south", "dots-2", "dragon-green", "characters-9"],
  },
  script: [
    { seat: 1, discard: "wind-south" },
    { seat: 2, discard: "dots-2" },
    { seat: 3, discard: "dragon-green" },
  ],
  steps: [
    {
      kind: "act",
      id: "tap-tap",
      prompt: "Discards are two taps here: once to lift a tile, again to throw it.",
      immediateHint: true,
      focus: {
        targets: (view) => handTiles(view, ["wind-north"]),
        callout: "Tap once to lift, tap again to throw.",
      },
      hints: ["Two taps on the same tile — the first lifts it, the second throws it."],
      offer: (action, view) => isDiscardOf(action, "wind-north", view),
      goal: (action, view) => isDiscardOf(action, "wind-north", view),
      rescue: discardRescue("wind-north"),
      note: "That is the only interaction you need for a normal turn.",
    },
    {
      kind: "note",
      id: "table",
      prompt: "The table runs itself from here.",
      until: (view) => discardCount(view) >= 4,
      focus: {
        targets: () => [
          teachSelector("discard-well"),
          teachSelector("seat-right"),
          teachSelector("seat-across"),
          teachSelector("seat-left"),
        ],
        callout: "Discards in the middle. The lit seat is the one playing.",
      },
      note:
        "Opponent hands are a tile count, not a row of backs — the count is all a real game gives you anyway.",
    },
    {
      kind: "act",
      id: "claims",
      prompt: "Claims appear here, in the band above your hand, whenever one is legal.",
      until: (view) =>
        view.phase.kind === "awaiting-claims" || view.currentSeat === 0,
      focus: {
        targets: () => [teachSelector("claims")],
        callout: "Claims appear in this band. Passing is always an option.",
      },
      hints: ["Take it or leave it — either answer moves the table on."],
      // Deliberately either. This beat is about *where the controls are*, not
      // about whether this particular claim is worth taking; a rusty player
      // being corrected on their own judgement here would be exactly the
      // re-teaching §10 rules out.
      goal: () => true,
      note: "Whatever is legal shows up there. Nothing is ever forced on you.",
    },
    {
      kind: "note",
      id: "menu",
      prompt: "Everything else is behind Menu.",
      focus: {
        targets: () => [teachSelector("menu")],
        callout: "Settings, the full rules, stats and the lessons all live here.",
      },
      note:
        "No need to rotate the phone for any of it — the table stays where it is.",
    },
  ],
};

/** The novice spine, in order. Never shown as a list; never entered in the middle. */
export const NOVICE_PHASES: readonly OnboardingPhase[] = [TABLE, CLAIM, WIN];

export const REFRESHER_PHASES: readonly OnboardingPhase[] = [REFRESH];

export function phasesFor(path: OnboardingPath): readonly OnboardingPhase[] {
  return path === "novice" ? NOVICE_PHASES : REFRESHER_PHASES;
}

/**
 * Where to resume a walkthrough that was interrupted (§3.3).
 *
 * The unit of resume is the phase, so a stored id is looked up and anything
 * unrecognised — a phase renamed between builds — falls back to the start
 * rather than failing. Restarting a two-minute walkthrough is a far smaller
 * cost than refusing to load somebody's progress.
 */
export function resumeIndex(path: OnboardingPath, phase: string | null): number {
  if (phase === null) return 0;
  const index = phasesFor(path).findIndex((candidate) => candidate.id === phase);
  return index < 0 ? 0 : index;
}
