# Issue #5 correctness audit and rule coverage

`docs/HKOS_RULES.md` is authoritative. This ledger records where each `RULE-*` and `RECON-*` contract identifier is exercised after Issue #4 merged. Issue #5 does not reinterpret scoring expectations; it maps the locked contract to the tests already accepted in #3/#4 and adds only mechanical correctness coverage.

## Issue #3 audit

The merged #3 engine already covered deal shape, ordinary turn progression, Chow restriction, claim priority, Kong transitions, added-Kong robbery, structural wins, dealer/round progression, deterministic adapter replay, and public-state redaction.

Issue #5 adds the mechanical gaps found by that audit:

- exhaustive machine-checked enumeration of all 84 rules-contract identifiers;
- focused coverage for bonus ownership rotation, bonus replacement chains, empty-wall Kong suppression, multiple-Win nearest-seat resolution, the physical impossibility behind conflicting Pung/Kong claims, concealed-Kong non-robbability, optional winning, instant seven/eight bonus-tile termination, and concealed-Kong identity redaction;
- stronger invariants for canonical tile ID/kind agreement, seat tuple identity, discard-ledger indexing/claim consistency, action-record indexing, and illegal bonus placement;
- deterministic complete-game simulation through the merged scored engine, across minimum-faan profiles 0/1/3 and both tile-set profiles;
- exact replay verification plus reproduction seed, profile, phase, and full action history on failure;
- routine CI plumbing with a fixed 2,000-game simulation corpus.

No scoring semantics are introduced here. Scoring-dependent expectations below point to the focused tests merged with #4.

## Coverage ledger

| Identifier | Explicit executable coverage |
|---|---|
| `RULE-TILES-1` | `mechanical-contracts.test.ts`; scoring profile behavior in `scoring.test.ts`. |
| `RULE-TILES-2` | `mechanical-contracts.test.ts`. |
| `RULE-DEAL-1` | `core-transitions.test.ts`. |
| `RULE-DEAL-2` | `core-transitions.test.ts`. |
| `RULE-DEAL-3` | `core-transitions.test.ts`. |
| `RULE-WALL-1` | `core-transitions.test.ts`. |
| `RULE-WALL-2` | `mechanical-contracts.test.ts`. |
| `RULE-FLOWER-1` | `mechanical-contracts.test.ts`. |
| `RULE-FLOWER-2` | `mechanical-contracts.test.ts`. |
| `RULE-FLOWER-3` | `mechanical-contracts.test.ts`. |
| `RULE-FLOWER-4` | `mechanical-contracts.test.ts`. |
| `RULE-TURN-1` | `core-transitions.test.ts`. |
| `RULE-CLAIM-1` | `core-transitions.test.ts`. |
| `RULE-CLAIM-2` | `core-transitions.test.ts`. |
| `RULE-CLAIM-3` | `mechanical-contracts.test.ts`. |
| `RULE-CLAIM-4` | `mechanical-contracts.test.ts`. |
| `RULE-CLAIM-5` | `core-transitions.test.ts` and scored minimum-faan claim regression in `scored-core.test.ts`. |
| `RULE-KONG-1` | `core-transitions.test.ts`. |
| `RULE-KONG-2` | transition coverage in `core-transitions.test.ts`; concealed-scoring behavior in `scoring.test.ts`. |
| `RULE-KONG-3` | `core-transitions.test.ts`. |
| `RULE-ROB-1` | transition coverage in `core-transitions.test.ts`; scoring/payment coverage in `scoring.test.ts`. |
| `RULE-ROB-2` | `mechanical-contracts.test.ts`. |
| `RULE-ROB-3` | `core-transitions.test.ts`. |
| `RULE-FAAN-B1` | `scoring.test.ts` seat-wind + round-wind stacking regression. |
| `RULE-FAAN-C1` | `scoring.test.ts` self-draw / fully-concealed stacking coverage. |
| `RULE-FAAN-D1` | `scoring.test.ts` D1/D2 replacement coverage. |
| `RULE-FAAN-G1` | `scoring.test.ts` A1/A2 exclusion coverage. |
| `RULE-FAAN-G2` | `scoring.test.ts` A4/A3 exclusion coverage. |
| `RULE-FAAN-G3` | `scoring.test.ts` All Honours flush exclusion coverage. |
| `RULE-FAAN-G4` | `scoring.test.ts` All Honours terminal/honour exclusion coverage. |
| `RULE-FAAN-G5` | `scoring.test.ts` A10/A11 exclusion coverage. |
| `RULE-FAAN-G6` | `scoring.test.ts` A6/A5 exclusion coverage. |
| `RULE-FAAN-G7` | `scoring.test.ts` A8/A7 exclusion coverage. |
| `RULE-FAAN-G8` | `scoring.test.ts` dragon-pattern + B1 stacking coverage. |
| `RULE-FAAN-G9` | `scoring.test.ts` wind-pattern + B2/B3 stacking coverage. |
| `RULE-FAAN-G10` | `scoring.test.ts` robbed-Kong/self-draw exclusion coverage. |
| `RULE-FAAN-G11` | `scoring.test.ts` last-wall/last-discard exclusion coverage. |
| `RULE-FAAN-G12` | `scoring.test.ts` last-wall/Kong-replacement incompatibility coverage. |
| `RULE-FAAN-G13` | `scoring.test.ts` self-draw stacking and No-Flowers incompatibility coverage. |
| `RULE-WIN-1` | `winning.test.ts`. |
| `RULE-WIN-2` | `winning.test.ts`. |
| `RULE-WIN-3` | `winning.test.ts`. |
| `RULE-WIN-4` | structural enumeration in `winning.test.ts`; highest-faan selection in `scoring.test.ts`. |
| `RULE-WIN-5` | mechanical instant termination in `mechanical-contracts.test.ts`; F1/E6 scoring in `scoring.test.ts`. |
| `RULE-WIN-6` | `mechanical-contracts.test.ts`. |
| `RULE-WIN-7` | scored legal-action filtering in `scored-core.test.ts`. |
| `RULE-SCORE-1` | `scoring.test.ts` qualifying-vs-total faan regression. |
| `RULE-SCORE-2` | `scoring.test.ts` 13-faan ceiling regression. |
| `RULE-SCORE-3` | `scoring.test.ts` base-points conversion regression. |
| `RULE-SCORE-4` | `scoring.test.ts` and `scored-core.test.ts` 0/1/3 minimum-faan regressions. |
| `RULE-PAY-1` | `scoring.test.ts` plus integrated settlement in `scored-core.test.ts`. |
| `RULE-PAY-2` | `scoring.test.ts` plus existing-score settlement in `scored-core.test.ts`. |
| `RULE-PAY-3` | `scoring.test.ts` robbed-Kong payment regression. |
| `RULE-PAY-4` | `scoring.test.ts` instant-flower payment regression. |
| `RULE-PAY-5` | `scoring.test.ts` no-dealer-multiplier regression. |
| `RULE-PAY-6` | `scored-core.test.ts` zero-start/negative-score settlement regression. |
| `RULE-PROG-1` | `core-transitions.test.ts`. |
| `RULE-PROG-2` | `core-transitions.test.ts`. |
| `RULE-PROG-3` | `core-transitions.test.ts`. |
| `RULE-DRAW-1` | `core-transitions.test.ts`. |
| `RULE-DRAW-2` | `core-transitions.test.ts`. |
| `RULE-DRAW-3` | `core-transitions.test.ts`. |
| `RULE-DET-1` | adapter replay tests plus complete-game `seeded-simulation.test.ts`. |
| `RULE-DET-2` | `seeded-simulation.test.ts` uses an independent action-selection seed. |
| `RULE-REDACT-1` | `adapter-replay-redaction.test.ts`. |
| `RULE-REDACT-2` | `adapter-replay-redaction.test.ts`. |
| `RULE-REDACT-3` | `adapter-replay-redaction.test.ts` plus explicit concealed-Kong regression in `mechanical-contracts.test.ts`. |
| `RULE-REDACT-4` | `adapter-replay-redaction.test.ts`. |
| `RECON-1` | `scoring.test.ts` and `scored-core.test.ts` minimum-faan regressions. |
| `RECON-2` | `scoring.test.ts` Small Three Dragons itemisation regression. |
| `RECON-3` | `scoring.test.ts` Great Three Dragons regression. |
| `RECON-4` | `scoring.test.ts` Small Four Winds regression. |
| `RECON-5` | `scoring.test.ts` Great Four Winds regression. |
| `RECON-6` | `scoring.test.ts` All Honours regression. |
| `RECON-7` | `scoring.test.ts` Mixed Terminals & Honours regression. |
| `RECON-8` | `scoring.test.ts` All Terminals regression. |
| `RECON-9` | `scoring.test.ts` concealed all-triplets non-limit regression. |
| `RECON-10` | `scoring.test.ts` Kong-replacement + self-draw regression. |
| `RECON-11` | `scoring.test.ts` no second-consecutive-Kong limit regression. |
| `RECON-12` | `scoring.test.ts` Last Discard regression. |
| `RECON-13` | `scoring.test.ts` No Flowers regression. |
| `RECON-14` | `scoring.test.ts` all-honours/All-One-Suit exclusion regression. |
| `RECON-15` | `scoring.test.ts` bonus-faan qualifying exclusion regression. |
| `RECON-16` | `scoring.test.ts` and `scored-core.test.ts` payment regressions. |

## Merge gate

Issue #5 is mergeable only when this branch is based on the merged #4 `main`, the 84-identifier executable-coverage gate passes, and the full CI gate—including the fixed seeded complete-game corpus—passes without changing the locked expectations in `docs/HKOS_RULES.md`.
