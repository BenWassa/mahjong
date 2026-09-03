# Mahjong production design

> Status: **authoritative for the production app** as of Issue #21 (V1.7.1),
> extended by Issue #9 (V1.8) for the contextual learning layer in §21, by
> Issue #10 (V1.9) for persistence and stats in §22, and by Issue #11
> (V1.10) for Capacitor Android packaging in §23, and by the Beginner mode and
> table de-clutter in §24. The real-device gate this
> document has always deferred to #11 remains open — see the foot of this
> document.
> **Issue #33 rebuilt first-run onboarding, orientation and navigation. For
> those topics [`ONBOARDING_DESIGN.md`](ONBOARDING_DESIGN.md) is the design
> authority and §26 records what was implemented; where §§21, 23–25 still
> describe the older first-run or portrait-menu behaviour they have been
> corrected in place rather than left standing.**
> Where this document and `app/` disagree, one of them is a bug. Where this
> document and [`HKOS_RULES.md`](HKOS_RULES.md) disagree about game behaviour,
> the rules contract wins and this document is wrong.

This records decisions, not aspirations. Every value below is implemented, and
most of them are asserted by a test named in the section that states them. The
sole exception is the human comprehension gate named at the end of §26, which
is required future evidence rather than a claim about the current build.

## Contents

- [1. What this product is](#1-what-this-product-is)
- [2. Visual principles](#2-visual-principles)
- [3. Table composition](#3-table-composition)
- [4. Responsive geometry](#4-responsive-geometry)
- [5. Safe areas](#5-safe-areas)
- [6. Touch targets](#6-touch-targets)
- [7. Colour](#7-colour)
- [8. Typography](#8-typography)
- [9. Spacing, shape and elevation](#9-spacing-shape-and-elevation)
- [10. Tile visual language](#10-tile-visual-language)
- [11. Player areas and opponents](#11-player-areas-and-opponents)
- [12. Discards](#12-discards)
- [13. Melds](#13-melds)
- [14. Action hierarchy](#14-action-hierarchy)
- [15. Tile states](#15-tile-states)
- [16. Overlays and results](#16-overlays-and-results)
- [17. Motion](#17-motion)
- [18. Accessibility](#18-accessibility)
- [19. PWA and Capacitor](#19-pwa-and-capacitor)
- [20. Specialist audits: what was taken and what was refused](#20-specialist-audits-what-was-taken-and-what-was-refused)
- [21. Contextual learning layer (#9)](#21-contextual-learning-layer-9)
- [22. Persistence and stats (#10)](#22-persistence-and-stats-10)
- [23. Capacitor Android packaging (#11)](#23-capacitor-android-packaging-11)
- [24. Beginner mode and the table de-clutter](#24-beginner-mode-and-the-table-de-clutter)
- [25. Learn to Play (#30)](#25-learn-to-play-30)
- [26. First run, orientation and navigation (#33)](#26-first-run-orientation-and-navigation-33)

---

## 1. What this product is

A single-player Hong Kong Old Style mahjong table, played in landscape on an
Android phone, offline, against three bots. Audience of one.

The design mode is **operate**, not persuade: the player is completing a task
(deciding a discard) many hundreds of times per session. Scanability,
consistency and legibility outrank expression. The product's character is
carried by the tiles and the felt, not by the interface chrome around them.

The interface is not the thing being looked at. The tiles are.

## 2. Visual principles

1. **Legibility is the first constraint and the last.** A tile that needs
   zooming to identify is a release blocker, not a polish item. Every other
   decision yields to this one.
2. **The felt is a surface, not a background.** Empty felt is legitimate; a
   table starts with an empty middle. Empty *containers* are not.
3. **No card unless it holds something.** Rounded rectangles that enclose two
   lines of text are the default failure mode of generated UI. Seats are
   labels on felt; the discard well is a recess in it.
4. **Nothing is carried by hue alone.** Red and green are load-bearing inside
   the tile faces because the traditional set makes them so. Nothing in the
   interface may add to that debt: every state also has a shape, a position,
   an elevation or a word.
5. **Nothing moves under the thumb.** Layout that changes while a decision is
   being made is a defect, whatever caused it.
6. **State the state.** Whose turn it is, what is on offer, what a tap will do
   next: said in words, not implied by styling.

## 3. Table composition

Landscape, four rows, top to bottom:

| Row | Height | Contents |
|---|---|---|
| Status strip | 26px fixed | Own seat wind, own score once non-zero, whose turn it is |
| Table top | remainder | Three opponents, the discard well, the round plaque |
| Claim band | 44px **always reserved** | Contextual Chow / Pung / Kong / Win / Pass |
| Hand row | tile height | The player's hand and their own exposed melds |

The three opponents sit where they sit at a table. Play passes to the next seat
index, which in Hong Kong Old Style is the player to the viewer's right, so
seat+1 is drawn on the right, seat+2 across, seat+3 on the left. This is why
Chow is only ever offered on a discard from the seat drawn on the left.

**The claim band's height is reserved whether or not it holds controls.** This
is the single most important layout decision on the table: a band that appears
when a claim opens would shift the hand upward at the exact moment the player
is reaching for it. When nothing is claimable the band is empty and play
continues with no prompt, as PRD §7 requires.

**The round plaque sits at the centre of the felt.** A real Hong Kong table
keeps the prevailing wind in the middle. It also answers a composition problem:
the centre of the table is legitimately empty at the start of a hand, and an
empty centre containing nothing reads as a layout that failed. The plaque
carries the round wind and the wall count, which is why the status strip does
not: they were previously stated twice.

## 4. Responsive geometry

Implemented in `app/src/game/geometry.ts` as a pure function of the viewport,
and asserted in `app/src/game/geometry.test.ts` across the device matrix. There
are no device breakpoints. There is one calculation.

### The rules, in order of authority

1. **The whole hand is visible at once and never scrolls.** A scrolling hand
   breaks tap targeting under a thumb.
2. **Tiles stay readable.** `MIN_TILE_W = 34px`. Below that a face is
   guesswork, so the layout gives up other things first.
3. **Geometry is stable inside a turn.** The hand is sized for 14 slots even
   while it holds 13. It shrinks only when a meld is exposed, which is a state
   change the player just caused.
4. **Spare width is not spent on stretching the hand.** `MAX_TILE_W = 56px`.

### The calculation

```
handSlots   = 14 - 3 × exposedMelds
availableW  = viewportW - safeLeft - safeRight - 16
widthLimit  = (availableW - meldStrip - gaps) / handSlots      gap tried at 4, 3, then 2
heightLimit = (availableH - 92) / 1.333                        92px is the table-top floor
tileW       = clamp(26, min(widthLimit, heightLimit), 56)
tileH       = tileW × 4/3
```

Opponent, discard and meld tiles are derived from `tileW` (×0.38, ×0.54, ×0.46,
each clamped), so the table reads as one set of objects seen at different
distances rather than as three unrelated tile sizes. The derivation is a
*ceiling*, not a scale: each has its own floor (§4a), and below it the layout
shows less rather than smaller.

### Why 56px

The #7 device gate passed at roughly 51px per tile (~13.5mm) with horizontal
room still to spare on the tested phone. 56px lands near 14.5mm, comfortably
above the accepted floor, and it guarantees a margin: at 915×412 an uncapped
hand computed to 60px and ran to within 3px of both screen edges, which put the
outermost tiles under the thumb's screen-edge travel and read as overflow.

### Where the spare width goes

To the discard well, which shows more history, and to the margins. Never to a
wider hand. `discardColumns` is capped at 14 so a wide phone deepens the pile
instead of drawing it as a single line across the table. The pile is bounded to
whole rows (`discardRows`), because a pile clipped through the middle of a tile
reads as a rendering fault.

### The verified matrix

| Class | Viewport | Result |
|---|---|---|
| Narrow phone | 640×360 | 40px tiles, fits |
| Typical modern phone | 915×412 | 56px tiles (capped), spare width to the well |
| Tall-aspect phone | 1024×420 | 56px tiles (capped) |
| Wide 21:9 | 1080×460 | 56px tiles (capped), widest pile |
| Typical, heavy insets | 915×412, 48px sides | 49px tiles, fits |
| Small landscape | 568×320 | 35px tiles, fits (tier `tight`) |
| Short/narrow landscape | 600×340 | 38px tiles, fits (tier `compact`) |

Portrait is reported as portrait and holds rather than squeezing: 14 tiles in a
412px width is 25px per tile, below the readable floor. It used to be routed to
the menu, which made rotating the phone a navigation command; since #33 it
shows a rotate-back notice over a table that is still mounted, and the menu is
reached from the table itself (§26).

## 4a. The responsive priority policy

Everything above sizes the hand. This decides what happens to the rest of the
table when the viewport cannot pay for all of it.

**Protected, in order:**

1. the player's hand
2. the current actions and claims
3. the discard well
4. exposed melds
5. opponent metadata
6. explanatory chrome

**A viewport that cannot pay drops whole bands from the bottom of that list
upwards. It does not scale everything down together.** A table where every
element is 15% smaller is a table where nothing is readable, which is the
failure this policy exists to prevent — and it is the failure the phone was
actually showing.

The policy is computed by `layoutPolicy()` in `game/geometry.ts` from the slack
left once the protected band is paid for at its floor:

```
PROTECTED_W = 14 × 34 + 13 × 2 + 16      the hand at the readable floor
PROTECTED_H = 26 + 44 + 45 + 92 + 12 + 8 status, band, hand, table top, gaps
widthSlack  = viewportW - insets - PROTECTED_W
heightSlack = viewportH - insets - PROTECTED_H
```

Each band is decided against the axis it actually costs — chrome is a strip
across the felt and is paid for in height; the seat rails stand beside the
discard well and are paid for in width. One blended number would drop a rail on
a tall phone that had width to spare.

| Band | Collapses at | What goes | What stays |
|---|---|---|---|
| Explanatory chrome | `heightSlack < 112` | The Explain banner, which is pinned over the felt | The concept is *not* marked seen — it is owed, and fires on the next screen with room for it |
| Opponent metadata | `widthSlack < 96` | Score readout, bonus-tile count | Wind, seat position, turn marker, concealed count |
| Exposed melds | `widthSlack < 24` | The melds as *drawn tiles* | A named count, and the width goes to the discard well |

The number of collapsed bands names the tier — `full`, `compact`, `tight` —
which is published on `.app[data-tier]`, read by the stylesheet, asserted by the
rendered QA sweep and reported by the layout HUD (§4b).

**Floors that stop the uniform shrink.** The discard tile floors at 22px, the
meld tile at 16px, the opponent tile at 14px. When the hand tightens the well
now shows *fewer* discards at a size still worth reading, rather than the same
number at a size that is not. The assist hint is deliberately *not* treated as
chrome: it lives in the claim band's unconditionally reserved space, so
suppressing it would buy no pixels and only take an aid away from the player who
switched it on.

## 4b. Layout diagnostics: `?layoutdebug=1`

A HUD, off unless the parameter is present, showing three kinds of number side
by side — because a responsive bug is almost always a disagreement between two
of them:

- **what the phone reports** — viewport, visual viewport, safe-area insets, DPR;
- **what the geometry engine decided** — tile sizes, tier and policy flags,
  slack, the breached minimums it could not pay;
- **what the browser actually drew** — measured rectangles for `.app`, `.coach`,
  `.table`, `.tabletop`, `.well`, the pile, the claim band, the hand row, one
  slot and the Peek panel, plus page overflow.

A tile computed at 40px and drawn at 24px is a stylesheet bug; a tile computed
at 24px is a geometry bug; a viewport 60px shorter than the screen is a
browser-chrome bug. Reading one of those three alone cannot tell them apart.

It **ships in the production bundle on purpose.** Gating it on `import.meta.env`
would confine it to dev builds, which is the one place it is least needed: the
phone runs the deployed PWA, and the whole point is to answer a responsive
question by reading a real device rather than by shipping another build. It is
instead gated on a query parameter nothing in the interface links to, read once
at startup and never written to storage — a normal launch cannot reach it, and a
link cannot leave it switched on. The rendered QA sweep asserts both halves: it
is there with the parameter and absent without it.

It is an instrument, not a surface: monospace, unstyled controls, a flat plate,
above every overlay including the result sheet, movable to either corner and
collapsible to one line — on a 320px-tall phone anything pinned over the felt is
in the way of the thing being diagnosed.

## 5. Safe areas

Read from a probe element, not assumed: the value of `env(safe-area-inset-*)`
is not otherwise available to script, and in **landscape** on an Android phone
it is the *left and right* insets that take width away from the hand.

- `.app` carries the insets as padding.
- Insets are subtracted from `availableW` before the tile size is computed, so
  a cutout costs tile width rather than clipping the hand.
- Overlays inset with `max(space, inset)` so a sheet never sits under a cutout.
- `viewport-fit=cover` is set, which is what makes the variables non-zero.

## 6. Touch targets

**44px minimum for anything tapped under time pressure.**

A tile may be *drawn* narrower than 44px on a small phone. Its hit area is
padded up to the floor by `.hand__slot::after`, so a 35px tile on a 568px-wide
phone is still a 44px target. Claim buttons, the result sheet's control and the
menu toggles all carry `min-height: var(--touch-min)`; the table's Menu button
makes the tile's bargain instead, because it lives inside a 26px status strip
and chrome height is the cheapest thing the table owns (§26).

The rendered QA pass measures the smallest effective target at every viewport
and every captured state, and fails the run below 44px. Since #33 it measures
controls by their padded hit area as well as tiles, so a control that pays the
floor through `::after` is credited with what the thumb actually meets.

## 7. Colour

Source palette is PRD §8 and is unchanged. Everything below it is derived.

**One theme.** The table is a committed dark world, chosen from the use scene —
a phone held in the hand, a felt table — not from category habit. There is no
light mode and no mid-page theme flip.

Three surface steps and no more: `--surface-table` (the felt),
`--surface-well` (the recess), `--surface-raised` (controls). Text is tinted
from the felt hue rather than grey, so it sits in the world instead of on top
of it:

| Token | Contrast on felt |
|---|---|
| `--text-primary` | 11.4:1 |
| `--text-secondary` | 7.6:1 |
| `--text-tertiary` | 5.6:1 |

`--brass` is the only accent, used identically everywhere it appears: the round
plaque, the active seat's rule, the turn marker, the selected-tile underline,
the Win control and the result sheet's total.

**Brass marks live state and the one affirmative control.** The turn marker,
the acting seat's rule, the selected tile's underline, the offered tile's
outline, the plaque's round wind and the Win button. A seat's own wind glyph is
*not* brass: it never changes value, and a static use of the accent trains the
eye to read brass as decoration rather than as "this is live now", which costs
the signals that are load-bearing.

## 8. Typography

**No webfont.** The PWA must work offline with no runtime network request, and
a CJK-capable face is megabytes. The display voice of this product is the
engraved tile face; the interface label is not competing with it.

- `--font-ui`: the platform sans, for interface text.
- `--font-han`: the platform CJK face, for tile engraving, the wind glyphs and
  the claim controls (食 碰 槓 過 糊). Every Android device ships one.

Five sizes, three weights, and a real step between labels and values: the
status strip previously ran six tokens at one size and gave the eye nowhere to
land. Numerals that change in place are `tabular-nums` so a score or a wall
count cannot reflow its neighbours.

## 9. Spacing, shape and elevation

- **Spacing**: one 4px-rooted scale that stops at 32px. Landscape phone play is
  vertically tight; anything larger is a layout error.
- **Shape lock**: two radii. `--radius-tile: 4px`, because a real tile has a
  rounded edge, and `--radius-control: 6px`. Nothing invents a third.
- **Elevation**: every shadow carries an offset and a blur. A zero-offset
  coloured halo is decoration, not depth, and does not appear.

## 10. Tile visual language

Four layers, as PRD §8 requires: **body, engraving, optional corner label,
state overlay**. Drawn as SVG on a shared 60×80 field.

The body is a raised rim around a recessed face with a single highlight along
the top edge. Without that edge a bone tile on bone-lit felt goes flat.

**Suits are separated by form before colour.** Characters carry a numeral over
the 萬 radical; dots are counted circles; bamboo are counted culms; honours are
single glyphs. A player who cannot see hue can read every tile in the set.

Decisions taken during the specimen audit (`app/specimen.html`, dev only,
rendered at 56px, 30px and 22px):

- **One Bamboo is the sparrow.** It is a convention players read instantly, and
  a ninth culm would be novelty at the cost of it. Redrawn as a bold silhouette
  with almost no interior detail so it survives 22px inside a meld.
- **Nine Bamboo takes the traditional red outer columns.** Six and Nine were
  the closest pair in the set at meld size; they now differ in ink as well as
  in row count, before a player has to count anything.
- **Three Dots is one hue.** It was the only face in the set using three
  colours and read as an error rather than as decoration.
- **The White Dragon is a cobalt double frame.** Its blankness is the identity,
  so the frame is heavy enough to read as deliberate rather than as a tile that
  failed to render.
- **Flowers and seasons differ in numeral shape**, not in ink: a season's index
  sits in a ruled box, a flower's is plain.

**Corner labels are an independent layer.** They never replace or distort the
face; the traditional artwork stays canonical, per the #8 tile-learning
decision. Three modes: off, rank, rank and suit.

## 11. Player areas and opponents

All three opponents use one component. The table reads as one thing treated
consistently, not as three variations.

**An opponent's concealed hand is a count with a stack glyph, not thirteen
drawn tile backs.** The count is the entire information; the backs would spend
the width the exposed melds need in order to stay readable at phone size.

A seat shows: seat wind glyph, position (Left / Across / Right), labelled
score **once it is non-zero**, concealed count, exposed melds, and a **count**
of bonus tiles.

**A score readout waits for a score.** All four seats begin a match at zero,
and a labelled readout of a value that does not exist yet is a container around
nothing (§2.2). The label itself is not the problem and is not removed:
audit finding F-06 stands, and the moment there is a number it is labelled.

**Bonus tiles are a labelled count, not drawn faces.** This is the judgement
this section already makes about an opponent's concealed hand, applied
consistently: the count is the entire information, the player cannot act on a
bonus tile, and up to eight drawn faces per seat spend the width the exposed
melds need in order to stay readable. Every individual bonus tile is itemised
on the result sheet (§16), which is where its score is settled.

**Turn ownership** is a brass rule above the acting seat's label, plus the
words in the status strip. A rule has a shape, so the signal survives without
colour vision, and it needs no box around the seat to hang on.

## 12. Discards

The well is a recess in the felt carried entirely by a radial darkening. It has
no border: a visible boundary drawn around an empty centre is a container
around nothing, which is exactly what it looked like before.

- The pile is bounded to `discardColumns × discardRows` and shows the most
  recent tiles. Recent history is what a decision uses.
- **A claimed tile is not drawn in the pile.** It is in the claimer's exposed
  meld, which is where a player looks for it. Drawing it in both places left a
  greyed tile in the pile that read as broken and duplicated a tile already on
  show a few centimetres away.
- The most recent unclaimed discard carries a brass outline, so the pile has a
  reading order.

**The offered tile** — the tile a claim decision turns on — is drawn at hand
size, lit and outlined, standing on the felt rather than inside a panel. The
plaque and the offer share one reserved slot sized to the taller of the two, so
swapping between them does not shunt the pile up and down.

## 13. Melds

The viewer's own exposed melds share the hand row rather than taking a row of
their own, because vertical room is what the claim band already spends. The row
reserves the kong width (4 × 22px) per meld so a kong cannot overflow it.

A concealed kong shows its two end tiles face down around its two visible ones.
That is the conventional reading and needs no legend beside it.

## 14. Action hierarchy

The claim band, left to right: **Win, Kong, Pung, Chow, [gap], Pass**.

- **Win is the only filled control on the table.** It is the only affirmative
  action and it ends the hand.
- **Pass sits at the opposite end from Win**, separated by a flexible gap.
  #7 found the two adjacent to be a defect. In landscape the two ends of the
  band are where the two thumbs already are.
- **Several chows can be legal on one discard.** Each button shows the two
  tiles it would spend, at discard size, so the shapes are told apart by what
  they cost rather than by their order in the row.
- Controls never overlap the tiles a decision depends on. The rendered QA pass
  asserts this geometrically at every viewport and fails the run otherwise.

**Beginner's band is reduced to Win, Pung and Pass.** Chow and the three kong
declarations are hidden — a presentation filter over actions the engine has
already declared legal, never a second opinion about legality. Because the
engine holds a claim window open until every responder answers, hiding a
player's only real option would stall the table permanently, so the session
answers such a window with a pass on the player's behalf, on the same clock the
bots use. That pass is **recorded in the game record**: `replayGame`
reconstructs a resumed match from the recorded action list, and a pass that
happened but was not written down would make a saved match fail to replay,
which the persistence layer treats as corruption. `showAllClaims` restores the
full band without leaving Beginner's rules.

## 15. Tile states

| State | Signal |
|---|---|
| Rest | Bone face |
| Selected | Lifted 14%, lit face, brass underline in the gap it left, `aria-pressed` |
| Pending (offered) | Hand size, brass outline, raised shadow, `role="status"` |
| Not discardable | Reduced opacity **only while a discard is actually being chosen** |
| Face down | Jade back, named "Face-down tile", never the tile behind it |

**The hand is never dimmed as a whole.** When nothing at all is discardable the
player is not choosing a discard, they are reading their hand to decide a
claim. #7 found that dimming the hand then obscures the very tiles the claim
depends on. The rule is implemented as `discardable.size > 0` gating the
disabled styling, and it is regression-tested.

## 16. Overlays and results

There is exactly one overlay: the end-of-hand result. It is the one moment the
game may interrupt, because the hand is over and there is nothing behind it to
obscure.

- The faan breakdown is **itemised every hand**, assist on or off. A total with
  no working is the unexplained arithmetic PRD §8 calls a release blocker.
- Payments are listed per seat, by position, signed.
- A real dialog: `role="dialog"`, `aria-modal`, focus moved to the confirming
  control on open and trapped while it is up.
- It scrolls internally rather than growing, so a long limit hand cannot push
  its own button off a 320px-tall viewport.

## 17. Motion

Every animation is justified by frequency. Durations are tokens; no component
invents one.

| Event | Frequency | Treatment |
|---|---|---|
| Press feedback | constant | `scale(0.97)`, 110ms |
| Tile lift on select | tens per hand | `translateY(-14%)`, 160ms ease-out |
| Claim controls appearing | tens per hand | opacity and 5px rise in reserved space, 160ms |
| Offered tile arriving | tens per hand | `scale(0.94) → 1` with opacity, 220ms |
| Turn marker | constant | colour only |
| Result sheet | once a hand | opacity and 8px rise, 260ms |
| A tile joining the discard pile | ~30 per hand | **none** |

Rules:

- **`ease-in` is never used on entering UI.** It delays the moment the player
  is watching. Custom curves: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`.
- **Never from `scale(0)`.** Nothing in the world appears out of nothing.
- **Only `transform` and `opacity`** are animated.
- **No animation gates a legal action.** Every one of these is a transition on
  an element that is already interactive.
- **No screen shake, no particles, no squash and stretch, no reward
  explosion.** This is mahjong, not an arcade game. Feedback is layered but
  subtle, transient, and proportional to the event.

**Reduced motion** (`prefers-reduced-motion: reduce`) drops durations to 1ms
and removes every transform-based movement, but keeps the selected-tile lift.
The lift is the confirmation that a tile is armed to be discarded; removing it
would remove a safety affordance rather than an ornament. It simply arrives
without a transition. Reduced motion means fewer and gentler animations, not
zero.

## 18. Accessibility

- **Semantic controls.** Every hand tile is a real `<button>`; every claim is a
  real `<button>`. Nothing interactive is a `div`.
- **Accessible names.** Every tile has a full spoken name ("Three of Bamboo"),
  never an abbreviation. All 42 faces have distinct names, asserted in
  `app/src/components/render.test.tsx`.
- **State in the name.** A selected tile announces "selected. Tap again to
  discard." A claim announces the tiles it would spend.
- **Non-colour differentiation** for every state, per §15 and §11.
- **Contrast** per §7; body text is at or above 7.6:1.
- **Live regions**: the turn readout and the offered tile are `role="status"`.
- **Focus**: `:focus-visible` only, so a thumb never leaves a ring on a tile
  and a keyboard walk always shows one. The result dialog moves and traps
  focus.
- **Screen-reader economy**: the discard pile is one labelled group carrying
  its count and its most recent tile; the individual pile tiles are
  `aria-hidden`. Thirty tile names read in sequence is noise, not access.
- **No hidden-information leak**: an opponent's `concealed` is `null` in the
  redacted projection and nothing in the UI can render what it does not have.
  Asserted in `app/src/game/session.test.ts`.

Landscape is the gameplay orientation and the interaction model is touch. The
keyboard path exists and is coherent, but the layout is not compromised to
pretend desktop keyboard use is primary.

## 19. PWA and Capacitor

- **Manifest**: `display: standalone`, `orientation: landscape`, scoped and
  started at `./` so it works under the GitHub Pages project path.
- **Icons**: one SVG source, rendered to 192, 512 and a maskable 512 inset to
  the safe zone by `app/scripts/make-icons.mjs`.
- **Service worker**: generated at build time from the real bundle manifest by
  a plugin in `app/vite.config.ts`, so the precache list can never drift from
  what was built. Cache-first for everything; navigations fall back to the
  cached shell. There is no runtime network dependency, so being offline is
  the normal mode rather than a degraded one.
- **Capacitor packaging** is built; see §23. Orientation is a screen-level
  property; safe-area handling is inset-driven rather than assumed; there is
  no absolute pixel positioning to re-tune; and the `theme-color` and
  background colour match the felt, carried into the native splash too — see
  §23 for what changed to make that true rather than assumed.
- **GitHub Pages deployment** (#26): `.github/workflows/pages.yml` builds
  `app/dist` with `npm run check` and deploys it to
  `https://benwassa.github.io/mahjong/` on every push to `main` touching
  `app/`, `src/`, or `docs/HKOS_RULES.md`. A `verify` job then runs
  `app/scripts/pwa-check.mjs` against that live origin, so a future change
  cannot make Pages silently serve anything other than the production PWA.
  The disposable #7 prototype does not deploy to Pages.

## 20. Specialist audits: what was taken and what was refused

Audited against Impeccable, Taste v2, Mobile Taste, the Emil Kowalski animation
standards, and the gamedev game-ui-ux and game-feel skills. Findings were
synthesised into the single design above rather than applied one at a time.

### Taken

| Source | Finding | Change |
|---|---|---|
| Impeccable | Cards as the lazy container; nested cards always wrong | Seats became labels on felt; the well became a recess; the offer panel was deleted |
| Impeccable | Depth needs offset plus blur, not a coloured halo | Elevation scale rebuilt |
| Impeccable | Theme the browser surfaces you did not draw | Selection, caret, scrollbar and focus ring themed from the palette |
| Impeccable | Obvious scale and weight steps | Status strip labels demoted, turn state promoted |
| Taste v2 | One accent used identically; one radius system | Brass is the only accent; two radii |
| Taste v2 | Motion must be justifiable in one sentence | Motion budget table, §17 |
| Taste v2 | Empty, loading and error states provided | Empty pile, opponent-turn and claim-open states designed |
| Taste v2 | `100dvh`, never `100vh` | Applied |
| Mobile Taste | 44pt targets with hit-slop | `.hand__slot::after` pads the hit area past the drawn tile |
| Mobile Taste | Safe-area insets, never magic padding | Probe-read insets, §5 |
| Mobile Taste | Gray soup; token discipline | One text ramp tinted from the felt hue |
| Mobile Taste | Press feedback on everything pressable | Tiles answer the thumb, not just buttons |
| Emil | `ease-in` never on entering UI; strong custom curves | Easing tokens |
| Emil | Never `scale(0)`; start at 0.94 to 0.97 | Offer entrance |
| Emil | Frequency table decides whether to animate at all | No entrance on pile tiles |
| Emil | Animate only transform and opacity | Enforced |
| game-ui-ux | Anchors and containers, never absolute pixels | One geometry function, no breakpoints |
| game-ui-ux | Event-driven UI, not per-frame polling | The session pushes snapshots; React subscribes |
| game-ui-ux | Screen stack, initial focus, safe area | Result dialog focus; insets |
| game-feel | Feedback is transient and returns to rest | Every state animation settles |
| game-feel | Scale juice to event importance | Result sheet is the only slow moment |

### Refused, with reasons

- **Taste v2's "never hand-roll SVG; use an icon library".** The tile faces are
  the product's content, not icons. PRD §8 requires SVG specifically so the
  corner label can be a toggleable layer over a shared body, which a sourced
  image set cannot do. Project specification wins.
- **Taste v2's whole framework.** Its own scope section excludes dense product
  UI and native mobile. It was used as an anti-slop critic, which is what it
  was asked to be, not as a second art director.
- **Mobile Taste's React Native and Expo implementation.** Platform-independent
  reasoning only: safe areas, ergonomics, target sizes, motion hierarchy,
  design-system discipline. No Expo, no Reanimated, no React Native. The
  accepted architecture is React + Vite, per PRD §4.
- **Impeccable's "source a display face whose character matches the
  lettering".** Correct for a marketing page; wrong for an offline PWA whose
  display voice is a CJK-bearing tile face. See §8.
- **game-feel's screen shake, hit-stop and squash and stretch.** Explicitly out
  of scope for this product. A discard is not a hit.
- **Material's component language.** Android platform correctness constrains
  this interface — targets, insets, system bars, dialog behaviour — but does
  not define its visual identity. This is a mahjong table, not a Material demo.

---

**A 136-tile set for Beginner mode.** The engine supports it and the gate
covers it, but it is the wrong lever for a beginner. `scoring.ts` awards an
unconditional 1-faan "No Flowers" 無花 item only under the 144-tile profile and
returns no bonus items at all under 136, so the same hand would score *lower*
with a *shorter* breakdown in the mode meant to make winning feel reachable —
and stats would stop being comparable between the two tables. It would also
delete the `flowers-replacement` learning concept, which is the opposite of
what the mode is for. The clutter flowers actually cause is three seats of
drawn faces, which is a visual problem with a visual fix (§11, §24).

**A single-hand match for Beginner mode.** `detectConcepts` fires
`dealer-rotation` when the hand index advances, which never happens in a
single-hand match, so the shorter match would teach one concept less.

**Progressive unlocking of Chow and Kong after N hands.** It needs a persisted
counter and a threshold with no principled value, and it changes the rules of
the table under a player who did not ask for it, mid-session. The player is the
only party who can tell when they are ready, so it is a visible toggle (§24).

**Locking the Assist and Explain toggles in Beginner mode.** §21 carries "all
three learning aids disable independently" as an exit criterion and PRD §9
makes it a constraint. Entering Beginner *sets* them on, which gives the
requirement its actual value — nobody plays a first hand with the aids off by
accident — without breaking either document.

## 21. Contextual learning layer (#9)

Three independent controls, each default on for the author's initial learning
period, none ever required to make a legal move: **Assist**, **Explain**, and
**corner labels** (§10). All three switch off independently from the
menu, which is already this app's settings surface (§1) — no new landscape
chrome was added, so the validated table from §3–§17 is unchanged.

**Assist** decorates options the player could already see and take; it never
gates one. A legal claim carries one more non-colour signal — a fine brass
ring, the same accent used everywhere else (§7) — layered onto the button it
already draws. The hand's own tile states stay exactly the closed set §15
defines: a second visual tile state was considered and rejected, because the
claim band's reserved empty space (§3) already had room for a precise,
screen-reader-legible text alternative that a pseudo-element ring on an
opaque tile face cannot give for free. That space shows, in the two moments
that are otherwise blank:

- **On the player's own discard turn**, a suggested discard and a one-line
  reason. The suggestion is the same heuristic bot every opponent uses
  (`src/bots/heuristic.ts`), asked to choose from the player's own
  already-visible hand — never a second implementation of a bot's strategy.
  Only the reason is composed in the app, from hand-shape facts (shanten
  distance, adjacency), not from the bot's internal scoring weights.
- **At every other moment**, a waiting-tiles readout, when the hand is at a
  resting count and tenpai. Both this and the below-minimum-faan Explain
  concept reuse `MahjongGame.waitingTiles` / `.isStructurallyComplete`
  (`src/engine/learning.ts`) — additive, read-only engine methods that call
  the same structural and scoring evaluators the engine uses to decide real
  legality. Nothing in the UI re-derives a rule.

**Explain** shows a concise, first-occurrence, plain-language note for each
required concept, once per session, never again. Five surface as a small
non-modal banner (§ below) pinned above the table, positioned so it never
overlaps the hand, claim band or discard well and never gates a legal action;
it clears itself after a few seconds. Three — self-draw vs. discard, the
itemised faan breakdown's "stacking", and an exhaustive draw — are shown as a
quiet aside under the result sheet's own content (§16), because that is
already the contextual moment for them.

```
.explain {
  position: absolute; top: max(space-5, safe-top); left: 50%;
  transform: translateX(-50%);
  width: min(420px, 100% - space-8);
  background: surface-overlay; box-shadow: shadow-lifted;
}
```

**The rules reference** renders the bundled text of `docs/HKOS_RULES.md`
verbatim, through a purpose-built markdown-lite reader
(`app/src/game/markdown-lite.ts`) rather than a hand-transcribed copy: the
document is imported as a raw string at build time
(`app/src/game/hkosRules.ts`), so the reference is the same bytes as the
rules contract and cannot silently drift from it. It is reachable from the
menu (§26) and works fully offline, like the rest of the PWA (§19).

### Exit criteria carried forward from #9

- A first-time player can understand why a core action occurred, without a
  pre-game tutorial flow.
- All three learning aids disable independently and default on.
- Traditional tile faces remain visually primary; corner labels are still the
  only layer added over them (§10).
- The rules reference matches `docs/HKOS_RULES.md` exactly, by construction.

---

## 22. Persistence and stats (#10)

Local only, three `localStorage` keys under a versioned `mahjong:v1:` prefix
(`app/src/game/persistence.ts`), no cloud, no accounts, no telemetry:

- **Settings** — the Assist, Explain and corner-label toggles (§21, §10), plus
  the table mode and whether the claim band is reduced (§24). Loaded once at
  startup and written back whenever any of them changes.
  A rules profile is still not stored: it is *derived* from the mode
  (`MODE_RULES` in `app/src/game/modes.ts`), and every match already carries
  the profile it was dealt under in its game record's `config` field.
  Persisting a second copy would let the two disagree.
  The blob is at `version: 2`. A stored `version: 1` blob is migrated rather
  than discarded — the shape check is strict, so without a migration every
  existing player's toggles would silently reset. A v1 blob means someone who
  has already played, so it migrates onto the **standard** table with the full
  claim set and is never shown the first-launch question. The `mahjong:v1:`
  key prefix is deliberately unchanged: it versions the store, `version`
  versions the blob, and bumping the prefix would orphan the in-progress match
  and the completed history.
- **Current game** — the one in-progress match's `GameRecord`
  (`src/engine/types.ts`), overwritten after every action. This app seats one
  table at a time, so there is exactly one resumable slot.
- **Completed games** — an array of finished `GameRecord`s, appended to on
  match completion and capped at 500 entries (oldest dropped first).

**Resume** reuses the engine's own seed-plus-actions reconstruction
(`replayGame`, `src/engine/adapter.ts`) rather than a second snapshot format:
on launch, `GameSession` is handed the stored current-game record and
replays it through the real reducer. `replayGame` already re-derives the
record from scratch and diffs it against what was stored (RULE-ENGINE-REPLAY
in `docs/ENGINE_ARCHITECTURE.md`), so a tampered or version-incompatible
record is caught by the engine itself, not by a second ad hoc check in the
app. Any failure — corrupt JSON, an unrecognised shape, a replay mismatch —
is treated identically: the record is discarded and a fresh match starts.
Resuming can only ever produce the exact table that was interrupted or a
brand-new one; it can never produce a corrupted one.

A match already marked `completed` is never resumed, even if a stale copy is
still sitting in the current-game slot — it is history, not a live table.

**Finishing a match.** The engine offers no further action once a match ends
(`legalSystemActions` returns `continue` only from `hand-ended`, never from
`match-ended`), so "Finish match" on the result sheet (§16) now starts the
next match with a fresh seed instead of calling the same no-op `continue`
hand-ended uses. By the time the button is live, the finished record has
already moved into completed history and the resumable slot has already been
cleared — this is what makes "completed records remain readable" true rather
than aspirational.

**Stats** (`app/src/game/stats.ts`) are a pure function over the completed
records array: hands played, hands won, win rate, average faan (over the
player's own wins), the player's most frequent scoring patterns, and deal-in
count (a hand where the player's own discard, or a kong of theirs that was
robbed, supplied the winning tile). The function never reads storage or the
live session itself, so it structurally cannot influence gameplay. It is
read, not derived incrementally, by a **Stats** screen reachable from the
menu (§26) — the same surface as Assist, Explain, corner labels and the rules
reference — and reuses that reference's full-screen shell
(`.rules`, `app/src/styles/learning.css`) rather than introducing a second
overlay chrome.

### Exit criteria carried forward from #10

- A forced reload or backgrounding mid-hand restores the same table.
- Completed records remain readable across app restarts.
- Corrupt or incompatible local data fails safely — a fresh match, never a
  crash or a corrupted engine state.
- Stats are a pure read over completed records and cannot affect gameplay.

---

## 23. Capacitor Android packaging (#11)

One React + Vite app, two builds. `npm run build` (base `/mahjong/`) still
ships the GitHub Pages PWA exactly as before; `npm run build:capacitor`
(base `./`, output to `dist-capacitor/`) is new — a root-relative
`/mahjong/…` asset URL 404s inside Capacitor's local webview, which serves
the app from its own root, not a Pages subpath. `npm run cap:sync` builds
that and copies it into the native project with `cap sync`; `npm run
cap:android:debug` does the same and then runs the Gradle debug build.
Nothing in `src/` branches on which build produced it — the difference is
entirely in `vite.config.ts`'s base-path selection.

**Identity.** `capacitor.config.ts`: appId `com.benwassa.mahjong`, appName
"Mahjong", matching the PWA manifest's `short_name`.

**Orientation is deliberately not locked** at the Android Activity level.
The table is landscape-only, and since #33 portrait no longer routes anywhere
— it holds the live table and asks for the phone back (§26), which is a thing
the web layer does for itself in either container. Locking `MainActivity`
to landscape would make that whole menu unreachable on Android, so it is
left at Android's default ("unspecified"), and `useIsLandscape()`
(`app/src/App.tsx`) stays the only place orientation is judged, for both
surfaces alike.

**Template gaps the generated project shipped with, fixed:**

- `styles.xml` referenced `colorPrimary`, `colorPrimaryDark` and
  `colorAccent` with no `colors.xml` defining them — a build-time failure
  waiting to happen. Added, matching the felt and brass palette (§7) rather
  than Capacitor's stock blue.
- The default splash art is a generic blue Capacitor logo on white — the
  "does not flash a different world" claim in §19 was not yet true for the
  native shell. `app/scripts/make-splash.mjs` renders the splash at every
  density Android's template generated (same file, same dimensions, real
  content) from the same `icon.svg` source the PWA icons already come from:
  the felt background colour and one tile face, centred.

**Haptics** (`app/src/game/haptics.ts`) are the whole of what #11 scoped for
native feedback: a light impact on committing a discard, a medium impact on
taking a claim (not a pass), and a success/warning notification on the
viewing seat's own hand result. This is deliberately Capacitor's own fixed
`ImpactStyle`/`NotificationType` vocabulary and nothing more — #11 carried no
decided haptic vocabulary beyond "native haptics", so nothing here invents
one. `@capacitor/haptics` ships a web implementation that falls back to the
Vibration API or silently no-ops, so the same call sites run unbranched on
the PWA; every call is fire-and-forget with its rejection swallowed
(`app/src/game/haptics.test.ts`), so a platform with no vibration hardware
can never turn a haptic into a gameplay failure.

**Sound is not implemented.** #11 inherited this from #8 as an open item:
no tile-clack or table sound assets exist anywhere in this repository, and
sourcing or generating them is outside what this work can responsibly do
unattended — licensing an asset, or synthesising one that reads as a tile
rather than noise, is a judgement call for whoever ships it. The hook point
is obvious (the same interaction and result call sites haptics uses) once
assets exist; nothing about their absence blocks anything above.

**Automated verification**, all offline and dependency-light:

- `npm run cap:check` — builds the Capacitor bundle, syncs it, and statically
  checks the result (`app/scripts/capacitor-check.mjs`): the synced assets
  match the current build, the manifest declares the app's own identity and
  no permission beyond the `INTERNET` a local WebView needs to load its own
  bundled files, and the template's `colors.xml` gap stays fixed. No JDK, no
  Android SDK, no network to Google's Maven repository required — this runs
  anywhere Node does, including a sandboxed session with no egress to
  `dl.google.com`.
- CI's `android` job (`.github/workflows/ci.yml`) does the real compile —
  `./gradlew assembleDebug` on a GitHub-hosted runner, which carries a
  preinstalled Android SDK and ordinary internet access — and uploads the
  resulting debug APK as a workflow artifact on every push and PR.
- `npm run qa:all` (visual QA, PWA installability/offline, accessibility)
  still governs the shared web layer both surfaces run; §22 covers what it
  proved after #10.

**What none of this proves.** A green `cap:check`, a successful CI
`assembleDebug`, or an installed emulator session is evidence the app is
correctly packaged and wired — not evidence of how it feels or reads on a
physical phone. The real-device gate below is unchanged by any of the
above and remains the actual acceptance bar for #11.

---

## Real-device gate

Emulation settled the geometry, the overflow, the target sizes and the
occlusion rules. It cannot settle the following, which remain for #11 and must
not be reported as verified until a phone has actually done them:

1. **Physical tile readability** at arm's length, in daylight and under glare.
2. **Thumb comfort and reachability** for Win and Pass at the two ends of the
   claim band in a two-handed landscape grip.
3. **Accidental discard rate** across roughly twenty real discards.
4. **Perceived responsiveness** of the lift and of the bot pacing.
5. **System bar and safe-area behaviour** installed, in landscape, with
   gesture navigation on.
6. **Motion feel** at the shipped durations on the device's actual refresh rate.
7. **Overall table density** at the real pixel density.

---

## 24. Beginner mode and the table de-clutter

Two changes that travel together: a mode a new player can learn at, and a pass
over the default table for labels that were saying nothing.

### Entry

One screen, one question, two buttons, no steps — PRD §9 rules out a tutorial
flow, and this is the smallest thing that can route a new player to a table
they can actually learn at. It renders ahead of the orientation split, so it
works in whichever orientation the phone is in on a first launch; its own
layout is a single centred column capped in `ch`, which is what lets one
layout fit both without a breakpoint (§4).

Asked exactly once. A stored mode *is* the record that the question was
answered, which is why it is `TableMode | null` rather than a mode plus a
separate "has been asked" flag: two fields can disagree, one cannot.

`?mode=beginner|standard` stands in for the tap, alongside the existing
`?seed=`. It carries the whole of the choice, reduced claim band included — a
link that produced a "beginner" table still offering Chow would be a lie — and
it is never written to storage, so it cannot reconfigure a real player's app.
The rendered QA sweep and the accessibility check both depend on it: without
it, a fresh browser profile lands on the choice screen and never reaches
`.app`.

### What the mode changes

| Layer | Beginner |
|---|---|
| Rules | `minimumFaan: 0`. Exactly one axis moves — see §20 for the two that deliberately do not. |
| Readouts | Own score, seat scores, seat wind glyphs, the bonus count and the wall count are hidden. Each is reference rather than decision input, and none is the only carrier: the winds and the wall stay in the accessible names, and every score is itemised on the result sheet. |
| Claim band | Reduced to Win, Pung, Pass (§14). |
| Guidance | Assist and Explain set on, corner labels at least `rank`, the explain banner held 11s instead of 7s and raised to body size, and the assist line leading with the gesture rather than the verdict. |

Under the standard profile the engine withholds the `win` action until the
hand clears the minimum faan floor, which is the one rule that most reliably
strands a new player: the hand is visibly complete and the game refuses to end
it. At zero, the core loop — four sets and a pair, then Win — is learnable
inside a single hand. `HKOS_RULES.md` already names this profile "Beginner",
and `tests/gate/corpus.test.ts` already exercises it as `PROFILE_144_OPEN`, so
it is a ruleset the correctness gate proves rather than a new one.

**A mode switch applies to the next match, never the live one.** A resumed or
in-progress match keeps the profile in its own record, and the menu says so
beside a Restart that deals a new one immediately. Rerolling a hand in progress
because a setting moved would be the §2.5 violation.

### How it is built

One `data-beginner` attribute on the table root, and every rule in
`app/src/styles/beginner.css`. Two consequences worth stating: the whole of
what the mode changes visually can be read in one file, and because the
component render tests mount components without that ancestor, the mode's
styling cannot silently alter what those tests assert.

Everything the mode does is subtractive, so the fixed reserves the responsive
geometry rests on — the 26px strip, the 44px band, the seat label height — are
untouched and §4's verified matrix still holds. **If a change to this mode ever
forces an edit to `geometry.test.ts`, the change is wrong.**

### The de-clutter, on both tables

Recorded in the sections they belong to: the score readouts and the bonus
count in §11, the status strip in §3, brass in §7, and sentence-case claim
labels in §14. Two dead rules went with them — `.status__wall`, unrendered
since the wall count moved to the plaque, and a `.well__empty` selector in
`a11y-check.mjs` matching nothing.

Deliberately left alone, because this document already records a reason for
each: the "score" label itself (F-06), the plaque's "East round" label (§3's
East-beside-East ambiguity), the han glyphs on the standard table (§8), and
the itemised faan breakdown (§16).

---

## 25. Learn to Play (#30)

Five replayable lessons, each played on a real table. Since #33 this is no
longer the first run — that is the linear walkthrough in §26 — and these are
what `ONBOARDING_DESIGN.md` §12 asks the material to become afterwards: a
reference and practice library, reached from the menu, replayable in any
order, with completion markers that are informational only.

The rule it is built on, from the issue: **teach by changing the game state,
not by explaining the game state.** A Pung is not defined; two matching tiles
are put in the player's hand, an opponent throws the third, the Pung button
appears, the player takes it, and the sentence explaining what they just did
arrives afterwards. Nothing in it is a slideshow and nothing is a rulebook
page — the one existing long-form surface, the rules reference (§21), is
still the place prose lives.

### Entry

Reached from the menu, and only from the menu. A first launch no longer lands
here: #33 replaced the lesson picker as the novice's opening surface, because a
player who has never seen a tile has no schema with which to choose between
"Four sets and a pair" and "Taking other players' tiles", and being returned to
a list after every lesson turns continuity into administration (§26).

The graduation screen went with it. Finishing the fifth lesson used to ask the
player to choose Beginner or Standard — the rules-profile question §26 removes
from first run — and asking it of somebody who came back to replay one lesson
is worse still, because they already have a table and did not come here to
change it. Finishing now marks the lesson done and returns to the list, and the
way out is the same control it is from every other lesson.

Nothing about the lessons gates the game: there is no screen in them without a
way out, and completing them is never required to reach a table.

`?learn=1` opens the menu and `?learn=<lesson id>` opens one lesson, alongside
the existing `?seed=`, `?mode=` and `?experience=`. Like the others they stand
in for taps and are never written to storage; the rendered QA sweep and the
accessibility check both depend on them.

### Scenarios: an arranged wall, not a second game

A lesson needs a particular hand, and there are two ways to get one. Searching
seeds until a shuffle happens to produce it makes every lesson hostage to the
PRNG. Writing a teaching mock of the rules produces a second, wrong mahjong.

Both were refused. `src/engine/scenario.ts` takes a spec — which tiles each
seat holds, which tiles the wall yields next — and turns it into an **ordering
of the same 144 physical tiles**, which `createScenarioGame` deals through the
production deal. A scenario hand differs from a dealt one in exactly one
respect: how its wall was ordered. The deal, the bonus reveal, claim
legality, priority, winning and scoring are all the engine's, and every move
afterwards goes through `reduceGame` like any other game.

Two properties fall out of that and are worth naming:

- The engine's own conservation invariant is a real check on the arrangement,
  because the arrangement is a permutation of the tile set rather than an
  invented inventory. `createScenarioState` additionally asserts that what was
  dealt is what the scenario asked for, which is what catches a future change
  to the packet deal instead of quietly teaching from a hand nobody designed.
- A scenario record **cannot** be replayed by `replayGame`, which rebuilds the
  wall from the seed. Scenario games are therefore never written to the
  resumable-game slot, and the tutorial keeps its own progress instead (below).

A lesson names only the tiles it is teaching. The rest of each hand is padded
from a deterministic shuffle seeded by the lesson id — not from the tile set in
canonical order, which handed every opponent a contiguous run of one suit and a
hand one tile from finished.

### The lesson mechanism

`TutorialRunner` is deliberately the same shape as `GameSession`: a plain class
owning the engine and the pacing, with React subscribing to it, so a re-render
can never advance a lesson. Three rules hold across all five:

- **A step may only ever remove options.** `step.offer` filters actions the
  engine has already ruled legal — the same reduction Beginner's claim band
  performs, for the same reason (§24). Nothing invents an action.
- **A wrong answer changes nothing.** The player's choice is checked against
  the step's goal *before* it is applied, so a mistake produces an explanation
  and another go at the same position rather than a state nobody designed.
  Several steps compose the explanation from the move itself, because "that
  tile is half of a run" and "that tile is half of your pair" are different
  lessons.
- **Opponents are the production bots.** A lesson scripts only the discards it
  actually depends on — the tile that makes a Pung available, the tile that
  completes the hand — and a scripted discard is still played through the
  engine, which rejects it if it is not legal. Everything else is
  `createHeuristicBot`, reading the same redacted view it reads at a real
  table. Pacing is 620ms rather than the table's 360ms: a tutorial opponent's
  move is to be read, not waited through.

A step may name the position it is about (`until`), and the table then runs on
until that holds and stops dead — which is how the lesson that teaches *why you
cannot Chow this one* pauses on exactly the discard it is talking about. While
it is travelling, a claim window offered to the player is passed on their
behalf, because the engine holds a window open until every responder answers
and one nobody answers stalls the table for good.

### The five lessons

| | Teaches | How |
|---|---|---|
| 1. Four sets and a pair | The target shape; Chow, Pung, Kong, pair | A finished hand, dealt and static, whose parts the player names by pointing at them. The one deliberately static lesson. |
| 2. Taking a turn | Draw one, discard one, and turn order | The player's own discard, then three real opponent turns, then their next draw. |
| 3. Choosing what to throw | That discards have better and worse answers | Three discards offered from a narrowed set, each wrong answer getting its own reason. Distance-to-completion in plain words; the word "shanten" never appears. |
| 4. Taking other players' tiles | Pung, Chow, Kong, pass, and the Chow restriction | Five claims in a row, each set up by an opponent throwing the tile that completes a shape already in the player's hand — including one that is *not* claimable, thrown from the wrong seat. |
| 5. Declaring a win | Recognising and calling a complete hand | A hand one tile away; an opponent throws it; the player declares. |

All five run under the **standard** profile. A lesson taught at Beginner's
zero-faan floor would be teaching a simplified rule as though it were the game,
which #30 rules out. The one place the floor could bite — declaring the win —
uses a hand built around a Red Dragon pung, worth one faan on its own, so it
clears the real minimum.

Telling the two tables apart is now the walkthrough's job rather than a
graduation screen's (§26): a player arriving at Beginner from teaching conducted
under Standard still needs to be told which rule was relaxed and that it is a
starting setting, but they are told it, not asked about it. The first real hand
is a genuine seeded match against the same bots — not another scripted lesson —
with the assist and explain layers §21 already provides, one opening note saying
that nothing here is scripted, and the opponents paced 1.7× slower. It changes
no rule and takes no decision away.

### Progressive hidden information

Lessons 1 to 4 make all three opponents' hands available, behind Peek, so a
claim can be explained by pointing at the tiles that caused it. Lesson 5 reveals
nothing and says so out loud, so the player's last lesson is played under
exactly the conditions the real game is played under.

Since #33 those hands are explanation rather than evidence. Every decision in
these lessons is readable from public information — the player's own tiles and
the tile in the middle — and the first-run walkthrough reveals no seat at all,
so a novice is never taught a decision procedure the game does not support
(`ONBOARDING_DESIGN.md` §8, and §26 below).

**The visibility is a separate value, not a doctored game state.** The redacted
projection is untouched: `state(viewer)` still returns exactly what that seat
may observe (`RULE-REDACT-1`), and the open hands come from
`MahjongGame.openHandsForTutorial()` — named so no call site can pretend
otherwise — which returns a `Map<Seat, Tile[]>`. That return type is the
boundary rather than a convention: a bot consumes a `PublicGameState` and
nothing else, so there is no object in existence shaped like a game state and
carrying opponents' tiles for a caller to pass along by mistake.

The production `SeatCard` is likewise left incapable of showing a hand. §11
decided that an opponent is a *count*, and putting an escape hatch into that
component would make the table's most sensitive rule a matter of which prop a
caller happened to pass. Learn to Play draws its own `OpenSeat` instead — and
`OpenSeat` is only ever rendered inside the Peek overlay (below), never on the
table.

**Peek: the open hands live on their own surface.** They used to be face up in
the seat rails for the whole lesson. On a real phone that is 13-16px per tile —
a picture of a tile rather than a tile — so the thing the lesson exists to show
could not be read, and it was spending the felt the discard well and the coach
strip needed. Trying to keep every piece of information permanently visible was
what made the table unreadable.

So the lesson's table is now the production table, seat for seat, showing the
same compact seat summaries and public state a real game shows, and the open
hands moved behind one control:

- **`Peek hands`** sits with the lesson's own controls in the coach strip — it
  is a thing to read, not a move, and the felt has no room for a floating
  button over the discard well.
- It opens a central overlay drawing all three revealed hands at
  `--peek-tile-w`, sized by the geometry engine for **fourteen** slots (the seat
  to play has already drawn) and floored at the same 34px the hand is. On the
  568×320 class that is 34px against the rails' old 14px.
- **The control does not exist where the lesson reveals nothing.** `openHands`
  is empty for lesson 5 and the guided hand, so there is no button to press and
  no state in the view that could produce one. The absence is the guarantee.
- **The lesson holds still while it is open.** `TutorialRunner.setPaused()`
  cancels the pending opponent move and re-enters the pump on resume. It is
  pacing only: no engine state is saved, copied or restored, so the position the
  player reads is the position that is still there when they close it. An
  opponent moving behind the overlay would change the hands they came to read,
  and would do it out of sight.
- **Every exit works**: the close control, a tap on the felt around the panel,
  Escape, and the Android back button — Peek pushes one history entry while open
  and pops it on any other close, so back never has to be pressed twice.
- Focus moves in on open, is trapped while it is up, and returns to whatever
  opened it on close (§16). Motion follows `prefers-reduced-motion` through the
  same `.overlay` rules the result sheet uses.
- The panel carries one sentence that keeps Peek from teaching the wrong lesson:
  *a real game never shows you these*.

### Layout

The lesson is the production table with the coach strip in place of the status
readout, reusing `SeatCard`, `PlayerHand`, `ClaimBand` and `DiscardWell`
unchanged — so what the player learns to tap is the thing they will be tapping
five minutes later, and the seats read exactly as they will at a real table. The
coach is a strip and not a panel: the tiles a sentence is about have to be
visible while it is read, and a panel over the table would be a slideshow with
extra steps.

The lesson's table top is now §3's composition exactly. It used to break the
across seat onto its own full-width row to fit thirteen face-up tiles on one
line; with the open hands behind Peek there is nothing left to break it for, and
the width goes back to the discard well. The tutorial obeys the same responsive
priority policy and publishes the same `data-tier` as the table (§4a).

One thing still differs:

- **Portrait is a supported way to take a lesson.** The table proper holds in
  portrait because fourteen tiles cannot be seated readably across a phone's
  short edge (§4). A replayable lesson holds the same fourteen — so portrait
  wraps the hand onto two rows at a readable width, rather than shrinking below
  the 34px floor to keep one row. This is a concession the *replayable* lessons
  keep and the #33 first run deliberately does not: interactive first-run
  teaching is landscape, so a novice never rehearses a hand layout they will
  not play on (§26). The override is applied to the hand row, not
  to `.app`, so the geometry's own computed values and everything derived from
  them are untouched.

Nothing in `app/src/styles/tutorial.css` touches a rule the responsive geometry
rests on: the 44px band, the hand's reserve and the 26px strip are unchanged,
so §4's verified matrix still holds for the table proper. **If a change to Learn
to Play ever forces an edit to `geometry.test.ts`, the change is wrong.**

### Persistence

One more `localStorage` key under the same versioned prefix (§22),
`mahjong:v1:tutorial`: the lessons finished and whether the sequence has been
completed. Deliberately its own blob rather than two more fields on the
settings object, so a lesson renamed in a later build costs a filtered array
rather than a settings migration — unknown ids are dropped and the rest
survive.

It records; it never gates. Nothing in the app reads it to decide whether a
player may reach a table.

### Exit criteria carried forward from #30

- A first-time player can choose to learn or to skip, and skipping never locks
  them out of anything.
- The core sequence is completable in roughly five to eight minutes without
  reading a rules document.
- Every tutorial decision executes as a legal production engine transition.
- Opponent hands can be opened for teaching without weakening the redaction
  guarantee or what any bot can see, and they are only ever drawn on the Peek
  overlay, in a lesson that has declared the seats it reveals.
- The final hand is a real engine-driven match against the existing bots, and
  the player makes its decisions.
- Progress persists, lessons replay, and Beginner and Standard are told apart
  where they differ.

---

## 26. First run, orientation and navigation (#33)

[`ONBOARDING_DESIGN.md`](ONBOARDING_DESIGN.md) is the design authority for the
first-time-player experience. This section records what was built from it.

The problem it addresses was not that the five lessons of §25 taught the wrong
things. It was that a new or long-lapsed player reached a dense table before
they had a map of it, was asked to navigate a curriculum before they had any
schema with which to choose, read instructions in a strip above the object they
referred to, and could only reach the rest of the product by rotating the phone
— a command nothing announced.

### The first-launch question asks about the player

`ExperienceChoice` replaces `ModeChoice`. The three doors are **New to
mahjong**, **Played before — refresh me** and **Start playing**, where they
were Learn to Play and two "I know mahjong" tables described by the rules they
relax.

The change is not wording. Choosing a rules profile is configuration, and a
player who has never seen a tile cannot answer a question about a minimum faan
value before they know what a turn is; Apple's onboarding guidance makes the
general form of the point, which is to postpone nonessential setup. So the
question is about prior experience, which everybody can answer, and each answer
settles a table, a claim band and every aid by itself
(`app/src/game/experience.ts`). No path has a setup step.

**Start playing** turns the aids *off* rather than on. Somebody who has just
said they do not want instruction should not be handed a table that suggests
their discards; all three are one tap away in the menu, and this applies only
to a genuinely fresh path — a returning player's stored settings are never
overwritten, because the question is not asked twice.

`experience` replaces `mode` as the field recording that the question was asked
(`PersistedSettings` v3). The §24 argument against a mode plus a separate "has
been asked" flag still holds — two fields can disagree, and "asked but somehow
unset" is not a state this app should be able to represent — but the field that
records the answer is no longer a rules profile, because the answer is no
longer about rules. Migration from v1 and v2 marks every existing player
`confident` and carries their stored table and aids across untouched. That
promise is load-bearing rather than polite: the new first run is a scripted
walkthrough, and dropping somebody who has played fifty hands into one because
they updated the app would be the worst possible reading of it.

### Screen state chooses the surface; orientation only lays it out

The old rule was that landscape was the table and portrait was the menu,
settings, Learn, rules and stats. Rotating the hardware therefore changed the
entire information architecture, and a player holding a live table had no
visible route anywhere else.

Landscape gameplay is unchanged — fourteen readable tiles is a hard constraint
and #33 does not reopen it (§4). What changed is everything around it:

- the status strip carries a **Menu** button (`StatusStrip`), present at every
  layout tier. The responsive priority policy may drop opponent metadata and
  the explain banner on a short phone (§4a); it may not drop the only visible
  way to the rest of the product. The strip is 26px because chrome height is
  the cheapest thing the table owns and the hand is the most expensive, so the
  drawn control stays inside the band and its hit area is padded past it —
  the bargain `.hand__slot` already makes for a tile narrower than the touch
  floor (§6);
- `MenuSheet` opens over the table rather than replacing it. The felt stays
  visible, closing it lands exactly where the player was, and nothing about the
  match moves while it is up. It lays out in both orientations, because
  landscape is the grip the player is already in;
- portrait **holds**. `RotateNotice` says the table needs the long edge and
  stops; only the render swaps, so the session, the hand, a pending claim and
  any walkthrough phase are all still mounted behind it and rotating back
  returns the exact position, mid-decision. It carries a Menu button too, so
  portrait is never a dead end for somebody who rotated *looking* for the menu
  — which, after several builds of teaching them that rotation was the menu,
  some players will;
- the rules, stats and lesson surfaces render in either orientation, and
  rotating with one open keeps it open.

Back is always "close the topmost thing", never "leave the product". Each
overlay owns exactly one history entry and every exit routes through it — the
close control, a tap on the backdrop, Escape and the hardware button all pop
the same one. `app/src/game/useOverlayBack.ts` is the shared implementation,
lifted out of Peek, which has worked this way since #32.

### The attention layer

Object-specific instruction now sits next to its object. The previous coach
strip asked the learner to read a sentence in one place and then search a dense
visual field for its subject; Mayer's spatial-contiguity result is the general
form of why that costs comprehension, and the table is exactly the dense field
the effect is largest on.

Two things are drawn over the table by `Attention`: a **spotlight** that quiets
everything except the objects the current step is about, and a **callout**
carrying the sentence about them. Both are painted above the table and neither
is in its layout, so nothing here can move a tile under a thumb. The whole
layer is inert to touch — the learner taps the real hand, the real claim
button, the real tile — which also means a step that spotlights the wrong
element is a cosmetic bug rather than a lockout.

Targets are CSS selectors for real production elements, stamped with
`data-teach` attributes and measured live (`app/src/tutorial/targets.ts`,
`useTeachingRects.ts`). Nothing stores a coordinate, so the spotlight is
correct at every tier, orientation and inset without a device list — the same
bargain `geometry.ts` makes from the other direction.

**The degradation ladder** (`app/src/tutorial/placement.ts`) is the part worth
recording. A callout must never cover its own target, the hand, a live claim
band or the offered tile; on a short landscape phone those cannot all hold at
once, and shrinking the table is ruled out by §5 and was already disproved by
#32. So the design says which half degrades. Spotlighting costs no layout and
never degrades. Callouts do: **adjacent** to the target, else at the nearest
free **edge** with a leader drawn back to it, else the sentence returns to the
coach strip with the spotlight retained. That last rung is the floor — the
learner may have to move their eyes, but the target is still unambiguously
marked, so they never search the screen for the referent.

**The assistance ladder** (`hints.ts`) escalates with hesitation rather than
opening at its most prescriptive: a learner who can work the answer out should
be allowed to, because working it out is the evidence the step exists to
produce, and one who cannot must not be left stuck. A step whose subject is a
private interface convention — tap once to lift, tap again to discard — opens
explicit instead, because there is nothing to reason out and making a novice
discover an interaction convention by trial and error is a puzzle nobody set.
The last rung offers to perform the answer, and taking it is recorded as a
rescue rather than as comprehension.

The spotlight is `aria-hidden`; the sentence reaches a screen reader through
the coach strip's live region whichever rung it landed on.

### The walkthrough

`app/src/tutorial/onboarding.ts` holds the first run: three phases for a novice
and one for a rusty player, run back to back by `Onboarding.tsx` with no menu
between them and no graduation screen at the end.

A novice reads their hand, sees what a draw is for, throws a tile under
explicit instruction, watches the table come round, takes an unaided turn,
takes a claim, leaves a claim, and finishes a hand — then the next hand is
dealt on the same table with nothing scripted. The last scripted action hands
straight into real play because that transition *is* the comprehension test,
and interrupting it to ask which rules profile they would like spends the
strongest transfer moment the product has on a question they still cannot
answer. The Beginner simplification is stated once, as disclosure.

The unaided turn accepts **any** discard that does not damage the hand rather
than one designated tile, and corrects only throws that break the pair or a
completed group. It is testing whether the learner reasons; refusing a
defensible throw because it was not the one written down would teach them to
hunt for the highlighted answer instead of reading their hand.

Every phase reveals no opponent seat. Peek does not exist on this path — there
is no control and no overlay — so the first claim is taught from the player's
own tiles plus the public discard, which is the information model they will
actually play with. Chow and Kong are deliberately absent from the mandatory
spine; they arrive contextually or in the replayable lessons (§25).

The rusty refresher is about *this table* and not about mahjong: two taps to
throw a tile, where discards and turn order show, where claims appear, where
the menu is. Re-teaching four-groups-and-a-pair to somebody who came back
because they already know it is the failure mode that path exists to avoid.

Everything structural is #30's runner, unchanged: an arranged wall dealt
through the production deal, every move played through the production engine, a
step that can only ever *remove* legal options, and a wrong answer that leaves
the position exactly where it was. #33 is a teaching-architecture correction,
not a second game engine.

Progress records the **phase**, not the step (`PersistedTutorial` v2). A phase
is a short deterministic scenario, so replaying one from its start costs a few
seconds and is always coherent, where persisted mid-scenario engine state would
have to survive a schema change to stay correct and would drop the learner into
a half-finished position they have lost the context for.

### Scaffolding fades on demonstrated competence

`app/src/game/scaffold.ts` decides what help survives the handoff. The scripted
apparatus goes at once, by leaving the walkthrough surface. What remains fades
against what the player has actually done rather than against a hand count: a
hand counter takes help away from somebody who has been guessing and keeps it
in front of somebody who understood it immediately. Beginner's assist hint
stops spelling out the tap-tap gesture after two unprompted turns, and claim
explanation stops after a claim has been taken. Nothing it fades is a rule, and
every aid it touches switches back on from the menu.

### What automated evidence does and does not establish

The gate proves that the walkthrough plays to completion on real engine
transitions at every phone class; that no step offers an action the engine has
not ruled legal; that no opponent's concealed tiles reach the player's view or
the DOM; that a callout never covers the hand, a live claim band or the offered
tile and never leaves the viewport; that a step which spotlights nothing is a
finding; that the table carries a Menu, that every secondary surface is
reachable without rotating, and that rotating away and back returns the same
hand; and that the whole layer behaves under reduced motion and assistive
technology.

It proves nothing about comprehension. Whether a novice comes out of this
understanding where they are, what they are trying to do and what their next
decision means is a question only the real-human transfer test in
`ONBOARDING_DESIGN.md` §14 can answer, and no assertion in this repository
should be cited as having answered it. **The redesigned flow is not
novice-validated until that gate has been run.**
[`ONBOARDING_HUMAN_TEST.md`](ONBOARDING_HUMAN_TEST.md) carries the readiness
statement, the reset instructions and the session protocol for running it.
