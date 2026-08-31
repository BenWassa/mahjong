# Mahjong, Hong Kong Old Style

**Product Requirements Document, V1**
Repo: https://github.com/BenWassa/mahjong
Status: vision locked, ready for build

---

## 1. Product definition

An offline Hong Kong Old Style mahjong game for a single player against three bots, built to be genuinely enjoyable and to teach the game to someone who does not yet know it.

**Audience:** one user, the author. Not a Play Store product. Not a portfolio piece.

**Done means:** installed on an Android phone, opens without internet, plays a full East round against three bots, and the author understands what happened.

**Design consequence of an audience of one:**
- No accounts, telemetry, onboarding funnel, monetisation, or store compliance work.
- No defensive UX for users who will never exist.
- Rules bugs are cheap. Correctness matters for learning, not for fairness disputes.

---

## 2. Non-goals

Explicitly out of V1, and out of the repo entirely until V1 is finished:

| Excluded | Reason |
|---|---|
| Multiplayer | Second engineering problem, zero benefit to the goal |
| Accounts, backend, database | Nothing to store off-device |
| 3D table, WebGL | Directly opposed to tile legibility |
| Currency, gacha, daily rewards, ranks | No meta-game |
| Ads | No |
| Riichi or other variants | One ruleset, done properly |
| Characters, avatars, voice lines | No |
| Achievements | Stats screen covers the useful part |

---

## 3. Rules profile

The single largest hidden risk in this project is that "Hong Kong Mahjong" is not one ruleset. This section is the contract. It goes in the repo as `docs/HKOS_RULES.md` before any engine code is written.

### Locked

| Setting | V1 value | Notes |
|---|---|---|
| Style | Hong Kong Old Style | Not New Style |
| Hand size | 13 tiles, 14 to win | |
| Tile set | 144, flowers and seasons included | 136 available as a setting |
| Minimum faan | 1 by default | 0 and 3 ("Classic") in settings |
| Match length | One East round by default | Single hand and full four-round also selectable |
| Melds | Chow, Pung, Kong | Standard claim priority |
| Flowers | Reveal immediately, draw replacement | |
| Dealer | Continues on dealer win, rotates otherwise | |
| Scoring | Faan, stacked where criteria co-occur | |

### Rationale for the two non-obvious defaults

**1 faan minimum, not the classic 3.** At 3 faan a learner repeatedly assembles a legal winning hand and is told no, without the vocabulary to understand why. 1 faan teaches the faan system while still rejecting worthless hands. Classic 3 faan is the graduation setting, and is labelled as such.

**144 tiles with flowers, not the simpler 136.** This is an engineering-order decision, not an authenticity one. Flowers touch the wall, the deal, the turn loop and scoring. Adding them on day one is cheap. Retrofitting them into a working engine means reopening tile conservation across four subsystems.

### Must be resolved while writing `HKOS_RULES.md`

Do not let these get decided implicitly by whichever code gets written first:

- **⚠️ Full faan table.** Every scored pattern, its faan value, and whether it stacks or excludes.
- **⚠️ Payment schedule.** Faan to points conversion, discarder penalty, self-draw payment, dealer multiplier.
- **⚠️ Faan ceiling.** Limit hands and the maximum, commonly 13.
- **⚠️ Do flowers count toward the minimum.** Common source of "wrong scoring" complaints.
- **⚠️ Special hands included.** HKOS keeps few. List them explicitly.
- **⚠️ Robbing a kong**, dead wall handling, exhaustive draw settlement.
- **⚠️ Seven flowers instant win:** in or out.

Reference: the Wikipedia Hong Kong mahjong scoring rules page as the primary source, cross-checked against the `hk-mahjong` library's implemented patterns. Where they disagree, the disagreement becomes a test case and a documented decision, not a guess.

---

## 4. Architecture

### Decision

TypeScript throughout. No Rust, no WebAssembly, no fork of an existing engine.

```
React + Vite UI  (TypeScript)
        |
   adapter API
        |
  Engine module   (pure TypeScript, zero UI imports)
        |
  hk-mahjong      (MIT, npm, faan scoring oracle)
        |
  Capacitor       (Android wrapper, added last)
```

### Why not the Rust + WASM fork

The recommendation to fork `igncp/mahjong` optimises for rules correctness insurance. With an audience of one, that insurance is not worth its premium:

- Every bug lands in an unfamiliar language behind a `wasm-bindgen` boundary.
- The fork carries a server, WebSockets and a web client, all of which get deleted.
- The engine itself is small. Wall, deal, turn order, claim resolution, meld legality, win detection and scoring is roughly 2,000 lines of TypeScript.
- The hardest and most disputed part, faan scoring, already exists as MIT TypeScript.

### Insurance retained

The narrow adapter is kept regardless. The UI knows nothing about engine internals.

```ts
newGame(config, seed): GameState
state(): PublicState          // redacted, what this seat can see
legalActions(): Action[]
act(action): GameState
scoreBreakdown(): FaanBreakdown
```

If the TypeScript engine proves inadequate, a different engine can be dropped in behind this interface without touching the UI.

### Engine constraints

- **Deterministic.** A seed reproduces an identical game, exactly.
- **Pure.** No timers, no randomness outside the seeded RNG, no DOM, no storage.
- **Redacting.** `state()` never returns information the seat should not have. Bots consume the same redacted view.

---

## 5. Game record

The engine emits a structured record from the first commit. This is one file inside the engine, written while the engine is being written, and it is the reason stats, replay and bug reproduction are nearly free later.

```ts
type GameRecord = {
  seed: string
  config: RulesProfile
  actions: TimestampedAction[]
  hands: HandResult[]      // winner, faan breakdown, payments
  completedAt: string | null
}
```

Everything downstream is a read over this log:
- Resume an interrupted game.
- Stats screen.
- Replay a hand to see what you should have done.
- Reproduce any bug from a seed.

Retrofitting this later is the painful version. Do it first.

---

## 6. Bots

**Bar for V1: competent heuristic.** Plays sensibly, does not need to beat a good human.

Required behaviour:
- Tracks shanten, discards toward the fastest reasonable hand.
- Claims Pung and Kong when it improves shanten or faan.
- Claims Chow only when it genuinely helps, not reflexively.
- Some awareness of dangerous discards late in the hand.
- Declares a win when legal.

Explicitly not required: neural policy, self-play training, expected-value simulation. `eugene-cheung/mahjong-bot` is a later upgrade path and an interesting benchmark, not a V1 dependency.

**Anti-requirement:** bots must not cheat. They see only the redacted state. This is checkable and belongs in the test corpus.

---

## 7. Interaction

### Orientation

- **Table: landscape.** Fourteen tiles must be simultaneously readable.
- **Menus, learning, stats, settings: portrait.**
- Orientation is a screen-level property. Wire it into both the router and the Capacitor config from the start.

### Discard

**Tap to select, tap again to discard.**

- First tap raises the tile and shows a clear selected state.
- Second tap on the same tile commits.
- Tap elsewhere in the hand moves the selection.
- No confirmation dialog. The raised state is the confirmation.
- Accidental discard is a release-blocking bug, not a polish item.

### Claims

Contextual only. No permanent control row.

- When a claim is available: 食 Chow, 碰 Pung, 槓 Kong, 過 Pass.
- When a win is available: 糊 Win, visually distinct and never adjacent to Pass.
- Controls must never cover the tiles the decision depends on.
- If nothing is claimable, play continues immediately with no prompt.

### Table contents

Visible at all times: opponents and their exposed melds, the central discard area, seat and round wind, tiles remaining, your hand, whose turn it is. Everything else is contextual.

---

## 8. Visual system

Traditional palette, defined as editable tokens. No hardcoded colours anywhere in the codebase.

### Sources

Antique HK sets: bone or ivory faces, bamboo or jade backs, engraving filled in vermillion, bamboo green and ink black, with cobalt framing on the White Dragon. Parlour tables are green felt.

### Tokens

Ships as `src/styles/tokens.css`. All values are starting points, tuned on device.

```css
:root {
  /* Table */
  --table-felt:        #14342A;  /* deep jade felt */
  --table-felt-deep:   #0E2620;  /* central discard well */
  --table-edge:        #0A1A15;

  /* Tiles */
  --tile-face:         #F4EBD9;  /* bone, never pure white */
  --tile-face-lit:     #FFF8EA;  /* selected or raised */
  --tile-edge:         #D9CBB0;
  --tile-shadow:       rgba(0,0,0,0.35);
  --tile-back:         #2E6B52;  /* jade back */
  --tile-back-alt:     #C08A4E;  /* bamboo back, alternate set */

  /* Engraving */
  --ink:               #1C1A17;
  --vermillion:        #C3282D;  /* dragons, 萬, bamboo 1/5/7/9 */
  --bamboo-green:      #2E7D4F;
  --cobalt:            #2B4C7E;  /* White Dragon frame */

  /* Interface */
  --brass:             #B08D3F;  /* seat and round wind markers */
  --text-on-felt:      #EDE5D5;
  --text-muted:        #9DAFA4;
  --focus-ring:        #E8C77A;
}
```

### Tile rendering

**SVG, not bitmaps.** Required, because the corner label is a toggleable layer over a shared tile body. A sourced image set cannot do this.

Tile component structure: body, engraving, optional corner label, state overlay.

### Release-blocking visual failures

Adapted from the original brief, these are gates rather than aspirations:

- A tile needs zooming to identify.
- The selected tile is ambiguous.
- Animation delays a decision.
- A modal covers tiles the decision depends on.
- Turn ownership is unclear.
- Faan appears as unexplained arithmetic.
- Any information is carried by colour alone. **Red and green are load-bearing in the tile faces. Nothing else may rely on hue.**

---

## 9. Learning layer

Toggleable in settings, **defaulting to on**, because the user does not currently know the rules.

### Two independent switches

**Assist** (highlighting and suggestion)
- Legal actions highlighted.
- Optional discard suggestion with a one-line reason.
- Waiting tiles shown when the hand is one away.

**Explain** (naming what happened)
- First occurrence of each concept gets a short plain-language note.
- Example, on a first available Pung: "You hold two matching tiles. Taking this discard creates an exposed set of three."
- Flowers, kongs, robbing a kong, exhaustive draw, dealer continuation each get one.

### Hard constraints

- **Assist must never be the only path to a move.** With assist off, every legal action stays reachable through normal interaction.
- No 30-screen tutorial. Learning happens inside real hands.
- Corner labels on tiles are a third, separate toggle.
- End of hand always shows the faan breakdown, itemised, assist on or off:

```
4 Faan
All Pungs      3
Seat Wind      1
```

- A static full rules reference exists, reachable from the menu, and is not the primary teaching mechanism.

---

## 10. Persistence

Local only. No cloud, no accounts.

| Stored | Purpose |
|---|---|
| Current game record | Resume after interruption |
| Completed game records | Stats and replay |
| Settings | Rules profile, assist toggles, tile labels |

**Stats scope:** hands played, hands won, win rate, average faan, most frequent scoring patterns, deal-in count. Nothing more. This is a read over the game records, built whenever, not a V1 blocker.

**Lifecycle:** Android can kill the app mid-hand. State must survive backgrounding, and the game record makes this a save-and-reload rather than a special case.

---

## 11. Test corpus

The single most important artifact in the repo after the rules spec. Written alongside the engine, not after.

| Area | Assertion |
|---|---|
| Tile conservation | 144 tiles accounted for across wall, hands, melds, bonuses and discards, on every action |
| Deal | Correct starting hands, dealer gets 14 |
| Flowers | Revealed and replaced correctly, including chains |
| Chow | Only the next player in turn order can chow |
| Pung and Kong | Correct priority, correct exposed state |
| Concurrent claims | Win outranks all other claims |
| Added kong | Robbing a kong resolves correctly |
| Win detection | Standard hands plus every agreed special hand |
| Faan | Every supported pattern individually tested |
| Stacking | Co-occurring patterns combine or exclude correctly |
| Minimum | Sub-minimum win is rejected |
| Dealer | Continuation and rotation correct |
| Exhaustive draw | Correct settlement and progression |
| Information | Bots never receive redacted information |
| Determinism | A seed reproduces an identical game |

Plus a seeded bot-versus-bot simulation harness looking for impossible states and crashes over thousands of games. Mahjong is exactly the kind of software where example tests are insufficient.

---

## 12. Build sequence

The project is a hobby with no timebox. **One gate is still non-negotiable:** the engine passes tile conservation and the seeded simulation before any visual work begins. Polishing a broken game is how hobby projects die, and a scoring bug found after the tile art exists is far more expensive than one found before.

1. **Rules spec.** Write `docs/HKOS_RULES.md`. Resolve every ⚠️ item in section 3. This is a research task, not a coding task.
2. **Engine core.** Tiles, wall, deal, turn loop, claim resolution, meld legality, win detection. Pure TypeScript, headless, deterministic. Game record from the first commit.
3. **Scoring.** Wire in `hk-mahjong`. Reconcile it against the rules spec. Every disagreement becomes a documented test.
4. **Test corpus and simulation. GATE.** Thousands of seeded bot-versus-bot games with zero impossible states.
5. **Bots.** Heuristic play against the redacted state.
6. **Interaction prototype.** Fake table, deterministic tiles, no styling. Validate tap-tap discard, claim controls and landscape hand legibility on the actual phone.
7. **UI build.** Real table, SVG tiles, tokens, transitions, sound and haptics.
8. **Learning layer.** Assist, explain, corner labels, faan breakdown, rules reference.
9. **Persistence and stats.** Resume, then the stats read.
10. **Android.** Capacitor, orientation config, lifecycle, haptics, offline verification, on-device testing.

---

## 13. V1 scope

| Ship | Do not build |
|---|---|
| HK Old Style, one documented ruleset | Other variants |
| 144 tiles, flowers | |
| 1 faan default, 0 and 3 in settings | |
| Single hand, East round, full game | |
| Three heuristic bots | Neural AI |
| Fully offline | Any network code |
| Landscape table, portrait menus | 3D |
| Tap-tap discard | |
| SVG tiles, toggleable corner labels | |
| Faan breakdown every hand | |
| Assist and explain, toggleable | Full tutorial flow |
| Rules reference | |
| Resume interrupted game | |
| Basic stats | Analytics |
| Haptics and tile sounds | |

---

## 14. Open items

Carry these into the build, do not let them resolve by accident:

- **⚠️ The full faan table and payment schedule.** Blocking item 1 in the build sequence.
- **Sound.** Tile clack, claim, win. Needs sourcing. Not a blocker, but silence makes the table feel dead.
- **Tile artwork.** 42 distinct faces plus flowers and seasons, as SVG. Largest single asset task in the project. Decide early whether to draw, adapt an open-licensed set, or generate.
- **Haptics vocabulary.** Which events vibrate, and how strongly.
