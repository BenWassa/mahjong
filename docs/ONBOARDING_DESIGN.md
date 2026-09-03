# Mahjong onboarding design

> Issue: #33 — documentation authority for future onboarding implementation  
> Baseline researched: `main` at `0f2809ab12cb3ad886575f42dae8cbcff024888c`  
> Research basis: [`ONBOARDING_RESEARCH.md`](ONBOARDING_RESEARCH.md)  
> Status: **authoritative product direction; not yet implemented**

This document defines the first-time-player experience the next implementation issue must build. It supersedes older onboarding and orientation assumptions in `DESIGN.md` where they conflict, while leaving engine/rules authority untouched.

It deliberately specifies **what the player sees, understands, does, and is allowed to ignore**. The implementing issue should not need to rediscover the product direction.

---

## 1. Product outcome

A true novice should reach the following mental model before being asked to operate the full table unaided:

> **“I’m trying to turn my hand into four groups and a pair. On a normal turn I draw one tile and discard one tile, keeping the tiles that help that shape. Discards are public in the middle; the other players’ concealed tiles are not. Sometimes another player’s discard gives me a claim.”**

The onboarding succeeds only if the learner can **transfer** that model to a different, unscripted hand. Finishing tutorial steps is not evidence of success.

### 1.1 First aha moment

The intended first aha is:

> **Goal + loop:** “The extra tile creates a choice: keep what helps me build four groups and a pair, throw away what does not.”

Target: the learner experiences that relationship in the first **30–60 seconds of interactive table time**.

This is more important than teaching any named claim, scoring term, seat wind, or mode.

### 1.2 Two gameplay loops to distinguish

**Micro loop — a turn:** draw → inspect → discard → table advances → play returns. The learner must complete one full micro loop early.

**Hand loop:** build → optionally claim → complete/declare → result. The scripted onboarding closes one short hand loop, then immediately starts the first **unscripted** hand loop.

The East-round/match loop is not onboarding material.

---

## 2. Non-goals for first run

Do **not** front-load:

- the full faan table or scoring arithmetic;
- seat-wind and round-wind scoring consequences;
- Chow source restrictions before claims are understood at all;
- Kong replacement mechanics before a Kong is relevant;
- shanten terminology;
- “eyes 眼” as required vocabulary;
- every tile-family rule in prose;
- rules-profile configuration;
- stats, persistence, PWA installation, or other product features;
- a tour of every control or table label;
- the full Learn curriculum.

These remain available through contextual teaching, replayable Learn material, and the rules reference.

---

## 3. First-run entry: segment by experience, not by rules profile

Replace the current Beginner-vs-Standard first-run framing with a question the player can answer before they know the product’s vocabulary.

### 3.1 Entry screen

The first screen may render in portrait or landscape. It contains one question and three choices:

| Choice | Who it is for | Outcome |
|---|---|---|
| **New to Mahjong** | Has never played or cannot explain the basic loop | Primary path: the short linear novice onboarding below; eventual Beginner table |
| **Played before — refresh me** | Remembers Mahjong broadly but needs this app/interface refreshed | Short interface refresher; eventual Standard table with learning aids on |
| **Start playing** | Confident player who does not want instruction | Standard table immediately; no forced tutorial |

Exact player-facing copy may be polished in implementation, but these **three meanings** are fixed.

Do not ask a novice to choose “Beginner” or “Standard” on launch. That is configuration without a mental model.

### 3.2 Smart defaults

The branches establish sensible defaults without a setup step:

**New to Mahjong**
- next real match: Beginner rules;
- Assist on;
- Explain on;
- corner labels at least `rank`;
- reduced claim band if Beginner continues to use it.

**Played before — refresh me**
- Standard rules;
- full claims;
- Assist on;
- Explain on;
- corner labels at least `rank` for the refresher; the player can change them later.

**Start playing**
- Standard rules;
- full claims;
- no onboarding sequence;
- learning aids should not be forced by first-run ceremony. The implementation may preserve a user’s existing persisted settings; on a genuinely fresh confident-player path, default to a clean full table rather than unsolicited step-by-step coaching.

### 3.3 Resume and replay

- Onboarding progress records progress; it never gates the table.
- A kill or background termination must resume at a coherent phase or exit safely to the player’s chosen table, as current persistence semantics permit.
- *Implementation-settled:* the unit of resume is the **phase**, not the step.
  The scripted phases are short and each one is a deterministic scenario, so
  persisting a phase identifier and replaying that phase from its start is both
  cheaper and more coherent than persisting mid-scenario engine state — which
  would have to survive a schema change to stay correct, and which would drop
  the learner back into a half-finished position they no longer have the
  context for. Relaunching mid-onboarding therefore restarts the furthest phase
  reached; it never restarts the whole sequence and never silently skips ahead.
- The full Learn material remains reachable later through the normal menu.
- The replayable Learn hub may expose lessons out of order. **First run may not.**

---

## 4. Orientation and navigation authority

### 4.1 Keep landscape gameplay

The production table remains landscape-first. Fourteen readable tiles are the hard constraint and Issue #33 does not reopen it.

### 4.2 Replace rotation-as-navigation

**Physical orientation must no longer choose the app screen.**

The current model — landscape equals table, portrait equals menu/settings/Learn/rules/stats — is superseded.

New rule:

> **Screen state chooses the surface; orientation only affects how that surface lays out.**

Required consequences:

- the landscape table has a visible, conventional **Menu** affordance;
- Menu, Learn, rules, stats, and settings are reachable without rotating the phone;
- those secondary surfaces must be usable in landscape because that is the player’s existing grip and context;
- secondary surfaces may also reflow into portrait if useful, but portrait is never their navigation trigger;
- rotating a live table to portrait preserves the game state and presents a simple rotate-back holding state rather than silently navigating to the menu;
- rotating back restores the exact table state;
- interactive table onboarding is landscape, so the learner does not rehearse a portrait hand layout they will never use in real play.

Whether the native Activity is technically orientation-locked is an implementation decision for the next issue. The product contract is about continuity: **the player must never have to discover that rotating the hardware is the menu command.**

### 4.3 Android Back and overlay dismissal

*Added during implementation analysis. #33 lists Back behavior as a constraint
to preserve but the first-run flow introduces surfaces Back did not previously
have to answer for.*

Back is always "close the topmost thing", never "leave the product":

1. an open overlay (menu sheet, Peek, rules, stats, result sheet) closes;
2. on a scripted onboarding surface with nothing open, Back asks once — *leave
   the walkthrough?* — rather than discarding the sequence on a stray press. A
   novice mis-pressing Back must not lose their orientation without being asked;
3. answering *leave* is the same operation as the visible Leave control, and
   lands on the table the player’s entry choice selected, with progress recorded;
4. on a plain table, Back keeps whatever behavior the app already has.

Each overlay owns exactly one history entry and every exit from it routes
through that entry, which is the contract Peek already implements.

### 4.4 First-run orientation handoff

If the player chooses New/Refresh while holding the phone in portrait:

1. retain the chosen path;
2. show one simple rotate-to-landscape holding state;
3. begin interactive teaching immediately when landscape is available;
4. do not count this device handoff as a tutorial step and do not keep teaching device orientation afterwards.

---

## 5. Attention system

The current top coach strip is insufficient as the primary teaching mechanism for object-specific steps. The new onboarding requires a spatial attention layer.

### 5.1 Three teaching surfaces

**A. Anchored callout** — the default for “look here / do this”. It sits adjacent to the target region and can point to it.

**B. Spotlight** — quiets non-target regions while preserving enough table context to understand location. It uses shape/contrast/outline, never colour alone.

**C. Global coach line** — reserved for whole-table ideas that have no single target, such as “Play moves to your right” or “Now nothing is scripted.” It may also contain Leave/Skip/progress controls.

Object-specific instructions must not live only in the global coach.

### 5.2 One target at a time

At any one instructional moment there is one primary locus of attention:

- own hand;
- a drawn tile / group inside own hand;
- the discard area;
- one opponent seat / turn marker;
- the offered discard;
- the claim controls;
- the completed hand / Win control.

Do not simultaneously spotlight the hand, all opponents, all claims, and explanatory text.

### 5.3 Action advances the tutorial

Avoid “Next” ceremony for every micro-step.

- If the learner can perform the concept, **performing it advances the step**.
- A short consequence note may replace the instruction after the action.
- Explicit Continue is reserved for rare whole-table explanations where there is genuinely no action to perform.
- Wrong answers leave the scenario unchanged and give a local explanation, retaining the current #30 safety property.

### 5.4 Timed assistance ladder

Timing must eventually be tuned on real players, but the implementation should support this escalation model:

1. **Initial state:** goal/callout, target structurally identifiable; do not reveal the exact answer when the player is supposed to decide.
2. **Soft hint after roughly 5 seconds of inactivity:** strengthen the relevant region’s outline/spotlight or narrow the visual search space.
3. **Explicit hint after roughly 10 seconds:** arrow/leader plus concrete action language or a suggested tile.
4. **Rescue after prolonged hesitation:** offer “Show me” or equivalent; performing the rescue must not be counted as independent comprehension.

For steps whose purpose is merely to teach the tap-tap control, immediate explicit guidance is appropriate; there is no value in making the player discover a private interaction convention by trial and error.

### 5.5 Responsive and accessible constraints

- A callout must never cover the tile/control it refers to.
- It must not cover the whole player hand, claim band, or offered tile when those are decision inputs.
- Placement chooses above/below/side based on available space and safe areas; no fixed absolute phone coordinate.
- The visual target must survive colour-vision differences through outline, dimming, shape, pointer, or label.
- Reduced motion may fade/appear instantly; motion is not required to locate the target.
- Screen-reader ordering must place the instruction immediately before the target interaction where practical, with the target named explicitly.
- Focus must not jump around on touch. Keyboard focus may be moved only when the next required control would otherwise be practically unreachable, following existing accessibility conventions.

### 5.6 Degradation ladder when there is no room to anchor

*Added during implementation analysis. The rules in §5.5 are minimums a short
landscape phone cannot always satisfy at once: at the `tight` layout tier the
table has already collapsed its optional bands, and a callout placed adjacent
to the player hand has nowhere to go that is not on top of the discard well or
the claim band. The design does not resolve that by shrinking the table — §5 of
`DESIGN.md` forbids it and Issue #32 already proved it unreadable — so it
resolves it by saying which half of the attention system degrades.*

Spotlighting costs no layout: it is drawn over the table and moves nothing.
Callouts cost layout. Therefore **the spotlight is what carries spatial
tethering, and the callout is what degrades.** In descending order:

1. **Anchored callout.** Placed adjacent to the spotlit target, on the side
   with the most free space, never overlapping the target or any decision
   input named in §5.5.
2. **Edge callout with a pointer.** When no adjacent placement satisfies (1),
   the callout moves to the nearest viewport edge that is not a decision input
   and draws a leader/pointer back to the spotlit target. The target stays
   spotlit; the sentence is still visibly *about* that object.
3. **Global coach line, spotlight retained.** When even (2) would cover a
   decision input, the sentence falls back to the global coach strip — but the
   spotlight on the target must remain. This is the floor: the learner may
   have to move their eyes from the strip to the target, but the target is
   still unambiguously marked, so they never search the whole screen for the
   referent.

A step must never degrade past (3). A step whose teaching would be meaningless
without an adjacent callout is a step that has to be redesigned, not shipped at
the tight tier.

The chosen rung is a property of the measured viewport and the measured target
rectangle, not of a device allowlist, and it is re-evaluated on resize,
rotation, and layout-tier change.

---

## 6. Novice path: the linear first run

The targets below are **design pacing targets**, not acceptance claims. Human testing may change the seconds while preserving the learning order.

### Phase N0 — Your table

**Target window:** first ~20–30 seconds of interactive table time.  
**Goal:** establish own hand, target shape, and the reason a discard exists before exposing the full table as equally important.

#### Starting composition

Use a deterministic arranged hand with:

- obvious completed groups;
- a pair;
- one nearly completed group;
- one clearly isolated/spare tile;
- an incoming tile that visibly improves the nearly completed group.

The rest of the table exists but is visually subordinate. Opponents can be seat landmarks/compact concealed counts; scores, bonus counts, wall arithmetic, winds, advanced claim controls, and other reference readouts are not part of the current lesson.

#### Beat N0.1 — “Your hand”

Spotlight the bottom hand.

Communicate, visually first:

> **Build four groups and a pair.**

Show the target as grouped tile shapes (`3 + 3 + 3 + 3 + 2`) using actual tiles or brackets. Do not begin by defining Chow/Pung/Kong.

#### Beat N0.2 — first meaningful draw

The arranged draw visibly completes one partial group. Highlight the incoming tile and the tiles it joins.

Callout meaning:

> “That tile completes this group. Keep it.”

#### Beat N0.3 — first discard and control grammar

Spotlight the clearly spare tile. Teach the private control explicitly:

> “Tap once to lift. Tap again to discard.”

The learner performs the tap-tap discard. The discard area becomes the target as the tile arrives there.

Consequence line:

> **“That is the loop: draw one, keep what builds your hand, discard one.”**

This is the intended first aha.

### Phase N1 — The table moves

**Target window:** ~20–60 seconds.  
**Goal:** connect the player’s hand to the shared table without making every table element equally salient.

Reveal/spotlight only as each becomes relevant:

1. the centre discard area — “Thrown tiles stay public here”;
2. the right-hand opponent seat and turn marker;
3. the across seat;
4. the left seat;
5. return to the player.

Global concept:

> “Three opponents sit around you. Play moves to your right and comes back to you.”

Do **not** reveal opponents’ concealed tile faces. The hidden-information model begins correct.

### Phase N2 — First independent full turn

**Target window:** within roughly the first 60–90 seconds.  
**Goal:** demonstrate the learner understands the micro loop rather than merely following an arrow.

Arrange a new draw where one discard is clearly weakest but do **not** immediately point at the correct tile.

Prompt near the hand:

> “Your turn again. Keep what helps your groups; discard what helps least.”

All legally discardable tiles may remain legal. The scenario may reject a pedagogically wrong answer without mutating state, as current tutorial mechanics do, but the first prompt must give the learner an opportunity to reason before the timed hint ladder supplies the answer.

*Implementation-settled:* this step’s goal must be **tolerant, not exact**. The
earlier scripted beats teach a named tile and may test for it; N2 is testing
whether the learner reasons, so it accepts any discard that does not damage the
hand — every spare tile, not one designated answer — and corrects only choices
that break the pair or a completed group, naming what the choice cost. Rejecting
a defensible discard because it was not the single tile the author had in mind
teaches the learner to hunt for the highlighted answer, which §14.9 lists as a
critical failure sign.

Success evidence inside the tutorial: the learner completes tap-tap on the intended tile without the explicit rescue hint.

### Phase N3 — First claim: Pung, then agency

**Target window:** roughly 1–2 minutes.  
**Goal:** teach the existence of claims using only information available in real play.

Arrange an opponent discard matching two tiles in the learner’s hand.

Spotlight as one connected decision:

- the public offered discard;
- the learner’s two matching tiles;
- then the Pung control when it appears.

Instruction meaning:

> “You have two matching tiles. That discard can make three. Take it.”

After the learner acts, introduce the conventional name:

> **“That is a Pung 碰 — three matching tiles.”**

Then require the normal post-claim discard so the learner sees that claiming changes turn order but still ends in a discard decision.

A later safe opportunity may introduce **Pass** as agency: “A claim can be legal without being useful. You can leave it.” This is preferable to teaching every claim type before the player has used one.

**Chow and Kong are not required in the mandatory novice spine.** They are taught contextually later or in replayable Learn lessons. This is intentional progressive disclosure and matches the Beginner table’s reduced claim vocabulary if that remains in production.

### Phase N4 — First win

**Target window:** roughly 2–3 minutes.  
**Goal:** close the hand loop by returning to the original target shape.

Use a legal scenario that qualifies under Standard rules even though the learner path will graduate to Beginner. This preserves rules correctness without requiring the novice to understand the minimum-faan rule yet.

Before the winning discard arrives, spotlight the hand shape and show it is one tile short. When the public tile arrives:

- spotlight the offered tile;
- spotlight the group/pair it completes;
- spotlight Win only after the relation is visible.

Meaning:

> “That tile finishes four groups and a pair. Declare Win.”

After the action:

> **“You completed the hand.”**

Do not turn this moment into a scoring lecture. The normal itemized result can remain available, but onboarding should visually lead with the completed-hand consequence. Faan is introduced when scoring becomes the subject, not before the player has completed the game loop.

### Phase N5 — Seamless handoff to real play

Do **not** return to a lesson menu. Do **not** show a graduation screen asking the novice to choose Beginner versus Standard.

Deal the next hand directly on the same landscape table.

One global line:

> **“Now you play. Nothing in this hand is scripted.”**

Then forced tutorial actions stop.

State the Beginner simplification once, without asking for configuration:

> “You’re starting on Beginner. Every completed hand can win; the full table also requires at least 1 faan. Faan will be explained when it matters, and you can switch later.”

This is disclosure, not a setup decision.

---

## 7. Scaffolding during the first unscripted hand

The first real hand is where onboarding proves whether it created a usable model.

### 7.1 What disappears immediately

- forced discard choices;
- tutorial step counters;
- persistent tutorial scrim;
- mandatory Peek;
- scripted opponent discards;
- “Next” progression.

### 7.2 What remains temporarily

- Assist, Explain, and corner labels according to the novice defaults;
- first-occurrence contextual tips for genuinely new concepts;
- delayed rescue hints when the player is stuck;
- the Beginner claim reduction, if retained;
- normal result explanation.

### 7.3 Fade rules

- After two successful unprompted own turns, do not show basic “draw one / discard one” instruction again.
- After the player has used Pung once, subsequent Pung offers should rely on normal UI plus Assist unless the player explicitly opens help.
- Introduce Chow only on the first relevant opportunity after the player has enabled/full claims or in a dedicated Learn lesson. Anchor its source-seat restriction to the **source seat + discard**, not a paragraph in the global coach.
- Introduce Kong only on the first actual Kong opportunity; immediately show why a replacement draw happens.
- Introduce faan at a result/qualification moment, with the itemized breakdown already required by the main design.
- Explain winds and flowers only when they affect an action/result the player is currently looking at.

No onboarding concept should be repeated forever merely because the feature is “learning mode”.

---

## 8. Peek authority

### 8.1 Peek is optional x-ray, not core evidence

Peek must not appear as a persistent control through the mandatory novice path.

A real player cannot inspect concealed opponent hands. Therefore no first-run decision should require or encourage using those hands as evidence.

### 8.2 Legitimate future uses

Peek may be retained for replayable Learn material when one of these is explicitly the teaching objective:

- “What happened inside that scripted opponent turn?”
- comparing an open teaching position with the public table;
- a deliberate hidden-information lesson explaining what **is not** normally knowable.

When used:

- label it as an **x-ray / teaching view** before opening, not merely after;
- show only the opponent(s) relevant to the current explanation where practical;
- highlight the exact relevant tiles rather than presenting three equal-density hands;
- pause the scenario as it does today;
- preserve the current redaction boundary and accessibility behavior;
- never expose it in an unscripted real hand.

Current stale copy claiming opponent hands are “face up” must be removed in implementation. Where a retained replayable lesson still teaches with revealed hands, the copy must name the surface those hands actually live on — Peek — rather than implying they are visible on the table, and must not make reading them a precondition for the lesson’s decision.

---

## 9. Terminology ladder

The first run teaches meanings in this order:

| First say/show | Then name | When |
|---|---|---|
| Four groups + a pair | “complete hand” | Opening target |
| Three consecutive numbered tiles | Chow 食 | Only after the player first makes/takes one |
| Three matching tiles | Pung 碰 | Immediately after the first Pung action |
| Four matching tiles | Kong 槓 | First actual Kong context, not first minute |
| Leave the offered tile | Pass 過 | First useful non-claim decision |
| A complete hand that can be declared | Win 糊 | First winning context |
| Hand value / score components | faan | First result or first minimum-faan block |
| Distance to completion | no “shanten” term required | Assist may use plain language indefinitely |

Rules:

- Specialized terms follow a seen/performed example.
- A term is not introduced merely because its button exists somewhere else.
- Use English/plain concept plus conventional name/glyph; never require decoding the glyph alone.
- Avoid teaching synonyms that are not needed for play. “Eyes 眼” is reference knowledge, not novice-path vocabulary.

---

## 10. Rusty-player refresher

The refresher is not a shortened rules course. Its job is to rebuild **interface orientation** and expose this app’s private interaction conventions.

Target: approximately **45–90 seconds**, then Standard play.

Required beats:

1. spotlight own hand and state “tap once to lift, tap again to discard”;
2. one real tap-tap discard;
3. spotlight discard area and turn marker while one opponent cycle runs;
4. show where claims appear, using a single prepared Pung/Pass opportunity if needed;
5. spotlight the visible Menu affordance and state where Learn/rules/settings live;
6. release into Standard unscripted play with full claims.

Do not re-teach four-groups-plus-pair unless the player asks for Learn or demonstrates confusion. Do not force Chow/Kong explanations before they occur.

If a rusty player realizes they need more, the Learn hub must be one conventional menu action away.

---

## 11. Confident-player path

A player choosing **Start playing** reaches a Standard unscripted table immediately.

Requirements:

- no tutorial overlay that must be dismissed;
- full normal claims;
- visible Menu affordance;
- Learn and rules remain discoverable later;
- normal first-occurrence Explain/Assist behavior follows the settings established for this path, not a forced novice sequence.

Skipping onboarding must not lock the player out of any learning content.

---

## 12. Learn after first run

The current lesson menu’s **replayability and out-of-order access are retained as post-onboarding strengths**.

The Learn hub should become a reference/practice library, not the novice first-run router. The implementation issue may reorganize the existing five lessons, but the future content model should clearly separate:

- **Your table / controls**;
- **Core turn loop and hand target**;
- **Improving a hand**;
- **Pung and Pass**;
- **Chow and source-seat restriction**;
- **Kong and replacement draw**;
- **Winning and faan qualification**.

A lesson can be replayed indefinitely. Completion markers are informational only.

---

## 13. Stage-to-objective contract

Every implemented first-run stage must map to one primary learning objective. If a stage cannot be assigned one row here, it is probably scope creep.

| Stage | Primary objective | Evidence required before progression |
|---|---|---|
| Entry | Choose assistance based on prior experience | Player selects meaningful experience path |
| N0 Your table | Locate own hand; understand target + tap-tap discard | Performs first discard and sees why it preserves an improving group |
| N1 Table moves | Understand public centre + turn movement | Watches full opponent cycle and returns attention to own hand |
| N2 Full turn | Apply draw/discard reasoning | Chooses intended discard before rescue hint |
| N3 Claim | Understand that a public discard can combine with own tiles | Executes first Pung from own pair + public discard |
| N4 Win | Recognize completion and declare | Connects offered tile to four-groups-plus-pair and presses Win |
| N5 Unscripted | Transfer from scaffold to game | Makes decisions in a fresh hand with no forced tutorial action |
| Rusty refresher | Relearn app-specific controls/navigation | Performs tap-tap, identifies claim region, finds Menu |

---

## 14. Future real-human comprehension test

This gate is required before claiming the redesigned onboarding is successful. It measures **understanding and transfer**, not tutorial completion.

### 14.1 Cohorts

Formative target:

- **5 true novices** who cannot currently explain a normal Mahjong turn or winning shape;
- **3 rusty players** who have played Mahjong before but have not used this app.

If recruiting eight people is impractical, test at least three true novices before implementation direction is treated as settled. Do not replace humans with agents or automated browser runs.

### 14.2 Setup

- real phone, fresh local state;
- production-like build;
- normal audio/haptics according to device settings;
- moderator does not explain Mahjong or where controls are;
- screen recording and observation notes if participants consent;
- record device/orientation, prior Mahjong exposure, and prior digital tile-game exposure.

Think-aloud is useful but must be prompted neutrally (“What are you looking for?”), not with vocabulary that gives away the answer.

### 14.3 First-30-seconds measures

After interactive table time begins, record:

- time to first meaningful tile action;
- whether the participant can identify which tiles are theirs;
- whether they can say, without supplied terminology, what shape they are trying to build;
- whether they complete the taught tap-tap discard without moderator help;
- where their eyes/finger search after reading each callout.

Desired formative result: at least **4/5 novices** complete the first discard without moderator intervention and can point to their own hand and the centre discard area.

### 14.4 First-two-minutes measures

Before the scripted win, ask only after natural pauses:

- “What happens when it becomes your turn?”
- “Why did you throw that tile rather than this one?”
- “What can you normally know about the other players’ tiles?”
- after Pung appears: “Why do you think that option appeared?”

Pass evidence is an explanation in the participant’s own words plus behavior consistent with it. Repeating the tutorial sentence verbatim is weaker evidence.

Desired formative result: at least **4/5 novices** can state the draw/discard loop, identify opponent hands as concealed, and explain the first Pung as combining their matching tiles with the public discard.

### 14.5 Transfer probe immediately after scripted onboarding

Before the first normal match proceeds far, present a **fresh arranged hand** that changes suits/ranks and tile positions while preserving the learned structure. No spotlight points to the answer and no exact discard is named.

Ask the participant to take one normal turn.

Record:

- whether they know they have one tile too many after the draw;
- whether they can select a defensible discard based on group-building rather than copying a remembered tile position;
- whether tap-tap interaction is retained;
- whether they know where the discard will go.

This is the primary comprehension measure because it tests transfer beyond the rehearsed scenario.

### 14.6 First unscripted-hand measures

Observe without coaching:

- first two own turns;
- first claim opportunity;
- first moment the participant wants help/settings;
- first result or end-of-hand explanation.

Record rescue hints separately from ordinary Assist. A participant who completes only because every decision is explicitly suggested has not demonstrated independent comprehension.

Desired formative result:

- **4/5 novices** complete their first two own turns without a forced tutorial instruction;
- **4/5 novices** can explain the basic goal and turn loop after those turns;
- **4/5 novices** can distinguish public discard information from concealed opponent information;
- **4/5 novices** can find Menu/help from landscape without being told to rotate the device.

### 14.7 Rusty-player measures

For the refresher cohort:

- can they identify the appropriate “Played before” path without confusion?;
- can they perform tap-tap discard after one demonstration?;
- can they locate claims and Menu?;
- can they enter Standard unscripted play within the intended short refresher without feeling forced through beginner rules instruction?;
- do they know how to open the full Learn material if they discover a rules gap?

### 14.8 Comprehension interview

After the first unscripted segment, ask:

1. “What are you trying to make in your hand?”
2. “Walk me through a normal turn.”
3. “What information about the other players can you actually use?”
4. “Why might a Pung button appear?”
5. “If you forgot how Chow works later, where would you look?”
6. “How would you open settings or leave the table?”
7. “What is different about the Beginner table, if anything?”

Do not ask “Was the tutorial clear?” as the main evidence. Self-reported clarity can coexist with inability to explain or act.

### 14.9 Critical failure signs

Any recurring pattern below requires design amendment even if tutorial completion is 100%:

- random tapping until the highlighted answer works;
- repeatedly reading top text then scanning the entire screen for its referent;
- belief that opponent hands are normally inspectable;
- inability to state draw-one/discard-one after finishing onboarding;
- belief that four groups and a pair was only the scripted example, not the game goal;
- inability to transfer a discard decision to different tile faces/positions;
- rotating the phone to hunt for Menu/help because the participant inferred rotation is navigation;
- treating Beginner’s zero-faan win as the universal HKOS rule;
- rusty players abandoning the refresher because it re-teaches obvious rules rather than the interface.

### 14.10 Decision rule

After the sessions, classify each major design assumption as:

- **ACCEPT** — behavior and explanation support it;
- **AMEND** — model is broadly right but cue/order/copy is causing recoverable confusion;
- **REJECT** — participants complete steps without forming the intended mental model or cannot transfer it.

Do not mark Issue #33’s future implementation “novice validated” until this human gate has been run. Automated QA remains necessary for legality, layout, accessibility, and regressions, but cannot substitute for comprehension.

---

## 15. Implementation boundaries for the next issue

The next issue may change UI/layout/tutorial code as necessary, but must preserve these existing correctness boundaries unless separately authorized:

- `HKOS_RULES.md` remains rules authority;
- tutorial actions still execute through the production engine;
- a tutorial may remove legal options but must not invent illegal actions;
- wrong answers must not push the learner into an undesigned game state;
- bots still consume redacted public state only;
- tutorial-only visibility must not weaken normal redaction;
- the production hand remains readable and non-scrolling in landscape;
- tap-tap discard remains the production interaction unless a separate issue reopens it;
- first run stays skippable and Learn stays replayable;
- accessibility, reduced motion, Back behavior, safe areas, PWA/offline, and Capacitor behavior remain product constraints.

The implementation may reuse, split, or rewrite current #30 lesson content. It must not preserve stale structure merely because it already exists.

---

## 16. Acceptance criteria for the implementation issue derived from this design

The implementation issue is product-complete when, before human validation:

- [ ] first-run entry segments New / Rusty / Start-playing by experience rather than rules jargon;
- [ ] novice first run bypasses the lesson menu and follows one linear path;
- [ ] a short Your-table phase precedes exposure to full table complexity;
- [ ] the first meaningful draw/discard demonstrates goal + loop within the first minute target;
- [ ] object-specific instructions are spatially tethered to their targets;
- [ ] the learner completes an increasingly independent second turn;
- [ ] first Pung is taught from public discard + own tiles, without needing Peek;
- [ ] Chow/Kong are deferred from the mandatory novice spine;
- [ ] first scripted win returns to four-groups-plus-pair rather than leading with scoring detail;
- [ ] the scripted sequence flows directly into an unscripted Beginner hand;
- [ ] forced tutorial scaffolding disappears at the handoff;
- [ ] Peek is absent from mandatory first run and, if retained, is explicitly optional/x-ray teaching material;
- [ ] stale “opponents are face up” tutorial copy is gone;
- [ ] landscape gameplay remains, but rotation no longer routes to the menu;
- [ ] a visible landscape Menu affordance reaches settings/Learn/rules/stats;
- [ ] rotating a live table to portrait preserves surface/state and does not navigate elsewhere;
- [ ] rusty refresher teaches interface conventions without replaying novice Mahjong theory;
- [ ] confident players can skip directly to Standard play;
- [ ] Learn remains replayable after first run;
- [ ] automated legality/layout/accessibility/offline gates are green;
- [ ] the callout degradation ladder in §5.6 holds at the tight layout tier, with the spotlight never degrading;
- [ ] interrupted onboarding resumes at the furthest phase reached (§3.3);
- [ ] Back closes the topmost overlay and asks before discarding a walkthrough (§4.3);
- [ ] the independent-turn step accepts any non-damaging discard rather than one designated tile (§6, N2);
- [ ] human comprehension test materials are ready and the implementation is explicitly labelled **unvalidated** until real sessions run.
