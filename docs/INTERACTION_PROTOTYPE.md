# V1.6 — Mobile interaction prototype (#7)

Status: **GREEN — accepted on a real Android phone.** The landscape interaction
model is the production input for #8; the prototype itself remains disposable.

The prototype lives in [`prototype/`](../prototype). It is throwaway. Production
UI and the installable PWA are #8, and #8 is not started until the interaction
decision here is accepted.

**Not deployed.** The prototype no longer has (and after #26, never again
should have) a public Pages URL — `https://benwassa.github.io/mahjong/` is
the production `app/` build, deployed by
[`.github/workflows/pages.yml`](../.github/workflows/pages.yml). Run the
prototype locally with `npm run phone` as described below if you need to
revisit it.

---

## 1. Run it on the phone

Both devices must be on the same Wi-Fi network. Nothing is installed on the
phone; it is a browser tab.

```sh
cd prototype
npm ci
npm run phone
```

Vite prints a `Network:` line. Open that URL in Chrome on the Android phone.

If it does not print one, find the machine's LAN address yourself:

| Machine | Command |
|---|---|
| Linux | `hostname -I` |
| macOS | `ipconfig getifaddr en0` |
| Windows | `ipconfig` — the IPv4 address of the active adapter |

Then open `http://<that-address>:5173` on the phone.

**Turn the phone sideways and turn off rotation lock.** The prototype detects
portrait and says so; it does not force an orientation, because comparing the two
is one of the questions.

### If the phone cannot reach the laptop

Some home networks block device-to-device traffic (AP or client isolation), and
some laptop firewalls block inbound 5173. Use USB instead:

```sh
# Phone: Settings → Developer options → USB debugging, then plug it in.
adb reverse tcp:5173 tcp:5173
```

Then open `http://localhost:5173` on the phone. The port is forwarded over the
cable, so no network is involved.

There is no third path worth setting up. Do not tunnel it to the public internet
for this.

---

## 2. What is on screen

- **Top bar.** Scenario `‹ n/6 ›`, whose turn it is, and a live readout of the
  hand: tile count, tile width in CSS px, and an approximate physical width.
  `⚠ misfire` records a discard you did not intend — press it every time it
  happens, it is the whole point. `⚙` opens the knobs and the session report.
- **Felt.** The three opponents, their exposed melds, the discard pile, and the
  tile currently on offer.
- **Claim controls.** Contextual. Pass sits at the far end from Win in both
  placements; the space they occupy is reserved even when empty so the hand never
  resizes underneath your thumb.
- **Hand.** Sized for the widest it will get this turn cycle (14 tiles, less
  three per exposed meld) so tiles do not jump between the 13- and 14-tile halves
  of a turn.

The six scenarios: a full 14-tile discard, a turn that is not yours, a chow with
two legal shapes, a pung-or-kong on one discard, a win offered beside a pass, and
a discard with one of your own melds exposed.

---

## 3. The checklist

Six questions. Run every scenario at least once, then answer. Two minutes is
enough; if it takes longer than five, something is wrong with the prototype, not
with you.

1. **Landscape.** Rotate to portrait on scenario 1, then back. Is landscape
   clearly right?
2. **Legibility.** On scenario 1, at arm's length, without zooming: can you read
   all 14 tiles?
3. **Hit targets.** Discard ten times on scenario 1 (`replay` after each). Does
   the tile you hit match the tile you aimed at?
4. **Accidental discards.** During those ten, how many `⚠ misfire` presses? Does
   lift-then-confirm feel like enough, with no dialog?
5. **Claims.** On scenarios 3, 4 and 5: are the controls readable, is the choice
   between two shapes obvious, and does the hand stay readable while you decide?
6. **Labels.** On scenario 1, switch corner labels off → rank → rank+suit. Do
   they help, and do they damage the face?

Then open `⚙`, press **report**, and paste the text block back with your answers.

### Optional comparisons, only if the above left you unsure

- `⚙ → claim placement`: right rail against band above hand. The rail costs the
  hand roughly 10 px per tile; the band costs vertical room.
- `⚙ → tile size`: `fit` against the fixed 42/52/62 px sizes. A fixed size that
  no longer fits says so and scrolls rather than silently shrinking.
- `⚙ → discard model`: flick up instead of tap-tap. Tap-tap stays the baseline
  unless this is clearly better on the device.
- `⚙ → outline decision tiles`: proves no control covers a tile the pending claim
  depends on.

---

## 4. Prepared by emulation, which does not count

Chromium at 915×412 was used to prepare the prototype, not to accept it. What it
settled, and what it cannot:

| Measured in emulation | Result |
|---|---|
| 14 tiles at 915×412, right rail | 51 px per tile (≈13.5 mm), no scrolling |
| 14 tiles at 915×412, control band | 61 px per tile (≈16 mm) |
| 14 tiles in portrait at 412×915 | 25 px per tile (≈6.6 mm) |
| Claim controls against hand and offered tile | no overlap in either placement |
| Tap → lift → tap again → discard | one discard, hand goes 14 → 13 |
| Tap another tile mid-decision | selection moves, nothing is discarded |

Three defects were found this way and fixed before the phone sees it: the hand
stopped re-fitting after rotation because its content could widen the app grid;
the hand was dimmed during a claim, which obscured the very tiles the claim
depended on; and Win and Pass sat next to each other.

None of that answers whether 13.5 mm is comfortable under a thumb, whether the
lift reads as a confirmation in a moment of hesitation, or whether pips are
countable in a phone's actual pixel density and glare. Those need the phone.

---

## 5. Device verdict

**GREEN — recorded from a real Android phone on 2026-09-01.** The prototype was
tested in landscape on the author's phone. Landscape width and readability were
comfortable, with some horizontal room to spare. The interaction model is accepted.

| Question | Verdict | Notes |
|---|---|---|
| Landscape clearly right? | GREEN | Accepted as the gameplay orientation on the real phone. |
| 14 tiles readable without zoom? | GREEN | Width and readability were comfortable, with spare horizontal room. |
| Hit targets comfortable? | GREEN | The real-phone interaction gate passed; no hit-target blocker was reported. |
| Select-then-discard prevents accidental discards? | GREEN | Tap once to select and tap the same tile again to discard is accepted. |
| Claims readable without shrinking the hand? | GREEN | Contextual claim controls are accepted as part of the landscape interaction model. |
| Corner labels useful without damaging the face? | No blocking change | Traditional artwork remains canonical; labels stay a separate optional layer for #8. |

Session report:

```
No numeric prototype report was supplied. The qualitative real-device verdict above
is the acceptance record; emulator measurements in §4 are not substituted for it.
```

Decision:

```
GREEN. Carry tap-tap selection/discard and contextual claim controls into #8.
Production must fit the actual viewport and safe-area insets responsively rather than
assuming the prototype's test dimensions. Use wider-phone spare horizontal room when
available without reducing tile readability or touch comfort on narrower viewports.
Keep traditional tile faces canonical and corner labels as an independent layer.
```
