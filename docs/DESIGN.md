# Mahjong production design

> Status: **authoritative for the production app** as of Issue #21 (V1.7.1),
> extended by Issue #9 (V1.8) for the contextual learning layer in §21, by
> Issue #10 (V1.9) for persistence and stats in §22, and by Issue #11
> (V1.10) for Capacitor Android packaging in §23. The real-device gate this
> document has always deferred to #11 remains open — see the foot of this
> document.
> Where this document and `app/` disagree, one of them is a bug. Where this
> document and [`HKOS_RULES.md`](HKOS_RULES.md) disagree about game behaviour,
> the rules contract wins and this document is wrong.

This records decisions, not aspirations. Every value below is implemented, and
most of them are asserted by a test named in the section that states them.

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
| Status strip | 26px fixed | Own seat wind, own score, whose turn it is |
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
distances rather than as three unrelated tile sizes.

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
| Small landscape | 568×320 | 35px tiles, fits |

Portrait is reported as portrait and routed to the menu surface rather than
squeezed: 14 tiles in a 412px width is 25px per tile, below the readable floor.

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
portrait toggle all carry `min-height: var(--touch-min)`.

The rendered QA pass measures the smallest effective target at every viewport
and every captured state, and fails the run below 44px.

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
score, concealed count, exposed melds, bonus tiles. Bonus tiles are drawn at
reduced weight because they are settled score rather than live state.

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

## 21. Contextual learning layer (#9)

Three independent controls, each default on for the author's initial learning
period, none ever required to make a legal move: **Assist**, **Explain**, and
**corner labels** (§10). All three switch off independently from the portrait
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
rules contract and cannot silently drift from it. It is reachable only from
the portrait menu and works fully offline, like the rest of the PWA (§19).

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

- **Settings** — the Assist, Explain and corner-label toggles (§21, §10).
  Loaded once at startup and written back whenever any of the three changes.
  A rules profile is not stored here separately: no rules-selection UI exists
  yet, so the only rules profile a new match can start with is
  `DEFAULT_RULES_PROFILE`, and every match already carries its own profile in
  its game record's `config` field — persisting a second, currently-inert
  copy would be dead plumbing.
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
portrait menu — the same settings surface as Assist, Explain, corner labels
and the rules reference — and reuses that reference's full-screen shell
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
The table is landscape-only, but the settings/learning/rules/stats menu is
the portrait surface (§1, §21, §22), reached by physically rotating the
phone — exactly as it already works in the browser. Locking `MainActivity`
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
