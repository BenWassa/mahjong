# Production app

The Hong Kong Old Style mahjong table, as an installable offline PWA. This is
the app #21 built; [`docs/DESIGN.md`](../docs/DESIGN.md) is the authority for
every visual and interaction decision in it, and
[`docs/HKOS_RULES.md`](../docs/HKOS_RULES.md) is the authority for everything
the game actually does.

## What it is

React + Vite, no backend, no runtime network dependency. The engine and the
bots are imported straight out of `../src` through the `@engine` alias rather
than through a build artefact, so a rules or bot change cannot silently diverge
from what the table plays. Nothing here reaches past the redacted public
projection: the UI can only render what the engine hands the viewing seat.

## Running it

```sh
npm ci
npm run dev            # localhost:5174
npm run phone          # same, bound to 0.0.0.0 for a phone on the LAN
```

Turn the phone sideways. Portrait is the menu surface, not a squeezed table:
fourteen tiles in a 412px width is 25px per tile, well below what can be read.

### Diagnosing layout on a real phone

Append `?layoutdebug=1` to any table or lesson URL — the LAN dev server, or the
deployed PWA — for the layout HUD: the viewport and safe-area insets the app was
actually given, the tile sizes and responsive tier the geometry engine decided
from them, the rectangles the browser actually drew, and any breached minimum.
It ships in the production bundle on purpose, because the phone runs the
deployed build; nothing in the interface links to it, and it is never persisted.
See [`docs/DESIGN.md`](../docs/DESIGN.md) §4b.

## Checks

```sh
npm run check          # lint, typecheck, tests, production build
```

Rendered QA needs a server to drive, so it is separate:

```sh
npm run build && npm run preview &
npm run qa             # the viewport matrix, every gameplay state, geometry assertions
npm run qa:pwa         # installability, and that a hand plays with the network off
npm run qa:a11y        # contrast on painted colours, semantics, focus, state signals
npm run qa:all         # all three
```

`npm run qa` walks the real UI across seven Android landscape classes, captures
every gameplay state it reaches, and fails on horizontal overflow, a hand that
leaves the viewport, a tile below the readable floor, a hit target under 44px,
a claim control covering a tile the decision depends on, an opponent's concealed
hand drawn anywhere but the Peek overlay, or a layout HUD that is present
without its parameter. Screenshots and a findings report land in `qa-out/`.

## The tile specimen sheet

```sh
npm run dev            # then open /specimen.html
```

All 42 faces at the three sizes they are actually read at, plus the tile
states. It is a dev-only entry: Vite's build input is `index.html`, so it never
reaches the production bundle. It is how the set gets audited, and the audit it
produced is recorded in `docs/DESIGN.md` §10.

## Icons

```sh
npm run icons          # re-renders the PNGs from public/icons/icon.svg
```

Kept out of the build: the icons change roughly never, and a build that needs a
browser to produce a favicon breaks on the first machine without one.
