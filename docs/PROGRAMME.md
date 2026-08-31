# Mahjong V1 Programme

> **Status: PLANNED / PAUSED. Do not implement until explicitly started.**

The authoritative product definition is [`PRD.md`](PRD.md). GitHub Issue #1 is the parent programme tracker.

## Dependency-ordered work

| Stage | Issue | Gate |
|---|---|---|
| Rules contract | #2 — V1.1 Lock Hong Kong Old Style rules contract | Blocks all engine work |
| Engine | #3 — V1.2 Deterministic headless engine core and game record | Requires #2 |
| Scoring | #4 — V1.3 Integrate and reconcile Hong Kong faan scoring | Requires #2–#3 |
| Correctness | #5 — V1.4 Invariant test corpus and seeded simulation | **Hard gate before visual work** |
| Bots | #6 — V1.5 Competent non-cheating heuristic bots | Requires engine/scoring/gate |
| Interaction | #7 — V1.6 Real-phone interaction prototype | Requires correctness gate |
| Presentation | #8 — V1.7 Production table, SVG tiles and tactile presentation | Requires gate + interaction |
| Learning | #9 — V1.8 Contextual learning, assist and rules reference | Requires production table |
| Persistence | #10 — V1.9 Local persistence, resume and basic stats | Requires game records + UI |
| Android | #11 — V1.10 Package and verify offline Android app | Final integration/acceptance |

## Non-negotiable ordering

1. Rules decisions must not be inherited accidentally from code or a dependency.
2. Engine correctness is established headlessly before presentation work.
3. The seeded simulation/tile-conservation gate must be green before production visual work.
4. Core interaction is validated on the actual phone before the full visual system is built.
5. Android packaging comes last, after the web game itself is complete.

## Scope firewall

Until V1 is complete, do not add multiplayer, network services, accounts, telemetry, cloud storage, ads, monetisation, 3D/WebGL, characters, ranks, achievements, Riichi, or other mahjong variants.

## Start condition

The project starts only when the author explicitly authorises implementation. At that point begin with #2, not with application scaffolding or UI.
