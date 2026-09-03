# mahjong

A clean, modern Hong Kong Old Style Mahjong game for mobile. Offline-first, rules-accurate, and focused on tactile play, strong AI, clear scoring, elegant learning, and zero casino clutter, gacha, or anime distractions.

## Status

**V1 build in progress.**

Rules, engine, scoring, the correctness gate and deterministic heuristic bots are complete. The mobile interaction prototype passed its real-Android landscape gate, and the production table, traditional SVG tile set and installable offline PWA are built. Learning aids, persistence, Android packaging and Beginner mode are done, and #33 rebuilt the first-time experience: an experience-based launch question, a linear walkthrough with spatial teaching, and a conventional Menu in place of rotate-to-navigate. That flow is built and green, and is **not** claimed to be novice-validated until the human comprehension gate in [`ONBOARDING_HUMAN_TEST.md`](docs/ONBOARDING_HUMAN_TEST.md) has been run on real people.

**Live PWA:** [benwassa.github.io/mahjong](https://benwassa.github.io/mahjong/) deploys `app/dist` — the real engine-backed game — from `main` on every relevant push (#26). The disposable interaction prototype in `prototype/` is historical only and is not deployed there.

## V1

Single-player Hong Kong Old Style Mahjong against three heuristic bots, shipped as an installable offline PWA and a Capacitor Android app from the same React + Vite codebase. Landscape table, traditional SVG tiles, tap-tap discard, contextual learning aids, clear faan scoring, local persistence, and no backend or runtime network dependency.

The first launch asks one question — have you played mahjong? — and routes on
the answer rather than on a rules profile a newcomer cannot evaluate. Somebody
new plays their first hand a step at a time: read your hand, see what a draw is
for, throw a tile, watch the table come round, take an unaided turn, take a
claim, leave a claim, finish a hand. Each instruction is spotlit on the object
it is about rather than printed above a dense table, every move goes through
the production engine, and the last scripted action deals straight into an
unscripted hand. Somebody rusty gets a minute on this table's conventions
instead; somebody confident gets a full table and no ceremony. Five replayable
lessons remain in the Menu. None of it is required to reach the table.
See [`ONBOARDING_DESIGN.md`](docs/ONBOARDING_DESIGN.md) and
[`DESIGN.md`](docs/DESIGN.md) §26.

## Source of truth

- [Hong Kong Old Style rules contract](docs/HKOS_RULES.md) — authoritative for all rules and scoring
- [V1 Product Requirements Document](docs/PRD.md)
- [V1 Programme Map](docs/PROGRAMME.md) — includes the PWA delivery amendment
- [V1 engine architecture](docs/ENGINE_ARCHITECTURE.md)
- [V1 heuristic bot design and evaluation](docs/BOTS.md)
- [V1.6 mobile interaction prototype and device gate](docs/INTERACTION_PROTOTYPE.md)
- [Production design authority](docs/DESIGN.md) — the table, geometry, tokens, motion and accessibility decisions
- [First-time player experience](docs/ONBOARDING_DESIGN.md) — authoritative for first run, orientation and navigation, with its research in [`ONBOARDING_RESEARCH.md`](docs/ONBOARDING_RESEARCH.md)
- [Onboarding human test](docs/ONBOARDING_HUMAN_TEST.md) — what the automated gate proves, what it cannot, and the protocol for the comprehension sessions
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

`?experience=new`, `?experience=rusty` and `?experience=confident` open each
first-run path directly, alongside `?mode=`, `?seed=` and `?learn=`. They stand
in for a tap nobody has made yet and are never written to storage, so a stored
answer always wins — clear site data first to see a path as a new player would.
[`ONBOARDING_HUMAN_TEST.md`](docs/ONBOARDING_HUMAN_TEST.md) §3 has the reset
instructions for a phone, a browser and the installed Android app.

Append `?layoutdebug=1` to a table or lesson URL — on the dev server or on the
deployed PWA — for the layout diagnostics HUD: what the phone reports, what the
geometry engine decided, and what the browser actually drew. See
[`docs/DESIGN.md`](docs/DESIGN.md) §4b.

The production app lives in [`app/`](app). It imports the engine and bots
directly from `src/`, so a rules or bot change cannot silently diverge from
what the table plays.
