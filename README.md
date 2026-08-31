# mahjong

A clean, modern Hong Kong Old Style Mahjong game for mobile. Offline-first, rules-accurate, and focused on tactile play, strong AI, clear scoring, elegant learning, and zero casino clutter, gacha, or anime distractions.

## Status

**V1 build in progress.**

The programme is running in dependency order through issues #2–#11. The rules contract
is locked; engine, scoring and correctness work follow before any production UI.

## V1

Single-player Hong Kong Old Style Mahjong against three heuristic bots, fully offline on Android. Landscape table, traditional SVG tiles, tap-tap discard, contextual learning aids, clear faan scoring, local persistence, and no network features.

## Source of truth

- [Hong Kong Old Style rules contract](docs/HKOS_RULES.md) — authoritative for all rules and scoring
- [V1 Product Requirements Document](docs/PRD.md)
- [V1 Programme Map](docs/PROGRAMME.md)
- [Parent programme issue](../../issues/1)

Where code, a dependency, or the in-app rules reference disagrees with
`docs/HKOS_RULES.md`, the document wins and the other side is a bug.
