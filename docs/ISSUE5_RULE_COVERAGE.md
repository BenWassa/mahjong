# Issue #5 pre-#4 correctness audit and rule coverage

This file is the mechanical coverage ledger for Issue #5. `docs/HKOS_RULES.md` remains authoritative.

This branch deliberately does **not** decide scoring semantics. Identifiers whose expected result requires faan detection, stacking/exclusion, qualifying-vs-total faan, payment, or minimum-faan legality remain blocked on Issue #4. After #4 merges, this branch must be rebased and every blocked or split row must be reconciled against the merged focused scoring tests before #5 can merge.

## Issue #3 audit

The merged #3 engine already covers deal shape, ordinary turn progression, Chow restriction, claim priority, Kong transitions, added-Kong robbery, structural wins, dealer/round progression, deterministic adapter replay, and public-state redaction.

The pre-#4 gaps addressed mechanically by this branch are:

- no exhaustive machine-checked inventory of the rules-contract identifiers;
- no explicit coverage for bonus ownership rotation, bonus replacement chains, empty-wall Kong suppression, multiple-Win nearest-seat resolution, the physical impossibility behind conflicting Pung/Kong claims, concealed-Kong non-robbability, optional winning, instant seven/eight bonus-tile termination, and concealed-Kong identity redaction;
- invariants did not verify canonical tile ID/kind agreement, seat tuple identity, discard-ledger indexing/claim consistency, or action-record indexing;
- replay tests covered bounded action prefixes rather than complete seeded games;
- no seeded complete-game simulation gate printed the reproduction seed and complete action history on failure;
- CI did not set an agreed simulation count.

No new rules interpretation is introduced here. Scoring-dependent portions of mechanically testable rules are marked **split with #4** rather than inferred.

## Coverage ledger

| Identifier | Pre-#4 status | Explicit coverage / post-#4 action |
|---|---|---|
| `RULE-TILES-1` | Split with #4 | `mechanical-contracts.test.ts` proves the 136 inventory has no bonus tiles. After #4, verify bonus-related scoring items are omitted, not zero-valued. |
| `RULE-TILES-2` | Covered | `mechanical-contracts.test.ts` rotates dealer/seat wind and checks flower/season ownership. |
| `RULE-DEAL-1` | Covered in #3 | `core-transitions.test.ts` checks the deterministic traditional deal record. |
| `RULE-DEAL-2` | Covered in #3 | `core-transitions.test.ts` checks dealer 14 / others 13 after the ordinary deal. |
| `RULE-DEAL-3` | Covered in #3 | `core-transitions.test.ts` checks post-deal conservation and wall/bonus accounting. |
| `RULE-WALL-1` | Covered in #3 | `core-transitions.test.ts` exercises true wall exhaustion with no reserved dead wall. |
| `RULE-WALL-2` | Covered | `mechanical-contracts.test.ts` suppresses concealed/exposed Kong actions at an empty wall. |
| `RULE-FLOWER-1` | Covered | `mechanical-contracts.test.ts` forces a multi-bonus replacement chain from the wall tail. |
| `RULE-FLOWER-2` | Covered | `mechanical-contracts.test.ts` checks dealer-first seat ordering during initial bonus resolution. |
| `RULE-FLOWER-3` | Covered | `mechanical-contracts.test.ts` proves resolved bonus tiles remain out of concealed/discard actions. |
| `RULE-FLOWER-4` | Covered | `mechanical-contracts.test.ts` forces a bonus draw with no replacement and expects exhaustive draw. |
| `RULE-TURN-1` | Covered in #3 | `core-transitions.test.ts` checks automatic next draw and direct discard after claims. |
| `RULE-CLAIM-1` | Covered in #3 | `core-transitions.test.ts` offers Chow only to the next seat. |
| `RULE-CLAIM-2` | Covered in #3 | `core-transitions.test.ts` checks Pung/Kong over Chow and Win over Pung under the pre-#4 zero-minimum structural path. |
| `RULE-CLAIM-3` | Covered | `mechanical-contracts.test.ts` submits two Wins in reverse priority order and verifies nearest seat wins. |
| `RULE-CLAIM-4` | Covered | `mechanical-contracts.test.ts` proves the conflicting Pung/Kong premise requires a fifth physical copy. |
| `RULE-CLAIM-5` | Covered in #3 | `core-transitions.test.ts` proves no claim prompt is created when nothing is claimable. |
| `RULE-KONG-1` | Covered in #3 | `core-transitions.test.ts` covers concealed/exposed Kong replacement from the tail. |
| `RULE-KONG-2` | Split with #4 | #3 covers concealed Kong exposure mechanics; after #4, verify it still qualifies as fully concealed for scoring. |
| `RULE-KONG-3` | Covered in #3 | `core-transitions.test.ts` checks in-place exposed Pung promotion to added Kong. |
| `RULE-ROB-1` | Split with #4 | #3 covers added-Kong robbery state/payment source metadata; after #4, verify the scoring/payment consequences. |
| `RULE-ROB-2` | Covered | `mechanical-contracts.test.ts` uses a Thirteen-Orphans wait and proves concealed Kong never opens a robbery phase. |
| `RULE-ROB-3` | Covered in #3 | `core-transitions.test.ts` checks successful robbery restores the exposed Pung and cancels the Kong event. |
| `RULE-FAAN-B1` | Blocked on #4 | Reconcile to merged scoring test for simultaneous seat-wind + round-wind faan. |
| `RULE-FAAN-C1` | Blocked on #4 | Reconcile to merged scoring test for self-draw + fully concealed stacking. |
| `RULE-FAAN-D1` | Blocked on #4 | Reconcile to merged scoring test for own bonus vs complete-set replacement. |
| `RULE-FAAN-G1` | Blocked on #4 | Reconcile to merged focused stacking/exclusion row 1 test. |
| `RULE-FAAN-G2` | Blocked on #4 | Reconcile to merged focused stacking/exclusion row 2 test. |
| `RULE-FAAN-G3` | Blocked on #4 | Reconcile to merged focused stacking/exclusion row 3 test. |
| `RULE-FAAN-G4` | Blocked on #4 | Reconcile to merged focused stacking/exclusion row 4 test. |
| `RULE-FAAN-G5` | Blocked on #4 | Reconcile to merged focused stacking/exclusion row 5 test. |
| `RULE-FAAN-G6` | Blocked on #4 | Reconcile to merged focused stacking/exclusion row 6 test. |
| `RULE-FAAN-G7` | Blocked on #4 | Reconcile to merged focused stacking/exclusion row 7 test. |
| `RULE-FAAN-G8` | Blocked on #4 | Reconcile to merged focused stacking/exclusion row 8 test. |
| `RULE-FAAN-G9` | Blocked on #4 | Reconcile to merged focused stacking/exclusion row 9 test. |
| `RULE-FAAN-G10` | Blocked on #4 | Reconcile to merged focused stacking/exclusion row 10 test. |
| `RULE-FAAN-G11` | Blocked on #4 | Reconcile to merged focused stacking/exclusion row 11 test. |
| `RULE-FAAN-G12` | Blocked on #4 | Reconcile to merged focused stacking/exclusion row 12 test. |
| `RULE-FAAN-G13` | Blocked on #4 | Reconcile to merged focused stacking/exclusion row 13 test. |
| `RULE-WIN-1` | Covered in #3 | `winning.test.ts` checks standard and Thirteen-Orphans structures. |
| `RULE-WIN-2` | Covered in #3 | `winning.test.ts` rejects Seven Pairs and unrelated excluded shapes. |
| `RULE-WIN-3` | Covered in #3 | `winning.test.ts` verifies Nine Gates decomposes as standard structure. |
| `RULE-WIN-4` | Split with #4 | #3 proves deterministic decomposition enumeration. After #4, verify scorer chooses highest-faan decomposition and deterministic tie break. |
| `RULE-WIN-5` | Split with #4 | `mechanical-contracts.test.ts` proves seven/eight bonus-tile immediate termination without structural hand. After #4, verify 3-faan/limit settlement. |
| `RULE-WIN-6` | Covered | `mechanical-contracts.test.ts` proves a legal structural Win can be declined by choosing a discard. |
| `RULE-WIN-7` | Blocked on #4 | Minimum-faan legality must be tested only against the merged scorer. |
| `RULE-SCORE-1` | Blocked on #4 | Reconcile qualifying-vs-total faan test after #4. |
| `RULE-SCORE-2` | Blocked on #4 | Reconcile 13-faan ceiling/limit representation test after #4. |
| `RULE-SCORE-3` | Blocked on #4 | Reconcile faan-to-base-points conversion test after #4. |
| `RULE-SCORE-4` | Blocked on #4 | Reconcile 0/1/3 minimum-faan profiles after #4. |
| `RULE-PAY-1` | Blocked on #4 | Reconcile discard-win settlement test after #4. |
| `RULE-PAY-2` | Blocked on #4 | Reconcile self-draw settlement test after #4. |
| `RULE-PAY-3` | Blocked on #4 | Reconcile robbed-Kong settlement test after #4. |
| `RULE-PAY-4` | Blocked on #4 | Reconcile instant-flower settlement test after #4. |
| `RULE-PAY-5` | Blocked on #4 | Reconcile absence of dealer multiplier after #4. |
| `RULE-PAY-6` | Blocked on #4 | Reconcile zero-start/negative-score accounting after #4. |
| `RULE-PROG-1` | Covered in #3 | `core-transitions.test.ts` checks dealer continuation only after dealer win. |
| `RULE-PROG-2` | Covered in #3 | `core-transitions.test.ts` checks East-round termination. |
| `RULE-PROG-3` | Covered in #3 | `core-transitions.test.ts` checks return-to-round-starter progression semantics. |
| `RULE-DRAW-1` | Covered in #3 | `core-transitions.test.ts` verifies exhaustive draw makes no score changes. |
| `RULE-DRAW-2` | Covered in #3 | `core-transitions.test.ts` verifies dealer rotates after exhaustive draw. |
| `RULE-DRAW-3` | Covered in #3 | `core-transitions.test.ts` explicitly locks the draw-rotation divergence. |
| `RULE-DET-1` | Covered + simulation | Existing adapter replay plus `seeded-simulation.test.ts` verify exact complete-game replay from seed + actions. |
| `RULE-DET-2` | Covered | `seeded-simulation.test.ts` derives an independent bot-action seed and leaves the wall seed untouched. |
| `RULE-REDACT-1` | Covered in #3 | `adapter-replay-redaction.test.ts` shows only the viewer's concealed hand. |
| `RULE-REDACT-2` | Covered in #3 | `adapter-replay-redaction.test.ts` exposes wall count but not contents/order. |
| `RULE-REDACT-3` | Covered + strengthened | Existing trusted-record boundary plus `mechanical-contracts.test.ts` explicitly hide opponent concealed-Kong identity. |
| `RULE-REDACT-4` | Covered in #3 | `adapter-replay-redaction.test.ts` verifies every seat receives the same public schema. |
| `RECON-1` | Blocked on #4 | Reconcile default/selectable minimum-faan regression. |
| `RECON-2` | Blocked on #4 | Reconcile Small Three Dragons itemised breakdown regression. |
| `RECON-3` | Blocked on #4 | Reconcile Great Three Dragons non-flat-limit regression. |
| `RECON-4` | Blocked on #4 | Reconcile Small Four Winds stacking regression. |
| `RECON-5` | Blocked on #4 | Reconcile Great Four Winds stacking regression. |
| `RECON-6` | Blocked on #4 | Reconcile All Honours 10-faan stacking regression. |
| `RECON-7` | Blocked on #4 | Reconcile Mixed Terminals & Honours value regression. |
| `RECON-8` | Blocked on #4 | Reconcile All Terminals value/stacking regression. |
| `RECON-9` | Blocked on #4 | Reconcile absence of concealed-all-triplets named limit. |
| `RECON-10` | Blocked on #4 | Reconcile Kong-replacement + self-draw itemisation regression. |
| `RECON-11` | Blocked on #4 | Reconcile absence of second-consecutive-Kong named limit. |
| `RECON-12` | Blocked on #4 | Reconcile Last Discard pattern regression. |
| `RECON-13` | Blocked on #4 | Reconcile unconditional No Flowers regression. |
| `RECON-14` | Blocked on #4 | Reconcile All One Suit rejection for all-honours hands. |
| `RECON-15` | Blocked on #4 | Reconcile flower exclusion from qualifying faan. |
| `RECON-16` | Blocked on #4 | Reconcile payment implementation against the locked contract. |

## Post-#4 merge gate

Before this PR can be made mergeable:

1. Rebase onto the merged #4 `main`.
2. Replace every **blocked on #4** row with the exact merged focused test location; add missing tests rather than changing expected rules.
3. Complete the scoring-dependent half of every **split with #4** row.
4. Run the complete Issue #5 gate with the CI simulation count.
5. Keep any ambiguity as an explicit blocker; do not infer a rule that is not stated by `docs/HKOS_RULES.md`.
