# mahjong

A clean, modern Hong Kong Old Style Mahjong game for mobile. Offline-first, rules-accurate, and focused on tactile play, strong AI, clear scoring, elegant learning, and zero casino clutter, gacha, or anime distractions.

## Status

**V1 build in progress.**

Rules, engine, scoring, the correctness gate and deterministic heuristic bots are complete. The mobile interaction prototype passed its real-Android landscape gate, and the production table, traditional SVG tile set and installable offline PWA are built. Learning aids, persistence, Android packaging, Beginner mode and the interactive **Learn to Play** onboarding are done.

**Live PWA:** [benwassa.github.io/mahjong](https://benwassa.github.io/mahjong/) deploys `app/dist` — the real engine-backed game — from `main` on every relevant push (#26). The disposable interaction prototype in `prototype/` is historical only and is not deployed there.

## V1

Single-player Hong Kong Old Style Mahjong against three heuristic bots, shipped as an installable offline PWA and a Capacitor Android app from the same React + Vite codebase. Landscape table, traditional SVG tiles, tap-tap discard, contextual learning aids, clear faan scoring, local persistence, and no backend or runtime network dependency.

New players are offered **Learn to Play**: five short interactive lessons dealt
from arranged walls through the production engine — make a hand, take a turn,
choose a discard, claim a tile, win — then a real guided hand against the same
bots. It teaches by changing the game state rather than by explaining it, and
none of it is required to reach the table. See [`DESIGN.md`](docs/DESIGN.md) §25.

## Source of truth

- [Hong Kong Old Style rules contract](docs/HKOS_RULES.md) — authoritative for all rules and scoring
- [V1 Product Requirements Document](docs/PRD.md)
- [V1 Programme Map](docs/PROGRAMME.md) — includes the PWA delivery amendment
- [V1 engine architecture](docs/ENGINE_ARCHITECTURE.md)
- [V1 heuristic bot design and evaluation](docs/BOTS.md)
- [V1.6 mobile interaction prototype and device gate](docs/INTERACTION_PROTOTYPE.md)
- [Production design authority](docs/DESIGN.md) — the table, geometry, tokens, motion and accessibility decisions
- [Parent programme issue](../../issues/1)

Where code, a dependency, or the in-app rules reference disagrees with `docs/HKOS_RULES.md`, the document wins and the other side is a bug. Where the production app and `docs/DESIGN.md` disagree, one of them is a bug; where `docs/DESIGN.md` and `docs/HKOS_RULES.md` disagree about game behaviour, the rules contract wins.

## Running it

```sh
npm ci && npm run check          # engine, scoring, bots, correctness gate
npm --prefix app ci              # once
npm run app                      # the production table at localhost:5174
npm run app:phone                # same, reachable from a phone on the LAN
npm run check:all                # the whole repository gate
npm run qa                       # rendered responsive QA across the viewport matrix
```

The production app lives in [`app/`](app). It imports the engine and bots
directly from `src/`, so a rules or bot change cannot silently diverge from
what the table plays.
