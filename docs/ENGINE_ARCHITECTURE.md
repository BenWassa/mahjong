# V1 engine architecture

This document records the implementation boundary established by Issue #3. Rules
semantics remain authoritative in [`HKOS_RULES.md`](HKOS_RULES.md); this file explains
how the engine makes those semantics deterministic, replayable, and safe to consume.

## Public boundary

Production consumers import only `src/engine/index.ts` (or the package root):

```ts
const game = newGame(config, seed)
const view = game.state(viewerSeat)
const choices = game.legalActions(actingSeat)
const next = game.act(choice)
const record = next.gameRecord()
```

`MahjongGame` is immutable. `act` returns a new adapter snapshot backed by the pure
`reduceGame(state, action)` transition. UI, bots, and persistence must not deep-import
the reducer's internal state.

The engine build has no DOM library and no UI, storage, network, clock, or ambient RNG
dependency. `hk-mahjong` remains a research reference only and is not a runtime
dependency.

## Determinism and records

- A string game seed derives a stable seed for each hand.
- The physical tile inventory, physical tile IDs, seed hash, PRNG, and Fisher–Yates
  ordering are compatibility contracts covered by fixed-vector tests.
- Automatic draws, bonus reveals, melds, and hand results are deterministic events.
- Player decisions are recorded with logical sequence numbers and hand numbers.
- `replayGame(record)` reconstructs from the seed and actions and rejects any record
  whose resulting events or results differ.

The PRD's illustrative wall-clock timestamps are intentionally outside the engine.
Issue #10 may attach local persistence metadata, but a clock cannot affect game state
or replay identity.

The trusted record contains hidden tile events needed for exact reproduction. It is
never embedded in `PublicGameState` and must never be provided to a bot.

## State machine

Only one phase is active:

1. `awaiting-discard` — one seat may win, declare a kong, or discard;
2. `awaiting-claims` — every eligible seat independently declares a claim or passes;
3. `awaiting-rob` — eligible opponents may win on a proposed added kong;
4. `hand-ended` — a deterministic Continue action advances the match; or
5. `match-ended` — terminal.

All eligible discard responses are collected before arbitration. Resolution does not
depend on response order: Win outranks Pung/Kong, which outrank Chow; ties go to the
nearest seat after the discarder. An added kong is left unmodified until the robbery
window closes, so a successful robbery naturally leaves the original exposed pung.

The chronological discard ledger retains claimed entries for table history. A claimed
tile's physical ownership transfers to the meld, and conservation treats the ledger
entry as a reference rather than a second tile.

## Winning and the scoring seam

Issue #3 enumerates deterministic structural candidates:

- standard four-sets-and-a-pair hands, adjusted for existing melds; and
- Thirteen Orphans.

Pairs use canonical tile order; recursive decomposition tries Pung before Chow. Issue
#4 will score every candidate, select the highest-faan reading, apply the configured
minimum, and produce settlement. Until that scorer exists, ordinary Win actions are
available only in the Beginner (0-faan) profile. This avoids temporarily presenting an
unknown hand as legal under the 1- or 3-faan profiles while still allowing structural
win and claim-priority tests in Issue #3.

Seven Flowers and Eight Immortals are structural bonus-tile terminal events and do not
use that temporary seam.

## Bonus resolution details

The initial physical deal is dealer-first, four tiles at a time for three rounds, then
one per seat and the dealer's fourteenth tile. Bonus resolution then starts with the
dealer. Each seat's replacement chain completes from the tail before the next seat is
processed.

For the otherwise unreachable Eight Immortals edge case, already-acquired unresolved
bonus tiles from the initial deal count toward the player's holding. Eight takes
precedence over Seven when that initial holding is inspected. Both outcomes are
immediate, as required by §6.3. Any unrevealed bonus tiles are moved out of concealed
hands as terminal-state conservation cleanup without drawing further replacements.

A non-bonus tile reached through a bonus chain after a kong remains a kong-replacement
draw for later scoring purposes.

## Redaction

`state(viewerSeat)` contains that seat's concealed tiles, all exposed melds and bonus
tiles, public discard history, winds, scores, turn, and wall count. It excludes every
opponent concealed tile and all wall contents/order. An opponent's concealed kong is
represented only by its existence and count; its kind and physical IDs are absent.

Bots in Issue #6 will receive this exact seat-scoped structure and legal-action list,
not a privileged engine snapshot.

## Invariants

Every accepted transition asserts the configured 136- or 144-tile inventory. Each
physical ID must occur in exactly one live zone: wall, concealed hand, meld, bonus area,
or unclaimed discard. Bonus tiles may exist only in the wall or bonus area once a state
is externally observable. Record seed/configuration, player seats, meld sizes, and
claimed-discard ownership are checked at the same boundary.

Issue #5 expands these checks into the complete named `RULE-*` / `RECON-*` corpus and a
fixed-count seeded simulation gate before production visual work.
