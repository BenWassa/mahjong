# Mahjong onboarding research

> Issue: #33 — research and documentation only  
> Research date: 2026-09-02  
> Baseline: `main` at `0f2809ab12cb3ad886575f42dae8cbcff024888c`  
> Status: **product research input to [`ONBOARDING_DESIGN.md`](ONBOARDING_DESIGN.md)**

This document evaluates the first-time experience of the current Mahjong app and turns external onboarding research into product conclusions for this specific game. It does **not** claim that the resulting design is novice-usable. That can only be established by observing real novice and rusty players; the future comprehension gate is defined in `ONBOARDING_DESIGN.md`.

The exact baseline above was green in both CI and the production Pages deployment. The production behavior audit therefore uses the source that was actually deployed, not an older prototype or an inferred design. Automated QA establishes implementation consistency, not comprehension.

---

## 1. Research question

The product problem is not “how do we explain more Mahjong?” It is:

> **How do we get a person who does not yet possess a Mahjong mental model to make a meaningful Mahjong decision quickly, understand why it mattered, and then transfer that understanding into an unscripted hand?**

That framing follows Impeccable `/onboard`: define the first “aha” moment and make every first-run decision point toward it, while resisting both the product-tour carousel and the zero-onboarding drop into complexity.

For Mahjong, the challenge is unusually spatial. A real table contains four seats, concealed information, a discard field, a hand of 13–14 visually dense objects, claims, turn state, winds, scoring concepts, and unfamiliar terminology. A mechanically correct tutorial can therefore still fail if the learner does not know **where to look**, **what to ignore**, or **why the current action matters**.

---

## 2. Current production audit

### 2.1 First-run path

Current first run begins with `ModeChoice.tsx`, before the orientation split:

1. **Learn to play** — recommended, “about 6 minutes”.
2. **I know mahjong — start simple** — Beginner table.
3. **I know mahjong — the full table** — Standard table.

Choosing Learn immediately records Beginner mode, then opens `Learn.tsx`. Unless a direct `?learn=<lesson>` URL is used, Learn opens on a **five-item lesson menu**. A first-time learner chooses a lesson, completes it, returns to the lesson menu, chooses the next lesson, and repeats. Finishing lesson five leads to a graduation screen that asks the learner to choose Beginner or Standard before starting the guided real hand.

This is mechanically flexible and replayable, but the first-run learner is asked to navigate a curriculum before the curriculum has given them a reason to care about its categories.

### 2.2 Current lesson sequence

| Current stage | Intended learning objective | Current interaction | Main cognitive demand before the action |
|---|---|---|---|
| Lesson menu | Choose what to learn | Select one of five named lessons | Understand the curriculum labels well enough to choose |
| 1. Four sets and a pair | Recognize the target hand shape | Point at runs, a Pung, and a pair | Parse the full production table; distinguish own hand from seats/centre; absorb Chow/Pung/Kong/pair terminology |
| 2. Taking a turn | Learn draw → discard → turn order | Make two forced discards and watch opponents | Track hand count, centre discards, opponent turns, seat order |
| 3. Choosing what to throw | Learn that discards improve or damage hand shape | Choose among narrowed discard candidates | Read several partial groups and compare usefulness |
| 4. Taking other players’ tiles | Learn claims and restrictions | Pung, Chow, Kong, Pass | Track source seat, own matching tiles, offered tile, claim vocabulary, Chow restriction |
| 5. Declaring a win | Recognize and call a complete hand | Discard, wait, then Win | Transfer the target shape to hidden-opponent conditions; understand minimum faan qualification |
| Graduation | Choose a real table | Choose Beginner or Standard | Understand a rules-profile distinction immediately after first learning the game |
| Guided hand | Transfer to real play | Real seeded match, normal player decisions | Integrate everything without scripted moves |

The sequence contains good pedagogical mechanics: production-engine scenarios, safe retry on wrong answers, real table components, real bots, and an eventual unscripted hand. The problem is primarily **ordering, attention management, and transition**, not lack of content.

### 2.3 The dense-table problem

The tutorial deliberately reuses the production table. That is valuable for transfer, but it means lesson 1 exposes the learner to the table’s full spatial grammar before that grammar is taught.

The first note says “This is your hand, at the bottom. The other three players sit around you,” but the actionable instruction remains in the coach strip at the top. The player must read text in one place and then search a dense visual field for the referred object. There is no target-specific spotlight, leader, scrim, or anchored callout.

This matters because the table is already known to require aggressive responsive prioritization. Issue #32 moved previously face-up tutorial hands into Peek because permanently displaying everything made the table unreadable. The same principle applies cognitively: **information that can fit is not necessarily information that should compete for attention.**

### 2.4 Peek corrected a layout problem but exposed a teaching-model problem

Current Peek is a technically strong reading surface:

- it shows deliberately revealed tutorial hands at readable tile sizes;
- it pauses lesson pacing while open;
- it preserves engine redaction boundaries;
- it has coherent modal, keyboard, Back, and focus behavior;
- it explicitly says real play does not reveal these hands.

However, moving the hands behind Peek invalidated some lesson copy. Lesson 1 still says the other players’ tiles “are face up for the next few lessons”; lesson 4 says their hands “are still face up”. They are not. More importantly, showing all three hands is not necessary to explain the public-information decision most claims depend on. For a Pung, the learner needs to see **their two matching tiles plus the opponent’s public discard**. For a Chow restriction, they need **their two tiles, the public discard, and the source seat**. Opponents’ concealed holdings are not evidence a real player may use.

That makes Peek a candidate for optional explanation, not a core scaffold.

### 2.5 Orientation is currently navigation

The app’s current architecture uses physical orientation as a screen router:

- landscape → game table;
- portrait → settings/menu/Learn/rules/stats;
- the first-run screen explicitly tells the player that the menu is available by turning the phone upright.

The table’s need for landscape is well-founded: fourteen tiles cannot remain legible across a phone’s portrait width. The problem is not “landscape gameplay”. The problem is that **rotation itself is the primary menu command**. A player can be holding a live landscape table with no conventional visible route to the rest of the product, then rotate the physical device and get an entirely different information architecture.

The tutorial adds a second inconsistency: unlike the real table, lessons support portrait by wrapping the player hand to two rows. A novice can therefore learn on a portrait-shaped teaching surface and graduate into a landscape-only playing surface.

---

## 3. External evidence

### 3.1 Impeccable `/onboard`: optimize for the first value event

[Impeccable `/onboard`](https://subclaude.com/docs/onboard/) begins with one question: **what is the aha moment, and how fast can a new user get there?** It recommends progressive disclosure and smart defaults, and explicitly resists both an over-tutorialized product tour and a zero-guidance first screen.

Implication for Mahjong: the first-run flow should not be organized around the app’s feature inventory (“five lessons”, modes, settings). It should be organized around the earliest moment the player understands the **core decision loop**.

### 3.2 Apple: teach the core loop through action, then release control

Apple’s [Onboarding for Games](https://developer.apple.com/app-store/onboarding-for-games/) recommends:

- teach the game’s core loop;
- let objectives build on one another from basic to advanced;
- teach one short, clear step at a time;
- give the player an active role;
- move into self-directed play as soon as possible;
- allow experienced players to skip;
- place nonessential material after onboarding;
- keep tutorials replayable and reinforce later with contextual help.

Apple cites Clash Royale’s short staged tutorials and Carcassonne’s explicit “explain the rules / later” choice. The relevant lesson is not their genre or monetization model; it is the progression from **guided competency to unguided demonstration**.

Apple’s [Human Interface Guidelines: Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding) add two especially important rules for this project:

1. people generally learn better by safely performing the action than by viewing instructional material;
2. if instructional content refers to a specific interface area, place the instruction **near that area**.

Apple also recommends postponing nonessential setup/customization. Asking a true novice to choose a rules profile before they understand what a normal turn is violates that principle.

### 3.3 Celia Hodent / GDC: attention is the scarce onboarding resource

Celia Hodent’s GDC 2016 talk, [The Gamer’s Brain, Part 2](https://gdcvault.com/play/1022951/The-Gamer-s-Brain-Part), and her detailed [presentation notes](https://celiahodent.com/gamers-brain-ux-onboarding/) frame onboarding around attention, working memory, cognitive load, goals, and active learning.

The useful conclusions for Mahjong are:

- unattended information can effectively go unperceived;
- new tasks consume far more working-memory capacity than familiar tasks;
- onboarding should prioritize and pace learning rather than firing multiple novel inputs simultaneously;
- learning by doing gains meaning when the player understands **why** the practiced action matters;
- UX testing should ask players to explain the objective and why an interaction matters, rather than merely asking whether instructions seemed clear.

Hodent suggests treating roughly three effortful items at once as an upper bound while learning. Mahjong’s current opening can easily exceed that: unfamiliar tile faces, own-hand location, opponent seats, discard area, goal shape, named meld types, hidden-information exception, and coach-strip instructions all compete at once.

### 3.4 Tencent GDC 2024: Attraction, Goal, Effectiveness

Tencent’s GDC 2024 session, [Start Right, Start Fun](https://www.gdcvault.com/play/1034824/Start-Right-Start-Fun-Unveiling), reports an onboarding framework derived from user research and product work across 100+ free-to-play mobile games over eight years. Its A-G-E model separates:

- **Attraction** — catch and retain attention;
- **Goal** — make the game’s main goal understandable and motivational;
- **Effectiveness** — ensure tutorials actually help the player master basic content and get started.

The commercial F2P context is not Mahjong’s context, so retention monetization is irrelevant. The model is still useful as a diagnostic: the present Learn flow is strongest on tutorial mechanics (“Effectiveness”) but weaker on immediate **Goal** and attention direction. It explains *how* to perform several mechanics before ensuring the learner has a compact reason for doing them.

### 3.5 Roblox: highlight the target, teach just in time, help only when needed

Roblox’s [Onboarding techniques](https://create.roblox.com/docs/production/game-design/onboarding-techniques) documentation emphasizes three patterns:

- temporary visual guidance such as highlights and arrows;
- contextual / just-in-time tutorials triggered by normal play;
- timed hints for players who are actually stuck.

Its UI example is directly relevant: telling a player in text to find a control requires them to interpret the description and visually search the interface; spotlighting the control removes that search step. Roblox also argues that contextual instruction reduces cognitive load by delaying nonessential material until it can be used immediately, while timed hints preserve agency for players who can solve the task unaided.

For Mahjong this supports **graduated assistance**: clear target cue first when the interface itself is new, then less intrusive cues, then a delayed stronger hint only if the player hesitates.

### 3.6 Multimedia-learning evidence: spatial separation has a measurable cost

Richard Mayer’s [spatial contiguity principle](https://www.cambridge.org/core/books/abs/multimedia-learning/spatial-contiguity-principle/B9B79EDC777C375C7ED410B82EF80247) states that learners perform better when corresponding words and pictures are placed near each other rather than separated, because they spend less working-memory capacity visually searching and can hold the verbal and visual representations together.

Mayer’s broader review, [Using multimedia for e-learning](https://onlinelibrary.wiley.com/doi/full/10.1111/jcal.12197), reports evidence for signaling, spatial contiguity, segmenting, and pre-training among the principles that reduce extraneous processing or manage essential processing.

This provides a learning-science explanation for a concrete UI observation: a coach strip that says “look at the tile in the middle” is weaker than a short callout beside that tile plus a spotlight around it.

### 3.7 Platform guidance: landscape is defensible; rotation-as-menu is not required

The platform evidence does **not** require this game to support portrait gameplay.

- Apple’s [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) guidance explicitly allows experiences that need one orientation and says a landscape-only experience should work in both landscape directions.
- Android’s [Develop games for all screens](https://developer.android.com/games/develop/all-screens) documents landscape as a legitimate game orientation when the game depends on it.
- Apple’s [Game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls) treats secondary controls such as menus as part of the in-game landscape control layout.
- Apple’s [Menus](https://developer.apple.com/design/human-interface-guidelines/menus) describes in-game menus as ordinary discoverable controls that should remain easy to open and read.

The conclusion is therefore not “support the full table in portrait”. It is: **keep the game’s landscape spatial world coherent and provide normal in-world navigation inside it.** Requiring a physical rotation to discover settings or Learn is a product choice, not a platform requirement.

---

## 4. Product answers to Issue #33’s research questions

### 4.1 What is Mahjong’s first aha moment?

Not “I learned what a Pung is.” Not “I finished lesson 1.” Not “I won a scripted hand.”

The first aha is:

> **“I’m repeatedly drawing one tile and discarding one tile to turn my hand into four groups and a pair — and I can see why keeping one tile helps that goal more than keeping another.”**

This couples **goal** and **core loop**. “Four groups and a pair” without draw/discard is a static puzzle. “Draw one, discard one” without the target is arbitrary tapping. The aha requires both.

The design target is to create this understanding in the first **30–60 seconds**, with the first meaningful player action substantially earlier than the current five-lesson curriculum suggests.

### 4.2 What must a novice understand before seeing the full table?

Only a minimal spatial/goal schema:

1. **This row is your hand.** These are the tiles you decide with.
2. **Your target is four groups plus a pair.** Show the grouping visually before naming specialized group types.
3. **A normal turn is draw one, discard one.** The extra drawn tile creates the decision.
4. **The discard goes to the middle.** The centre is public history, not another hand.
5. **Three opponents sit around you; a visible turn marker tells you who is acting.** Their concealed tiles are not information you normally get.

Everything else can wait: faan arithmetic, winds, wall count, scoring patterns, full claim taxonomy, Chow source restriction, Kong replacement mechanics, statistics, rules profiles, and settings.

### 4.3 Should first-run onboarding be linear?

**Yes, for the novice path.**

The current lesson picker is appropriate as a permanent replay/reference surface, not as the first-run spine. A novice does not yet have enough schema to make “Four sets and a pair” versus “Taking other players’ tiles” a meaningful curriculum choice, and returning to a menu after every lesson turns continuity into administrative navigation.

First run should move continuously from orientation → first turn → first claim concept → first win → unscripted hand. It remains skippable, but skipping exits the sequence rather than requiring the player to select each next lesson manually.

### 4.4 Is a “Your table” / Lesson 0 required?

**Yes.** It should be short, interactive, and visually reduced — not a tour of every table component.

Its job is to establish the five-item schema above and produce the first draw/discard action. It should not teach settings, scoring, all claims, all tile categories, or every seat label.

Calling it “Lesson 0” is useful internally; player-facing copy should be closer to **Your table** or simply omit lesson numbering entirely on first run.

### 4.5 How should attention be directed?

Use an explicit attention hierarchy:

1. **Spotlight the target region** and visually quiet non-target regions.
2. Put the **short instruction adjacent to the target**, with a leader/anchor when necessary.
3. Keep only one primary instructional target at once.
4. Require the learner to perform the action where possible.
5. Confirm the consequence in the same region, then release the spotlight.
6. If the player does nothing, escalate with a timed hint rather than beginning with the most prescriptive hint.

The existing top coach may remain as global lesson chrome (Leave, progress, exceptional whole-table messages), but it should not be the primary location for object-specific instructions.

### 4.6 When should Peek appear, and what is it for?

**Not as a permanent first-run button and not as evidence for a normal claim.**

Peek’s legitimate role is an optional “x-ray” explanation for a learner who wants to understand an opponent action or revisit a teaching scenario. It should appear only when hidden information is the actual subject being explained, ideally focused on the relevant opponent rather than all three seats.

The mandatory novice path should teach claims from public information: own tiles + public discard + source seat. That gives the learner the correct information model from the beginning.

### 4.7 How should terminology be introduced?

**Concept/action first, conventional name second.**

Recommended progression:

- “group” and “pair” first;
- “run” before **Chow 食**;
- “three matching tiles” before **Pung 碰**;
- **Kong 槓** only when four matching tiles actually become relevant;
- **faan** at the first result/qualification moment, not in the opening mental model;
- do not introduce “shanten” in first-run onboarding;
- do not use “eyes 眼” as required novice vocabulary;
- winds and seat/round scoring vocabulary wait until they affect a decision or result.

The Chinese glyph belongs beside the conventional action name once introduced; it should not be another symbol the novice must decode first.

### 4.8 Novice versus rusty player

The two groups need different assistance.

**True novice:** needs the goal, spatial map, interaction grammar, hidden-information model, and first claims. Use the short linear path.

**Rusty / played before:** likely knows four-groups-plus-pair and basic claims but does not know **this interface**, this tap-tap discard interaction, current HKOS scoring profile, or where controls live. Offer a compact **refresher** path focused on table orientation and controls, with the full Learn curriculum available on demand.

**Confident player:** must be able to enter normal play immediately.

The first question should therefore segment by prior experience, not ask a novice to choose between internal rules profiles they cannot yet evaluate.

### 4.9 Keep portrait-menu / landscape-game?

**Replace the current rotation-as-navigation architecture. Keep landscape gameplay.**

Recommended model:

- landscape is the primary game shell;
- the table has a visible, conventional Menu/Pause affordance;
- settings, Learn, rules, and stats open as landscape sheets or landscape full-screen surfaces from that shell;
- rotating to portrait does **not** navigate somewhere else or silently switch information architecture;
- if portrait cannot support the current surface, preserve state and show a simple rotate-back holding state;
- first-run can render its initial experience choice in either orientation, but once interactive table teaching begins it establishes landscape once and stays there.

This removes repeated physical rotation as a navigation gesture while preserving the hard-won tile-legibility decision.

### 4.10 How should onboarding enter the first unscripted hand?

It should feel like **scaffolding being removed from the same game**, not a second graduation ceremony.

The current graduation rules-mode choice interrupts the strongest possible transfer moment. For a novice, choose safe defaults automatically (Beginner rules, Assist/Explain on, corner labels on, reduced claims if retained), state the one relevant simplification when it becomes relevant, and deal the unscripted hand immediately.

The last scripted action should flow into:

> **“Now you play. Nothing in this hand is scripted.”**

Then stop forcing actions. Contextual first-occurrence help remains available, but the player must make the decisions. This is the first real comprehension test inside the product.

---

## 5. What should remain from the current implementation

Issue #33 does not justify discarding everything built under #30. Several foundations are strong and should be treated as implementation assets for the next issue:

- arranged walls that still execute through the production engine;
- legal-action filtering that can only remove options, never invent legality;
- wrong answers that do not mutate the scenario;
- production table components rather than a fake teaching UI;
- replayable lessons and stored tutorial progress;
- the real-bot transition into unscripted play;
- accessible controls, focus handling, reduced-motion behavior, and Back handling;
- Peek’s redaction-safe mechanism, if retained for its narrower optional role.

The redesign is therefore a **teaching architecture correction**, not a request for a second game engine.

---

## 6. Assumptions that automation cannot validate

The following are hypotheses until human testing says otherwise:

- a novice understands the four-groups-plus-pair visual after the first presentation;
- the first draw/discard produces the intended aha rather than feeling like a forced answer;
- the spatial spotlight makes the table readable without over-dimming useful context;
- the learner can distinguish a public discard from an opponent’s concealed hand;
- delayed terminology improves retention rather than merely postponing confusion;
- a rusty player correctly self-selects the refresher path;
- removing the first-run lesson picker improves orientation without making replayability harder to discover later;
- a conventional landscape Menu affordance is more discoverable than the current rotate-to-menu behavior;
- after the scripted win, a novice can make an unprompted decision in a different hand;
- the Beginner transition feels like Mahjong with scaffolding rather than a different ruleset learned by accident.

These are exactly the kinds of questions the future comprehension test must measure behaviorally and through explanation. Tutorial completion rate alone would not answer them.

---

## 7. Research conclusion

The current onboarding has already solved much of the **mechanical** problem: safe scenarios, real rules, real controls, replayability, and a path into real play. Its main weakness is that it asks a novice to absorb the game at the information architecture’s scale rather than at the learner’s scale.

The redesigned first run should therefore:

- define the aha as **goal + draw/discard loop**;
- reach a meaningful action within the first tens of seconds;
- add a short **Your table** orientation before the full table competes for attention;
- make the novice path linear while keeping lessons replayable later;
- tether instruction to the object being learned;
- progressively disclose the full table and vocabulary;
- teach claims from public information;
- demote Peek to optional contextual explanation;
- segment novice, rusty, and confident players by prior experience;
- keep the table landscape but stop using physical rotation as primary navigation;
- move directly from the first scripted win into an unscripted hand with scaffolding fading rather than restarting.

Those decisions are specified as an implementation-ready product contract in [`ONBOARDING_DESIGN.md`](ONBOARDING_DESIGN.md).

---

## 8. Sources

Primary sources required by #33:

1. [Impeccable — `/impeccable onboard`](https://subclaude.com/docs/onboard/)
2. [Apple Developer — Onboarding for Games](https://developer.apple.com/app-store/onboarding-for-games/)
3. [Apple Human Interface Guidelines — Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding)
4. [GDC Vault — Celia Hodent, *The Gamer’s Brain, Part 2: UX of Onboarding and Player Engagement*](https://gdcvault.com/play/1022951/The-Gamer-s-Brain-Part)
5. [Celia Hodent — detailed notes for *The Gamer’s Brain, Part 2*](https://celiahodent.com/gamers-brain-ux-onboarding/)
6. [GDC Vault — Fan Yi & Xingyu Zhang / Tencent Games, *Start Right, Start Fun*](https://www.gdcvault.com/play/1034824/Start-Right-Start-Fun-Unveiling)
7. [Roblox Creator Hub — Onboarding techniques](https://create.roblox.com/docs/production/game-design/onboarding-techniques)

Supporting sources:

8. [Richard E. Mayer — Spatial Contiguity Principle, *Multimedia Learning*](https://www.cambridge.org/core/books/abs/multimedia-learning/spatial-contiguity-principle/B9B79EDC777C375C7ED410B82EF80247)
9. [Richard E. Mayer — “Using multimedia for e-learning”, *Journal of Computer Assisted Learning*](https://onlinelibrary.wiley.com/doi/full/10.1111/jcal.12197)
10. [Apple HIG — Game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls)
11. [Apple HIG — Menus](https://developer.apple.com/design/human-interface-guidelines/menus)
12. [Apple HIG — Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
13. [Android Developers — Develop games for all screens](https://developer.android.com/games/develop/all-screens)
