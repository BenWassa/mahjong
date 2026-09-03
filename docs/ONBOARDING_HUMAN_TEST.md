# Onboarding human test: readiness and protocol

> Issue: #33 — the comprehension gate `ONBOARDING_DESIGN.md` §14 requires
> Status: **the implementation is ready to test and is not validated**
> Design authority: [`ONBOARDING_DESIGN.md`](ONBOARDING_DESIGN.md)
> Implementation record: [`DESIGN.md`](DESIGN.md) §26

The redesigned first run is built. Whether it *works* — whether somebody who
has never played mahjong comes out of it understanding where they are, what
they are trying to do, and what their next decision means — is not something
this repository can establish. This document says exactly what the automated
gate does establish, what it cannot, and how to run the sessions that can.

Nothing here may be skipped on the grounds that the build is green. A green
build and a comprehensible onboarding are different claims, and #33 exists
because the first was mistaken for the second.

---

## 1. What the automated evidence proves

Every item below is asserted by something that fails the build when it breaks.

### Correctness and safety

| Claim | Where it is proved |
|---|---|
| Every walkthrough phase plays to completion through real engine transitions | `app/src/tutorial/onboarding.test.ts` |
| A teaching step only ever *removes* legal options; it never invents one | `onboarding.test.ts`, `runner.test.ts` |
| A wrong answer leaves the position byte-identical | `onboarding.test.ts` |
| No opponent's concealed tiles are in the player's view, in `openHands`, or in the DOM | `onboarding.test.ts`, `a11y-check.mjs`, `visual-qa.mjs` |
| Peek is unreachable throughout the first run — no control, no overlay | `onboarding.test.ts`, `visual-qa.mjs` |
| Scenarios deal identically on every run | `onboarding.test.ts` |
| Existing players are never re-asked or re-onboarded by an upgrade | `routing.test.ts`, `persistence.test.ts` |

### Routing and navigation

| Claim | Where it is proved |
|---|---|
| A fresh install is asked about experience, not about rules profiles | `routing.test.ts`, `a11y-check.mjs` |
| Each answer settles table, claim band and aids with no setup step | `routing.test.ts` |
| An interrupted walkthrough resumes at the phase it recorded | `routing.test.ts`, `persistence.test.ts` |
| The landscape table carries a visible Menu | `visual-qa.mjs` |
| Rules, stats and the lessons are reachable without rotating | `visual-qa.mjs` |
| Rotating to portrait holds the table rather than navigating | `visual-qa.mjs` |
| Rotating away and back returns the same hand | `visual-qa.mjs` |
| Back closes the topmost overlay rather than leaving the table | `visual-qa.mjs` |
| Start playing reaches a full table with no walkthrough and no overlay to dismiss | `visual-qa.mjs` |

### Spatial teaching

| Claim | Where it is proved |
|---|---|
| The degradation ladder never returns an illegal placement, across a phone matrix including insets | `placement.test.ts` |
| A callout never covers the hand, a live claim band or the offered tile, and never leaves the viewport — measured on rendered boxes at every step | `visual-qa.mjs` |
| A step that spotlights nothing is a failure, even when its callout degraded to the coach strip | `visual-qa.mjs` |
| The assistance ladder opens silent where the learner should reason and explicit where the subject is a control convention | `hints.test.ts`, `onboarding.test.ts` |
| A rescued answer is recorded as rescued, not as comprehension | `onboarding.test.ts` |
| Time behind an overlay is not counted as hesitation | `onboarding.test.ts` |
| The overlay is inert to touch and hidden from assistive technology, under both motion settings | `a11y-check.mjs` |
| The instruction reaches a screen reader through a live region regardless of rung | `a11y-check.mjs` |
| The target is marked by a drawn outline, not brightness alone | `a11y-check.mjs` |

### Layout and platform

Unchanged from the existing gate and re-run against the new surfaces: hand
readability and the 34px floor, the 44px effective touch target (now measured
on controls by their padded hit area as well as on tiles), no overflow or
clipping, safe areas, the responsive priority policy's tiers, reduced motion,
offline PWA behaviour, and Capacitor Android packaging.

---

## 2. What the automated evidence does not prove

**All of it is behaviour of the software, none of it is understanding.**

Specifically, nothing above establishes any of:

- that a novice knows which tiles are theirs after the first beat;
- that "four groups and a pair" reads as the goal of the game rather than as a
  description of one arranged example;
- that the first draw and discard produce the intended aha rather than feeling
  like a forced answer;
- that the spotlight makes the table readable rather than merely dimming it;
- that a learner can tell a public discard from a concealed hand afterwards;
- that deferring Chow, Kong and faan aids retention rather than postponing
  confusion;
- that a rusty player self-selects the refresher correctly;
- that anyone can transfer a discard decision to different tile faces in
  different positions;
- that the handoff into unscripted play reads as the same game continuing;
- that a conventional Menu is more discoverable than the rotation it replaced —
  including for players trained by earlier builds to rotate.

Each of these is a hypothesis. §14 of the design is the instrument for testing
them; the protocol below is what to run.

---

## 3. Exact routes and state reset

### Resetting to a fresh install

The first-launch question is asked only when no answer is stored. To test a
path more than once, clear local state between attempts.

**On a phone (Chrome/Android):** Settings → Privacy → Clear browsing data →
Cookies and site data, for the site only; or in DevTools over USB, Application
→ Storage → Clear site data.

**In a desktop browser:** DevTools → Application → Local storage → select the
origin → Clear. The app writes four keys, all prefixed `mahjong:v1:`
(`settings`, `tutorial`, `current-game`, `completed-games`). Clearing
`mahjong:v1:settings` alone re-asks the question; clearing `mahjong:v1:tutorial`
as well resets walkthrough and lesson progress.

**In the installed Android app:** Settings → Apps → Mahjong → Storage → Clear
storage.

### Reaching a path directly

These stand in for a tap that has not been made. They are read at launch and
are **never written to storage**, so they open a path without reconfiguring the
device — which also means they do nothing if an answer is already stored. Clear
local state first.

| Route | Opens |
|---|---|
| `?experience=new` | The novice walkthrough, from its first phase |
| `?experience=rusty` | The interface refresher |
| `?experience=confident` | A full Standard table, no walkthrough |
| `?mode=beginner` / `?mode=standard` | That table directly, as a confident player |
| `?learn=1` | The replayable lesson list |
| `?learn=<shape\|turn\|improve\|claims\|win>` | One replayable lesson |
| `?seed=<string>` | A specific deal, combinable with the above |
| `?layoutdebug=1` | The layout diagnostics HUD, for reporting a real phone's tier |

For a genuine first-run session, **do not use these**. Clear storage and let
the participant meet the launch question, because which door they choose is
itself one of the measures.

### What a moderator should have open

- `?layoutdebug=1` on a second device or after the session, to record the
  layout tier the participant's phone actually landed in;
- the observation sheet in §5 below;
- nothing else. The moderator must not explain mahjong or point at controls.

---

## 4. Cohorts and setup

Per `ONBOARDING_DESIGN.md` §14.1–14.2:

- **5 true novices** who cannot currently explain a normal mahjong turn or a
  winning shape. If five is impractical, **three is the floor** before the
  direction may be treated as settled.
- **3 rusty players** who have played before but never used this app.

Real phone, fresh local state, production-like build, normal device audio and
haptics. Screen recording and notes with consent. Record device, orientation
held at launch, prior mahjong exposure, and prior digital tile-game exposure.

Think-aloud prompts must stay neutral — "what are you looking for?" — and must
never contain the vocabulary the session is testing for.

---

## 5. What to record

The design's §§14.3–14.8 define the measures. In session order:

**First thirty seconds.** Time to first meaningful tile action. Whether they
can point to their own hand. Whether they can say what shape they are building
without being given the words. Whether the taught tap-tap discard lands without
moderator help. Where their finger and eyes go after each callout.

**First two minutes.** After natural pauses only: what happens when it becomes
your turn; why that tile and not this one; what you can normally know about the
other players' tiles; why do you think that option appeared. An explanation in
their own words plus behaviour consistent with it is the pass; repeating the
callout verbatim is weaker evidence.

**The transfer probe — the primary measure.** Immediately after the scripted
run, before the first normal hand goes far, present a fresh arranged hand that
changes suits, ranks and positions while preserving the structure. Nothing
points at the answer. Ask for one normal turn, and record whether they know
they hold one tile too many, whether they choose a defensible discard by
group-building rather than by remembered position, whether tap-tap survived,
and whether they know where the tile will go.

**First unscripted hand.** First two own turns, first claim opportunity, first
moment they want help, first result. Count rescue hints separately from
ordinary Assist: a participant who finished only because every decision was
suggested has not demonstrated comprehension.

**Closing interview.** The seven questions in §14.8. Do not use "was the
tutorial clear?" as evidence — self-reported clarity coexists comfortably with
being unable to explain or act.

**Rusty cohort.** Whether they pick the right door unprompted; whether tap-tap
lands after one demonstration; whether they locate claims and the Menu; whether
they reach normal play without being made to sit through beginner theory.

---

## 6. Failure signs that require a design change

From §14.9, and they override a clean completion rate:

- random tapping until the highlighted answer works;
- reading the strip, then scanning the whole screen for what it meant;
- believing opponent hands are normally inspectable;
- being unable to state draw-one/discard-one afterwards;
- treating four groups and a pair as a property of the example rather than the
  goal of the game;
- being unable to transfer a discard decision to different faces or positions;
- rotating the phone to hunt for the menu;
- treating Beginner's zero-faan win as the universal rule;
- a rusty player abandoning the refresher because it is telling them things
  they already know.

Classify each major assumption **ACCEPT**, **AMEND** or **REJECT** (§14.10).
Amendments belong in `ONBOARDING_DESIGN.md` first and in the code second.

---

## 7. Known limits of this build, to watch for specifically

Things the implementation chose that only a person can judge:

1. **Pacing.** The hesitation thresholds (5s soft, 10s explicit, 20s rescue)
   are the design's placeholders and were never tuned on anybody. Watch for a
   hint arriving while a participant is still thinking, which teaches them that
   waiting is rewarded.
2. **Auto-advance.** A satisfied step moves on after roughly 2.6 seconds of
   consequence note, with a Continue control available sooner. Watch for a note
   disappearing before it is read — especially for slower readers and for
   anyone using a screen reader.
3. **The callout at the tight tier.** On short phones the ladder degrades to
   the edge rung or the coach strip. The spotlight always remains, but whether
   an edge callout with a leader actually reads as being *about* the ringed
   object is a human judgement.
4. **The confident path's silence.** Start playing turns Assist, Explain and
   corner labels off. If confident players turn out to want Explain, that is a
   defaults change, not a bug.
5. **Two spare tiles at the unaided turn.** The step accepts three defensible
   discards. Watch whether the freedom reads as trust or as ambiguity.
6. **Rotation habits.** Players who used earlier builds were taught that
   rotation is the menu. Watch whether the Menu button is found before the
   phone is turned.
