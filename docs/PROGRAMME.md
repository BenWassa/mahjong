# Mahjong V1 Programme

> **Status: IN PROGRESS.** Started 2026-08-31.

The authoritative product definition is [`PRD.md`](PRD.md), with the V1 delivery amendment below. The authoritative rules definition is [`HKOS_RULES.md`](HKOS_RULES.md). GitHub Issue #1 is the parent programme tracker.

## V1 delivery amendment — PWA

V1 must ship as an **installable Progressive Web App as well as the Capacitor Android app**.

- One React + Vite application powers both surfaces.
- The PWA must be installable and work fully offline after its first successful load/install.
- Engine, bots, rules reference, tile assets, sounds and core gameplay must be available offline.
- No backend, account or runtime network dependency is introduced by making it a PWA.
- PWA manifest, icons, service worker/offline caching and installability belong to the production-app work in #8.
- #11 verifies both the installable PWA and the Capacitor Android package against the same offline product.

This amendment supersedes any PRD wording that implies Android is the only V1 delivery surface; all other PRD scope remains unchanged.

## Dependency-ordered work

| Stage | Issue | Gate |
|---|---|---|
| Rules contract | #2 — V1.1 Lock Hong Kong Old Style rules contract | **Done** — [`HKOS_RULES.md`](HKOS_RULES.md) |
| Engine | #3 — V1.2 Deterministic headless engine core and game record | **Done** — PR #13 |
| Scoring | #4 — V1.3 Integrate and reconcile Hong Kong faan scoring | **Done** — PR #14 |
| Correctness | #5 — V1.4 Invariant test corpus and seeded simulation | **Done** — PR #17, `tests/gate/`, `src/sim/` |
| Bots | #6 — V1.5 Competent non-cheating heuristic bots | **Done** — public-state policy + seeded benchmark |
| Interaction | #7 — V1.6 Real-phone interaction prototype | Requires correctness gate |
| Presentation + PWA | #8 — V1.7 Production table, SVG tiles, tactile presentation and installable PWA | Requires gate + interaction |
| Learning | #9 — V1.8 Contextual learning, assist and rules reference | Requires production table |
| Persistence | #10 — V1.9 Local persistence, resume and basic stats | Requires game records + UI |
| PWA + Android acceptance | #11 — V1.10 Verify installable PWA and package offline Android app | Final integration/acceptance |

## Non-negotiable ordering

1. Rules decisions must not be inherited accidentally from code or a dependency.
2. Engine correctness is established headlessly before presentation work.
3. The seeded simulation/tile-conservation gate must be green before production visual work.
4. Core interaction is validated on the actual phone before the full visual system is built.
5. The production web app is built as an installable offline PWA; Capacitor packaging comes last.

## Scope firewall

Until V1 is complete, do not add multiplayer, network services, accounts, telemetry, cloud storage, ads, monetisation, 3D/WebGL, characters, ranks, achievements, Riichi, or other mahjong variants.

## Progress

| Issue | State |
|---|---|
| #2 Rules contract | Complete |
| #3 Engine core | Complete |
| #4 Scoring | Complete |
| #5 Correctness gate | Complete |
| #6 Bots | Complete |
| #7 Interaction prototype | Not started |
| #8 Production table + PWA | Not started |
| #9 Learning layer | Not started |
| #10 Persistence | Not started |
| #11 PWA + Android acceptance | Not started |
