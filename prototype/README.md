# Interaction prototype — Issue #7

A throwaway React + Vite prototype whose only job is to answer the Issue #7
device gate on a real Android phone. It is **not** the production app. #8 builds
that, as an installable offline PWA, and is free to keep none of this.

## What it is

- Six deterministic fake table states. No engine, no RNG, no bots, no network.
- The PRD §7 interaction model: tap to lift, tap the same tile again to discard,
  tap another tile to move the selection.
- Contextual Chow / Pung / Kong / Pass / Win controls in two placements.
- Measurement knobs for tile size, spacing, corner labels, control placement and
  discard model, plus a session report the tester can paste back into the issue.

## What it deliberately is not

- Not production visuals. Faces are schematic: Chinese numerals for characters,
  plain pips for dots and bamboo, single glyphs for honours. Real SVG artwork is
  #8's problem. The palette does come from the PRD token list, because contrast
  is what legibility is made of and testing it against the wrong colours would
  answer the wrong question.
- Not a PWA. No manifest, no service worker, no offline caching. That is #8.
- Not wired to `src/engine`. Depending on the engine would make a throwaway
  prototype into something #8 inherits.

## Running it for the device gate

See [`docs/INTERACTION_PROTOTYPE.md`](../docs/INTERACTION_PROTOTYPE.md) for the
phone test path and the checklist. In short:

```sh
cd prototype
npm ci
npm run phone     # serves on 0.0.0.0:5173, open http://<this-machine-ip>:5173 on the phone
```

## Checks

```sh
npm run check     # lint, typecheck, reducer tests, production build
```

The interaction model itself lives in `src/model/interaction.ts` as a pure
reducer with tests, so "tap again to discard" is verifiable without a device.
Everything the reducer cannot answer — whether a 13.5 mm tile is comfortable
under a real thumb — is exactly what the device gate is for.
