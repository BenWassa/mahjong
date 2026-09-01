# mahjong

A clean, modern Hong Kong Old Style Mahjong game for mobile. Offline-first, rules-accurate, and focused on tactile play, strong AI, clear scoring, elegant learning, and zero casino clutter, gacha, or anime distractions.

## Status

**V1 build in progress.**

Rules, engine, scoring, the correctness gate and deterministic heuristic bots are complete. The mobile interaction prototype is built and waiting on a real-phone verdict; production presentation and the PWA start only once that decision is accepted.

## V1

Single-player Hong Kong Old Style Mahjong against three heuristic bots, shipped as an installable offline PWA and a Capacitor Android app from the same React + Vite codebase. Landscape table, traditional SVG tiles, tap-tap discard, contextual learning aids, clear faan scoring, local persistence, and no backend or runtime network dependency.

## Source of truth

- [Hong Kong Old Style rules contract](docs/HKOS_RULES.md) — authoritative for all rules and scoring
- [V1 Product Requirements Document](docs/PRD.md)
- [V1 Programme Map](docs/PROGRAMME.md) — includes the PWA delivery amendment
- [V1 engine architecture](docs/ENGINE_ARCHITECTURE.md)
- [V1 heuristic bot design and evaluation](docs/BOTS.md)
- [V1.6 mobile interaction prototype and device gate](docs/INTERACTION_PROTOTYPE.md)
- [Parent programme issue](../../issues/1)

Where code, a dependency, or the in-app rules reference disagrees with `docs/HKOS_RULES.md`, the document wins and the other side is a bug.
