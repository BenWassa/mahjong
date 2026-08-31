# Hong Kong Old Style — V1 Rules Contract

**Status: LOCKED for V1.** This document is the authoritative rules definition for
this repository. Where engine code, scoring code, a dependency, or the in-app rules
reference disagrees with this document, **this document wins and the other side is a
bug**.

Scope note: this is the contract for *one* ruleset — Hong Kong Old Style (HKOS,
香港舊章). It is not a survey of mahjong. Nothing here is written to accommodate a
future variant.

- Product definition: [`PRD.md`](PRD.md)
- Programme: [`PROGRAMME.md`](PROGRAMME.md)
- Locking issue: [#2](https://github.com/BenWassa/mahjong/issues/2)

---

## 0. How to read this document

| Marker | Meaning |
|---|---|
| **LOCKED** | Inherited from the PRD. Not re-opened here. |
| **DECISION** | Resolved by this document. Sources disagreed or were silent. |
| **DIVERGENCE** | This document deliberately differs from a named reference. Each one names a regression test. |
| **EXCLUDED** | Explicitly not in V1. Not a TODO. |

Every **DECISION** and **DIVERGENCE** carries a test name of the form
`RULE-<area>-<n>`. Those names are the contract between this document and the test
corpus (issue #5). A rule with no test is not considered locked.

### Sources used

1. **Hong Kong mahjong scoring rules** (Wikipedia) — the PRD's designated primary
   reference for the faan table and payment structure.
2. **`hk-mahjong` v3.2.0** (npm, MIT, © 2021 Peter H., HSKPeter) — the PRD's
   designated cross-check implementation. Read from the published package
   (`lib/calculateFaan/FaanCalculator.js`, `lib/hand/handType/*`), not from prose.
3. General HKOS reference material (McGill Mahjong HKOS pages, HK-language faan
   tables) used to corroborate values where 1 and 2 disagreed.

**Research limitation, stated honestly.** The build environment's network egress
policy blocks `en.wikipedia.org` and `mahjong.wikidot.com`; those pages could only be
consulted through search-engine summaries, not fetched in full. `hk-mahjong` was read
in full from its published package. Every value below that could not be confirmed
against a full primary text is marked **DECISION** with its reasoning, so that a later
correction is a one-line table edit plus a test update rather than an archaeology
exercise.

---

## 1. Locked baseline (from the PRD)

| Setting | V1 value |
|---|---|
| Style | Hong Kong Old Style (香港舊章). Not New Style. |
| Players | 4 seats. Seat 0 is the human; seats 1–3 are bots. |
| Hand size | 13 concealed tiles; 14 to win |
| Tile set | 144 tiles including flowers and seasons (136 selectable) |
| Minimum faan | 1 by default; 0 and 3 ("Classic") selectable |
| Match length | East round by default; single hand and four-round game selectable |
| Melds | Chow, Pung, Kong |
| Flowers | Revealed immediately, replacement drawn |
| Dealer | Continues after a dealer win, otherwise rotates |
| Scoring | Faan, stacked where criteria co-occur |

---

## 2. Tiles

### 2.1 The 144-tile set

| Group | Chinese | Types | Copies | Tiles |
|---|---|---|---|---|
| Characters | 萬子 | 1–9 | 4 | 36 |
| Bamboo | 索子 | 1–9 | 4 | 36 |
| Dots | 筒子 | 1–9 | 4 | 36 |
| Winds | 風牌 | E S W N (東南西北) | 4 | 16 |
| Dragons | 三元牌 | Red 中, Green 發, White 白 | 4 | 12 |
| Flowers | 花牌 | Plum 梅, Orchid 蘭, Chrysanthemum 菊, Bamboo 竹 | 1 | 4 |
| Seasons | 季牌 | Spring 春, Summer 夏, Autumn 秋, Winter 冬 | 1 | 4 |
| | | | | **144** |

- **Suits** are Characters, Bamboo, Dots. **Honours** are Winds and Dragons.
- **Terminals** are the 1 and 9 of any suit. **Simples** are 2–8.
- **Bonus tiles** are the 8 flowers and seasons collectively. They are never part of a
  hand's 13/14 tiles and are never melded.

**136-tile setting.** Selecting 136 removes all 8 bonus tiles. Every bonus-related
faan (§5.D), the no-flowers bonus, and the two bonus-tile instant wins are then
unreachable and are omitted from the scoring breakdown rather than scoring zero.
`RULE-TILES-1`

### 2.2 Bonus-tile seat ownership

Bonus tiles are ordered and each is "owned" by one seat:

| Seat wind | Flower | Season |
|---|---|---|
| East | Plum 梅 (1) | Spring 春 (1) |
| South | Orchid 蘭 (2) | Summer 夏 (2) |
| West | Chrysanthemum 菊 (3) | Autumn 秋 (3) |
| North | Bamboo 竹 (4) | Winter 冬 (4) |

Ownership is by **seat wind**, which rotates with the dealership; it is not fixed to a
player for the whole game. `RULE-TILES-2`

---

## 3. Setup and the wall

### 3.1 Deal

1. The wall is the full tile set, shuffled by the seeded RNG (§10).
2. Seats are dealt 13 tiles each in the physical order (four at a time, three rounds,
   then one each), taken from the head of the wall. The exact draw order is
   observable in the game record; because the wall is a single shuffled sequence, the
   dealing pattern does not change the distribution, but it is implemented in the
   traditional order so the record reads like a real deal. `RULE-DEAL-1`
3. The dealer then draws one more tile, giving the dealer 14 and the others 13.
   `RULE-DEAL-2`
4. Bonus tiles are resolved (§3.3) before the dealer's first discard.

After steps 1–3, **91 tiles remain in the wall** (144 − 52 − 1), or 83 with the
136-tile set. Step 4 then draws one replacement per revealed bonus tile from the
tail, so the count entering play is 91 minus the number of bonus tiles revealed
during the deal. `RULE-DEAL-3`

### 3.2 Dead wall — **DECISION**

**There is no reserved dead wall.**

- Normal draws are taken from the **head** of the wall.
- Replacement draws (for a bonus tile or a kong) are taken from the **tail** of the
  wall.
- The hand ends in an exhaustive draw when the wall is empty — head and tail have met
  and 0 tiles remain.
- **A kong may not be declared if the wall is empty**, because no replacement tile
  could be drawn. The action is illegal and is not offered. `RULE-WALL-2`
- **Once the wall is empty, the only legal claim on a discard is Win.** Chow, Pung
  and Kong are not offered: the hand ends after that discard either way, so
  melding it could only produce a degenerate exchange with no draws left.
  `RULE-DRAW-4`

**Rationale.** HKOS is played to the true end of the wall; the last drawn tile is
literally the 海底 tile. The Japanese-style fixed 14-tile dead wall is a different
game's furniture. Drawing replacements from the tail reproduces the physical HK
practice of 補花 / 補槓 from the back of the wall, makes every replacement cost the
table exactly one future draw, and keeps tile conservation a one-line invariant.

**EXCLUDED:** reserved dead wall, dora indicators, any 14-tile reservation.
`RULE-WALL-1`

### 3.3 Bonus tile reveal and replacement

Whenever a player acquires a bonus tile — during the deal, on a normal draw, or on a
replacement draw:

1. The tile is immediately placed face-up in that player's bonus area.
2. A replacement tile is drawn from the **tail** of the wall.
3. If the replacement is itself a bonus tile, repeat from step 1. Chains are
   unbounded. `RULE-FLOWER-1`

At the deal, bonus tiles are resolved seat by seat starting with the dealer, and the
whole cycle repeats until no seat holds a bonus tile. `RULE-FLOWER-2`

A player may never choose to hold or discard a bonus tile. `RULE-FLOWER-3`

If the wall is empty when a replacement is required, the hand ends immediately as an
exhaustive draw (§8.2). `RULE-FLOWER-4`

---

## 4. Play

### 4.1 Turn order

Counter-clockwise: East → South → West → North → East. "Next player" always means the
seat immediately after the current one in this order.

### 4.2 The turn

A turn is: **draw** (from the head of the wall, plus any bonus replacement) then
**discard** exactly one tile, unless the player wins or declares a kong.

A player who has just claimed a discard (Chow/Pung/exposed Kong) does **not** draw;
they discard directly. After an exposed Kong claim they first take a replacement tile
from the tail. `RULE-TURN-1`

### 4.3 Claims on a discard

| Claim | Who may claim | Requirement |
|---|---|---|
| **Chow** 食 | **Only the next player in turn order** | Two tiles in hand forming a run with the discard, in a suit |
| **Pung** 碰 | Any other seat | Two matching tiles in hand |
| **Kong** 槓 (exposed) | Any other seat | Three matching tiles in hand |
| **Win** 糊 | Any other seat | The discard completes a legal winning hand (§6) meeting the minimum faan (§7.4) |

Chow is restricted to the next player. `RULE-CLAIM-1`

### 4.4 Claim priority — **DECISION**

1. **Win** outranks everything.
2. **Pung / exposed Kong** outrank **Chow**.
3. If two or more seats declare Win on the same discard, the seat **closest to the
   discarder in turn order** wins; the others' claims lapse with no compensation.
   `RULE-CLAIM-2`

**Rationale for (3).** 一炮多響 (multiple winners on one discard) exists in some HK
circles, and paying all winners is also seen. Both add settlement complexity and a
second simultaneous end-of-hand path for a situation the single human player will meet
roughly never. Nearest-seat-wins (頭家) is the most widely used HK resolution and is a
single comparison.

**EXCLUDED:** multiple winners on one discard. `RULE-CLAIM-3`

Pung and exposed Kong can never conflict between two seats: they require three
identical tiles in one hand and two in another, which would need five copies.
`RULE-CLAIM-4`

If no claim is made, play passes to the next player. If nothing is claimable, the game
must not prompt at all. `RULE-CLAIM-5`

### 4.5 Kongs

| Kind | Chinese | How | Tiles concealed? |
|---|---|---|---|
| Concealed | 暗槓 | Four in hand, declared on your own turn after drawing | Yes |
| Exposed | 明槓 | Three in hand + claim a discard | No |
| Added / promoted | 加槓 | Draw or hold the 4th tile matching your own **exposed pung** | No |

After any kong the player draws a replacement from the tail (§3.2), then discards
(unless the replacement wins). `RULE-KONG-1`

A concealed kong keeps a hand **fully concealed** for 門前清 purposes (§5.C2).
`RULE-KONG-2`

An added kong converts an existing exposed pung; it does not create a new meld slot.
`RULE-KONG-3`

### 4.6 Robbing a kong (搶槓) — **DECISION**

- Robbing is permitted **only on an added kong** (加槓). Any other seat whose hand is
  completed by the promoted tile may declare Win, which cancels the kong. The tile is
  treated as a discard by the kong declarer for payment purposes (§7.5).
  `RULE-ROB-1`
- Robbing a **concealed kong is not permitted**, including for Thirteen Orphans.
  `RULE-ROB-2`

**Rationale.** Robbing 加槓 is near-universal in HK. The Thirteen Orphans exception to
robbing a concealed kong is a Japanese import; admitting it would make a concealed
kong an information leak in a game where the other three seats are bots.

A successful robbery scores 搶槓 (§5.C6). The cancelled kong is undone: the promoted
tile leaves the pung, which remains an exposed pung. `RULE-ROB-3`

---

## 5. The faan table

This is the complete set of scored patterns in V1. Nothing else scores.

Values are **additive** unless an exclusion in §5.G says otherwise, and the total is
capped at the ceiling in §7.2.

### 5.A Hand-structure patterns

| ID | Pattern | 中文 | Faan | Definition |
|---|---|---|---|---|
| A1 | Common Hand | 平糊 | **1** | All four sets are chows. Any pair. |
| A2 | All Triplets | 對對糊 | **3** | All four sets are pungs or kongs. |
| A3 | Mixed One Suit | 混一色 | **3** | Tiles from exactly one suit plus honours; at least one honour and at least one suit tile. |
| A4 | All One Suit | 清一色 | **7** | Every tile from exactly one suit. No honours. |
| A5 | Small Three Dragons | 小三元 | **3** | Two dragon pungs/kongs + the pair is the third dragon. |
| A6 | Great Three Dragons | 大三元 | **8** | Pungs/kongs of all three dragons. |
| A7 | Small Four Winds | 小四喜 | **6** | Three wind pungs/kongs + the pair is the fourth wind. |
| A8 | Great Four Winds | 大四喜 | **8** | Pungs/kongs of all four winds. |
| A9 | All Honours | 字一色 | **10** | Every tile is a wind or dragon. |
| A10 | Mixed Terminals & Honours | 混幺九 | **10** | Every set and the pair is a terminal or honour; at least one honour and at least one terminal. |
| A11 | All Terminals | 清幺九 | **10** | Every set and the pair is a terminal. No honours. |

### 5.B Honour melds

| ID | Pattern | 中文 | Faan | Definition |
|---|---|---|---|---|
| B1 | Dragon Pung/Kong | 三元牌 | **1 each** | Pung or kong of Red, Green, or White dragon. |
| B2 | Seat Wind | 門風 | **1** | Pung or kong of your own seat wind. |
| B3 | Round Wind | 圈風 | **1** | Pung or kong of the prevailing round wind. |

If your seat wind is the round wind (East seat in East round), B2 and B3 both score,
for 2 faan from one meld. `RULE-FAAN-B1`

### 5.C Winning circumstance

| ID | Pattern | 中文 | Faan | Definition |
|---|---|---|---|---|
| C1 | Self-Draw | 自摸 | **1** | The winning tile was drawn, not claimed. |
| C2 | Fully Concealed Hand | 門前清 | **1** | No exposed melds at the moment of winning. Concealed kongs are permitted. |
| C3 | Win on Last Wall Tile | 海底撈月 | **1** | Self-draw of the final tile of the wall. |
| C4 | Win on Last Discard | 河底撈魚 | **1** | Win on the discard that follows the final wall tile. |
| C5 | Win on Kong Replacement | 槓上開花 | **1** | The winning tile was the replacement drawn after declaring a kong. |
| C6 | Robbing a Kong | 搶槓 | **1** | Win by robbing an added kong (§4.6). |
| C7 | No Flowers | 無花 | **1** | The winner revealed no bonus tile during the hand. |

C2 scores whether the win was by self-draw or by discard. Combined with C1 it gives
2 faan (門前清自摸 / 不求人); they are not folded into a single named pattern.
`RULE-FAAN-C1`

### 5.D Bonus tiles

| ID | Pattern | 中文 | Faan | Definition |
|---|---|---|---|---|
| D1 | Own Flower / Own Season | 正花 | **1 each** | A bonus tile matching your seat wind (§2.2). |
| D2 | Complete Set | 一台花 | **2** | All four flowers, or all four seasons. |

A complete set scores **2 and replaces** the D1 faan for the tile inside it; the set
and its own-tile are not both counted. Holding both complete sets scores 2 + 2 = 4
(兩台花). Bonus tiles that are neither your own nor part of a complete set score
nothing. `RULE-FAAN-D1`

### 5.E Limit hands

Each is worth the **ceiling (13 faan)** and **replaces the entire breakdown**. No
other pattern is added.

| ID | Pattern | 中文 | Definition |
|---|---|---|---|
| E1 | Thirteen Orphans | 十三幺 | One of each of the 13 terminals and honours, plus a duplicate of any one. |
| E2 | Nine Gates | 九子連環 | Concealed 1112345678999 in one suit, plus any tile of that suit. |
| E3 | All Kongs | 十八羅漢 | Four kongs plus a pair. |
| E4 | Heavenly Hand | 天糊 | The dealer's opening 14 tiles are already a winning hand. |
| E5 | Earthly Hand | 地糊 | A non-dealer wins on the dealer's very first discard. |
| E6 | Eight Immortals | 八仙過海 | A player holds all 8 bonus tiles. Instant win (§6.3). |

### 5.F Bonus-tile instant win

| ID | Pattern | 中文 | Faan | Definition |
|---|---|---|---|---|
| F1 | Seven Flowers | 花糊 | **3** | A player holds 7 of the 8 bonus tiles. Instant win (§6.3). |

### 5.G Stacking and exclusion

Combinations not listed here **stack**.

| Rule | Effect |
|---|---|
| A1 ⊗ A2 | Mutually exclusive by construction (all chows vs all pungs). |
| A4 excludes A3 | 清一色 is not also 混一色. |
| A9 excludes A3, A4 | 字一色 has no suit tiles; it is neither a full nor a half flush. |
| A9 excludes A10, A11 | All Honours is scored as itself. |
| A10 excludes A11 | 混幺九 requires an honour; 清幺九 forbids one. |
| A6 excludes A5 | Great Three Dragons is not also Small Three Dragons. |
| A8 excludes A7 | Great Four Winds is not also Small Four Winds. |
| A5, A6 **stack with** B1 | The dragon pungs still score 1 each. 小三元 therefore totals 5; 大三元 totals 11 before other patterns. |
| A7, A8 **stack with** B2, B3 | The seat/round wind pungs still score. |
| C1 ⊗ C6 | Robbing a kong is a claim, never a self-draw. |
| C3 ⊗ C4 | One is a draw, the other a discard. |
| C3 ⊗ C5 | A kong replacement comes from the tail, so it is never the last head tile. |
| C1 **stacks with** C3, C5 | Both are self-draws. |
| C7 ⊗ D1, D2 | No Flowers means no bonus tiles at all. |
| E1–E6 | Replace the entire breakdown. Nothing stacks with a limit hand. |
| F1 | Replaces the entire breakdown. |

`RULE-FAAN-G1` … `RULE-FAAN-G13`, one per row.

---

## 6. Winning hands

### 6.1 Structures

Exactly two structural forms win:

1. **Standard** — four sets and one pair, where a set is a chow, pung, or kong.
2. **Thirteen Orphans** — the 13 distinct terminals and honours plus one duplicate.

`RULE-WIN-1`

**EXCLUDED structures:** Seven Pairs (七對子), Thirteen Unconnected (十三不搭), and
every other non-HKOS structure. `RULE-WIN-2`

Nine Gates is *not* a separate structure: 1112345678999 + one more always decomposes as
four sets and a pair, so it is detected as a scoring pattern over a standard hand.
`RULE-WIN-3`

### 6.2 Decomposition ambiguity — **DECISION**

A 14-tile hand can often be read as sets and a pair in more than one way (for example
111222333 reads as three pungs or three identical chows). When readings differ:

**The reading that produces the highest total faan is used.** If two readings tie on
faan, the first in a deterministic enumeration order is used, so the result is
reproducible. `RULE-WIN-4`

**Rationale.** This is the universal convention and it is also the only one that is
kind to a learner: the game never scores a hand lower than the player could have
claimed it.

### 6.3 Instant wins from bonus tiles

Checked immediately after each bonus-tile reveal, before the replacement draw
resolves the turn:

- **7 of the 8 bonus tiles** → 花糊 (F1), the hand ends immediately, 3 faan.
- **All 8 bonus tiles** → 八仙過海 (E6), the hand ends immediately, limit.

Both settle as a **self-draw** (§7.5). The player's concealed tiles are irrelevant and
are not required to form any structure. `RULE-WIN-5`

Both are enabled in V1. They are astronomically rare in real play and exist because
they are part of the ruleset, not because they will be seen.

### 6.4 Declaring

Winning is always **optional**. A player may decline a legal win and play on; the
engine offers Win as an action but never forces it. Bots always take a legal win
(§ issue #6). `RULE-WIN-6`

A win that does not meet the minimum faan (§7.4) is **not a legal action** and is not
offered. `RULE-WIN-7`

---

## 7. Scoring and payment

### 7.1 Qualifying faan vs total faan — **DECISION**

Two numbers come out of the scorer:

- **Qualifying faan** — the total *excluding* every bonus-tile faan (D1, D2) and the
  No Flowers bonus (C7). Used **only** for the minimum-faan test.
- **Total faan** — everything, capped at the ceiling. Used for payment.

**Do flowers count toward the minimum? NO.** `RULE-SCORE-1`

**Rationale.** This is the standard HK answer and the PRD flags it as a frequent source
of "wrong scoring" complaints. Bonus tiles are luck of the draw and are not a
structural achievement; allowing them to carry a hand over the line would let a
shapeless hand win at the 1-faan minimum purely for having drawn its own flower.

### 7.2 Faan ceiling

**13 faan.** Any additive total above 13 is reported as 13. Limit hands (§5.E) are
exactly 13 and are shown as a single line rather than an arithmetic sum.
`RULE-SCORE-2`

The ceiling is a property of the rules profile, not a user-facing setting in V1.

### 7.3 Faan to base points

**base = 2^faan**, with faan capped per §7.2.

| Faan | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Base | 1 | 2 | 4 | 8 | 16 | 32 | 64 | 128 | 256 | 512 | 1024 | 2048 | 4096 | 8192 |

`RULE-SCORE-3`

**Rationale.** Straight doubling is the common HK conversion and is the only one a
learner can hold in their head: one more faan is twice the hand. Tables that flatten
the curve above 4 faan exist and are a house preference; they are **EXCLUDED** from V1.

### 7.4 Minimum faan

| Profile | Minimum qualifying faan |
|---|---|
| Beginner | 0 |
| **Standard (default)** | **1** |
| Classic | 3 |

A hand whose *qualifying* faan is below the minimum cannot be declared a win.
`RULE-SCORE-4`

### 7.5 Payment schedule — **DECISION**

Let `B` be the base points from §7.3.

| Outcome | Discarder / kong-robbed player | Each other loser | Winner receives |
|---|---|---|---|
| **Win by discard** (出銃) | `2B` | `1B` | `4B` |
| **Win by self-draw** (自摸) | — | `2B` each | `6B` |
| **Robbing a kong** | `2B` (the kong declarer) | `1B` | `4B` |
| **Instant flower win** (F1, E6) | — | `2B` each | `6B` |

`RULE-PAY-1` … `RULE-PAY-4`

**Rationale.** This is 半銃 ("half money"), the most common casual HK settlement: the
discarder carries double weight but the table shares the loss, which teaches that a
dangerous discard is costly without making a single mistake catastrophic. The
alternative 全銃 (discarder pays all `4B`) is **EXCLUDED** from V1.

### 7.6 Dealer multiplier — **DECISION**

**There is none.** The dealer neither pays nor receives a multiple.
`RULE-PAY-5`

**Rationale.** In HKOS the dealer's advantage is 連莊 — keeping the deal after a win —
not a payment multiplier. A dealer multiplier is a Japanese/Taiwanese convention. Its
absence also keeps the payment table small enough to display honestly at the end of
every hand.

### 7.7 Scores

Every seat starts a match at **0** and scores go negative. There is no bank, no
buy-in, and no bust-out. `RULE-PAY-6`

---

## 8. Hand and round progression

### 8.1 After a win

| Winner | Dealer next hand | Round wind |
|---|---|---|
| Dealer | Same dealer (連莊) | Unchanged |
| Non-dealer | Rotates to the next seat | Advances when the deal passes back to the starting dealer |

`RULE-PROG-1`

### 8.2 Exhaustive draw (流局) — **DECISION**

The hand ends with no winner when the wall is empty and the tile that would be drawn
cannot be supplied.

- **No payments are made.** No tenpai/noten settlement. `RULE-DRAW-1`
- **The dealer rotates**, exactly as after a non-dealer win. `RULE-DRAW-2`

**Rationale, and a stated DIVERGENCE.** Most HK tables keep the dealer on a draw
(流局連莊). The PRD's locked line is "Dealer continues after dealer win and otherwise
rotates", and a draw is not a dealer win. This document follows the locked PRD wording
rather than the more common table, for two reasons: the locked text is the contract,
and rotating on a draw makes round progress monotonic, which removes an unbounded loop
from both the round logic and the seeded simulation harness. This is the single most
likely rule in this document to be revised after real play; it is one constant and one
test.
`RULE-DRAW-3` asserts the rotation explicitly so that flipping it is a deliberate act.

### 8.3 Match length

| Setting | Ends when |
|---|---|
| Single hand | One hand completes |
| **East round (default)** | The deal has passed through all four seats in the East round |
| Four rounds | East, South, West and North rounds have all completed |

`RULE-PROG-2`

A round ends when the dealership would return to the seat that started the round.
Continuations (連莊) do not advance that count. `RULE-PROG-3`

---

## 9. Reconciliation against `hk-mahjong` v3.2.0

The PRD names `hk-mahjong` as the cross-check. It was read in full. It is **not**
adopted as the scoring authority, and V1 does not take a runtime dependency on it —
see the note at the end of this section.

`hk-mahjong` values that V1 **adopts unchanged**: 平糊 1, 對對糊 3, 混一色 3,
清一色 7, dragon pung 1, 門風 1, 圈風 1, 自摸 1, 門前清 1, 搶槓 1, 海底撈月 1,
正花 1 each, 一台花 2, 花糊 = 7 bonus tiles, and the ∞/limit treatment of 十三幺,
十八羅漢, 九子連環, 八仙過海, 天糊, 地糊.

Every difference below is a **DIVERGENCE** with a named test.

| # | Item | `hk-mahjong` | V1 | Rationale | Test |
|---|---|---|---|---|---|
| 1 | Minimum faan | 3 (`THRESHOLD_OF_VALID_WINNING_HAND`) | 1 default, 0/3 selectable | PRD-locked; 3 faan is unteachable to a beginner | `RECON-1` |
| 2 | 小三元 | Flat 5, dragon pungs suppressed | 3 + 1 + 1 = **5** | Identical total, but the breakdown itemises what the player actually did | `RECON-2` |
| 3 | 大三元 | Limit (∞) | 8 + 3 dragon pungs = 11, reaching 13 with 對對糊 | Keeps the breakdown teachable; still plays as a limit hand in practice | `RECON-3` |
| 4 | 小四喜 | Limit (∞) | 6, stacking | ∞ for a hand that is one pung short of 大四喜 flattens the top of the table | `RECON-4` |
| 5 | 大四喜 | Limit (∞) | 8, stacking → 13 in every real case | Reaches the ceiling anyway; itemised | `RECON-5` |
| 6 | 字一色 | Limit (∞) | 10, stacks with 對對糊 → 13 | 10 faan is the widely published value and it reaches the limit naturally | `RECON-6` |
| 7 | 混幺九 (`isMixedOrphans`) | 1 | **10** | 1 faan for All Terminals and Honours is far outside every published HK table; it is a hand of comparable rarity to 字一色 | `RECON-7` |
| 8 | 清幺九 (`isOrphans`) | Limit (∞) | 10, stacks with 對對糊 → 13 | Symmetry with 字一色; same net result | `RECON-8` |
| 9 | 坎坎糊 (concealed all triplets, self-drawn) | Limit (∞) | **Not a pattern.** Scores 對對糊 3 + 門前清 1 + 自摸 1 = 5 | A limit hand for a common shape distorts the whole table; the components already reward it | `RECON-9` |
| 10 | 槓上開花 | 2, and *replaces* 自摸 | **1**, and *stacks with* 自摸 (total 2) | Same total, but the breakdown names both facts, and it composes rather than special-cases | `RECON-10` |
| 11 | 槓上槓自摸 (win on a second consecutive kong replacement) | Limit (∞) | **Not a pattern.** Scores as 槓上開花 | A limit hand for a timing coincidence | `RECON-11` |
| 12 | 河底撈魚 (win on the last discard) | Absent | **1** | Present in HK tables and the natural counterpart to 海底撈月 | `RECON-12` |
| 13 | 無花 (no bonus tiles) | 1, computed only when `enableBonusFaanDueToZeroExtraTile` is set | **1**, always | Same value, unconditional | `RECON-13` |
| 14 | `isAllOneSuit` | Returns true for an all-honours hand (it only compares meld suit types for equality, and `honor` equals `honor`) | 清一色 requires a **numbered suit** and no honours | This is a defect in the reference, not a rules variant | `RECON-14` |
| 15 | Flowers and the minimum | No concept of a minimum-excluded faan | Bonus faan excluded from the qualifying total (§7.1) | PRD flags this explicitly as a decision to be made | `RECON-15` |
| 16 | Payment | Not implemented | §7.5 | The reference scores hands; it does not settle them | `RECON-16` |

### 9.1 Dependency decision — **DECISION**

**V1 does not take a runtime dependency on `hk-mahjong`.** The scorer is implemented
directly from this document.

**Rationale.** After the 16 divergences above, the reference agrees with this contract
on roughly half the table, has no payment model, no minimum-faan-exclusion model, no
notion of the engine's meld/state types, and at least one outright defect (#14). The
adapter shim needed to translate engine state into its `Hand`/`config` shape and then
correct its output would be larger and harder to test than the ~300 lines of scoring
this contract actually needs. The PRD's reason for naming it — "the hardest and most
disputed part already exists as MIT TypeScript" — is honoured by using it as the
research oracle it has now served as, recorded in this table.

This reverses the PRD's architecture sketch, which showed `hk-mahjong` as a runtime
layer. It does not change any product behaviour, and it is recorded here rather than
made silently.

---

## 10. Determinism

- A `seed` plus the rules profile fully determines the wall.
- Given the same seed, profile, and action sequence, every state is byte-identical.
- The engine holds no clock, no ambient RNG, and no I/O. `RULE-DET-1`

Bots receive a separate seed so that changing bot behaviour does not change the deal.
`RULE-DET-2`

---

## 11. Information redaction

The public state a seat receives contains:

- Its own concealed tiles.
- Every seat's exposed melds and revealed bonus tiles.
- The discard pile, in order, with who discarded each tile.
- Seat wind, round wind, dealer, whose turn it is, and the **count** of tiles left in
  the wall.
- Scores.

It must **never** contain another seat's concealed tiles, the contents or order of the
wall, or a concealed kong's tile identity (only that a concealed kong exists).
`RULE-REDACT-1` … `RULE-REDACT-3`

Bots consume exactly this structure. `RULE-REDACT-4`

---

## 12. Explicitly excluded from V1

Riichi and any Japanese rule (dora, furiten, riichi declaration, tenpai settlement,
sacred discard), Taiwanese 16-tile play, Chinese Official / MCR scoring, Seven Pairs,
All Green (綠一色), Four Concealed Triplets as a named hand, 坎坎糊, 槓上槓, multiple
winners on one discard, 全銃 settlement, dealer payment multipliers, flat-curve payment
tables, a reserved dead wall, and any rule not written in this document.

---

## 13. Test index

The test corpus (issue #5) must contain a named test for every identifier in this
document. The identifiers are the contract.

| Prefix | Area | Count |
|---|---|---|
| `RULE-TILES-*` | Tile set and bonus ownership | 2 |
| `RULE-DEAL-*` | Deal and starting hands | 3 |
| `RULE-WALL-*` | Wall and dead-wall model | 2 |
| `RULE-FLOWER-*` | Bonus reveal and replacement | 4 |
| `RULE-TURN-*` | Turn structure | 1 |
| `RULE-CLAIM-*` | Claim legality and priority | 5 |
| `RULE-KONG-*` | Kong kinds | 3 |
| `RULE-ROB-*` | Robbing a kong | 3 |
| `RULE-FAAN-*` | Faan values, stacking, exclusion | 16 |
| `RULE-WIN-*` | Winning structures and declaration | 7 |
| `RULE-SCORE-*` | Qualifying faan, ceiling, conversion, minimum | 4 |
| `RULE-PAY-*` | Payment schedule | 6 |
| `RULE-PROG-*` | Dealer and round progression | 3 |
| `RULE-DRAW-*` | Exhaustive draw | 3 |
| `RULE-DET-*` | Determinism | 2 |
| `RULE-REDACT-*` | Information redaction | 4 |
| `RECON-*` | Divergences from `hk-mahjong` | 16 |

---

## 14. Attribution

`hk-mahjong` v3.2.0 — MIT License, © 2021 Peter H. (HSKPeter). Used during research as
a scoring reference. No code from it is copied into this repository and it is not a
runtime dependency; §9 records what was learned from reading it.
