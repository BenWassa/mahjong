/**
 * Rendered responsive QA.
 *
 * Drives the real production UI in a browser across the Android landscape
 * viewport matrix, walking each seeded game until it has seen every gameplay
 * state worth looking at, and asserting the geometry rules that the layout is
 * supposed to guarantee. Code-level tests cannot answer "does this overlap".
 *
 *   node scripts/visual-qa.mjs            # full matrix
 *   node scripts/visual-qa.mjs --quick    # one viewport
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../qa-out");
const BASE = process.env.QA_BASE ?? "http://localhost:4174/mahjong/";

/**
 * The matrix. Android landscape classes, not one Pixel resolution: a narrow
 * budget phone, the common modern phone, a tall-aspect phone, and the same
 * common phone with the gesture-navigation and cutout insets that landscape
 * actually imposes.
 */
const VIEWPORTS = [
  { id: "narrow-640", width: 640, height: 360, insets: null },
  { id: "typical-915", width: 915, height: 412, insets: null },
  { id: "tall-1024", width: 1024, height: 420, insets: null },
  { id: "wide-21x9", width: 1080, height: 460, insets: null },
  {
    id: "inset-915",
    width: 915,
    height: 412,
    insets: { top: 0, right: 48, bottom: 24, left: 48 },
  },
  { id: "small-568", width: 568, height: 320, insets: null },
  // The short/narrow class the responsive priority policy was written for: it
  // is where opponent metadata collapses but the drawn melds survive, and the
  // one the physical phone kept landing in.
  { id: "short-600x340", width: 600, height: 340, insets: null },
];

const SEEDS = ["qa-1", "qa-2", "qa-3", "qa-4", "qa-5", "qa-6", "qa-7", "qa-8"];

/**
 * The mode a walk plays under, appended to the URL.
 *
 * `?mode=` also answers the one-time first-launch question, which is what
 * lets a fresh browser context reach the table at all — without it every walk
 * below would sit on the mode-choice screen until `.app` timed out.
 */
let activeMode = "standard";

const findings = [];
const captured = new Set();

function finding(impact, category, summary, where) {
  findings.push({ impact, category, summary, where });
}

/** Safe-area insets cannot be set from script, so they are simulated in CSS. */
async function applyInsets(page, insets) {
  if (insets === null) return;
  await page.addStyleTag({
    content: `:root{
      --safe-top:${insets.top}px;--safe-right:${insets.right}px;
      --safe-bottom:${insets.bottom}px;--safe-left:${insets.left}px;}`,
  });
}

async function describeState(page) {
  return page.evaluate(() => {
    const claims = [...document.querySelectorAll(".claim")].map((node) =>
      (node.getAttribute("aria-label") ?? "").split(" ")[0].toLowerCase(),
    );
    const overlay = document.querySelector(".sheet") !== null;
    const slots = [...document.querySelectorAll(".hand__slot")];
    return {
      claims,
      overlay,
      handCount: slots.length,
      enabled: slots.filter((node) => !node.hasAttribute("disabled")).length,
      selected: slots.filter((node) => node.dataset.selected === "true").length,
      discards: document.querySelectorAll(".well__cell").length,
      ownMelds: document.querySelectorAll(".hand__melds .meld").length,
      offered: document.querySelector(".offer") !== null,
    };
  });
}

/** Geometry rules the layout promises. Checked on every capture. */
async function assertGeometry(page, label, viewport) {
  const report = await page.evaluate(() => {
    window.__hitArea = (node) => {
      const box = node.getBoundingClientRect();
      const after = getComputedStyle(node, "::after");
      return Math.min(
        Math.max(box.width, Number.parseFloat(after.minWidth) || 0),
        Math.max(box.height, Number.parseFloat(after.minHeight) || 0),
      );
    };
    const doc = document.documentElement;
    const slots = [...document.querySelectorAll(".hand__slot")];
    const rects = slots.map((node) => node.getBoundingClientRect());
    const controls = [
      ...document.querySelectorAll(
        ".claim, .sheet__go, .portrait__toggle, .coach__go, .coach__peek," +
          " .peek__close, .learn__lesson, .status__menu, .coach__menu," +
          " .coach__quit, .coach__rescue, .menu__toggle, .menu__close," +
          " .choice__option",
      ),
    ];
    const style = getComputedStyle(document.querySelector(".app") ?? doc);
    return {
      overflowX: doc.scrollWidth - doc.clientWidth,
      overflowY: doc.scrollHeight - doc.clientHeight,
      // Read off the rendered slots themselves rather than off the `.app`
      // custom property: Learn to Play's portrait stylesheet re-declares
      // --tile-w on `.handrow` on purpose, to wrap the hand onto two readable
      // rows without disturbing every other measurement the geometry engine
      // derives from the single-row value still sitting on `.app` (§ tutorial
      // CSS, "portrait"). The drawn tile is truth; the custom property on the
      // ancestor the layout happens to compute it from is not always where it
      // ends up applied.
      tileW: rects.length
        ? Math.min(...rects.map((r) => r.width))
        : Number.parseFloat(style.getPropertyValue("--tile-w")) || 0,
      handLeft: rects.length ? Math.min(...rects.map((r) => r.left)) : null,
      handRight: rects.length ? Math.max(...rects.map((r) => r.right)) : null,
      handBottom: rects.length ? Math.max(...rects.map((r) => r.bottom)) : null,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      // The responsive priority policy's active state, straight off the DOM.
      // A screenshot alone cannot say which tier produced it.
      tier: document.querySelector(".app")?.dataset.tier ?? null,
      // Peek's tiles, when it is open. The whole point of moving the open
      // hands off the table was that they became readable, so this is asserted
      // rather than eyeballed.
      peekTileW: (() => {
        const tiles = [...document.querySelectorAll(".openseat__hand .tile")];
        return tiles.length
          ? Math.min(...tiles.map((node) => node.getBoundingClientRect().width))
          : null;
      })(),
      // Nothing outside Learn to Play may ever draw an opponent's concealed
      // tiles, and inside it only the Peek overlay may.
      openHandsOutsidePeek:
        document.querySelectorAll(".openseat__hand").length > 0 &&
        document.querySelector(".peek__panel") === null,
      // Effective hit area, which is padded past the drawn control on purpose.
      //
      // Applied to the controls as well as to the tiles since #33. The status
      // strip is 26px because chrome height is the cheapest thing the table
      // owns and the hand is the most expensive, so the Menu button inside it
      // makes the same bargain `.hand__slot` already makes for a tile narrower
      // than the touch floor: the drawn control stays inside the band and the
      // hit area is padded past it. Measuring the drawn box alone would report
      // a 26px target that the thumb never actually meets.
      smallestTarget: slots.length ? Math.min(...slots.map((node) => window.__hitArea(node))) : null,
      smallestControl: controls.length
        ? Math.min(...controls.map((node) => window.__hitArea(node)))
        : null,
      // Anything clipping its own content. The page-level overflow checks miss
      // this entirely: a container that shears its bottom row of tiles in half
      // does not make the document scroll.
      clipped: (() => {
        const out = [];
        for (const node of document.querySelectorAll(
          ".well__grid, .hand, .handrow, .seat, .claimband, .sheet__items",
        )) {
          const style = getComputedStyle(node);
          if (style.overflow === "visible") continue;
          const overflowY = node.scrollHeight - node.clientHeight;
          const overflowX = node.scrollWidth - node.clientWidth;
          // The result sheet is allowed to scroll; nothing on the table is.
          const scrollable = node.closest(".sheet") !== null;
          if (!scrollable && (overflowY > 1 || overflowX > 1)) {
            out.push(`${node.className}:${String(overflowX)}x${String(overflowY)}`);
          }
        }
        return out;
      })(),
      // Does any claim control cover a tile the decision depends on?
      claimOverTile: (() => {
        const claimRects = [...document.querySelectorAll(".claim")].map((n) =>
          n.getBoundingClientRect(),
        );
        const tileRects = [
          ...document.querySelectorAll(".hand__slot, .offer .tile"),
        ].map((n) => n.getBoundingClientRect());
        return claimRects.some((c) =>
          tileRects.some(
            (t) => c.left < t.right && c.right > t.left && c.top < t.bottom && c.bottom > t.top,
          ),
        );
      })(),
    };
  });

  const where = `${viewport.id} / ${label}`;
  if (report.overflowX > 0) {
    finding("high", "overflow", `Horizontal page overflow of ${report.overflowX}px`, where);
  }
  if (report.overflowY > 0) {
    finding("high", "overflow", `Vertical page overflow of ${report.overflowY}px`, where);
  }
  if (report.handRight !== null && report.handRight > report.viewportW + 0.5) {
    finding("high", "geometry", "Hand extends past the right edge of the viewport", where);
  }
  if (report.handLeft !== null && report.handLeft < -0.5) {
    finding("high", "geometry", "Hand extends past the left edge of the viewport", where);
  }
  if (report.handBottom !== null && report.handBottom > report.viewportH + 0.5) {
    finding("high", "geometry", "Hand falls below the bottom of the viewport", where);
  }
  if (report.tileW > 0 && report.tileW < 34) {
    finding("high", "legibility", `Tile width ${report.tileW}px is below the readable floor`, where);
  }
  if (report.smallestTarget !== null && report.smallestTarget < 43.5) {
    finding("high", "touch", `Hand hit target ${Math.round(report.smallestTarget)}px is under 44px`, where);
  }
  if (report.smallestControl !== null && report.smallestControl < 43.5) {
    finding("high", "touch", `Control height ${Math.round(report.smallestControl)}px is under 44px`, where);
  }
  if (report.claimOverTile) {
    finding("high", "occlusion", "A claim control overlaps a tile the decision depends on", where);
  }
  if (report.peekTileW !== null && report.peekTileW < 34) {
    finding(
      "high",
      "legibility",
      `Peek tile width ${Math.round(report.peekTileW)}px is below the readable floor`,
      where,
    );
  }
  if (report.openHandsOutsidePeek) {
    finding(
      "high",
      "hidden-information",
      "An opponent's concealed hand is drawn outside the Peek overlay",
      where,
    );
  }
  for (const clip of report.clipped) {
    finding("high", "clipping", `Container clips its own content: ${clip}`, where);
  }
  return report;
}

async function capture(page, viewport, label, force = false) {
  const key = `${viewport.id}:${label}`;
  if (!force && captured.has(key)) return;
  captured.add(key);
  await page.screenshot({ path: resolve(out, `${viewport.id}--${label}.png`) });
  await assertGeometry(page, label, viewport);
}

/** Walks one seeded game, capturing each state the first time it appears. */
async function walk(page, viewport, seed, steps) {
  await page.goto(`${BASE}?seed=${seed}&mode=${activeMode}`, { waitUntil: "domcontentloaded" });
  await applyInsets(page, viewport.insets);
  await page.waitForSelector(".app", { timeout: 10000 });
  await page.waitForTimeout(250);

  for (let step = 0; step < steps; step += 1) {
    const state = await describeState(page);

    if (state.overlay) {
      await capture(page, viewport, "result-overlay");
      await page.click(".sheet__go");
      await page.waitForTimeout(300);
      continue;
    }

    if (state.claims.length > 0) {
      const name = state.claims.filter((c) => c !== "pass").sort().join("-") || "pass-only";
      await capture(page, viewport, `claim-${name}`);
      const chows = state.claims.filter((c) => c === "chow").length;
      if (chows > 1) await capture(page, viewport, "claim-chow-multi");
      if (state.ownMelds > 0) await capture(page, viewport, "melds-exposed");

      // Take a meld sometimes so the exposed-meld and shrunken-hand geometry
      // gets visited; otherwise pass and keep the hand moving.
      const takeIt = state.claims.some((c) => c !== "pass" && c !== "win") && step % 3 === 0;
      const selector = takeIt ? ".claim:not(.claim--pass):not(.claim--win)" : ".claim--pass";
      const target = page.locator(selector).first();
      if ((await target.count()) === 0) {
        await page.locator(".claim").first().click();
      } else {
        await target.click();
      }
      await page.waitForTimeout(260);
      continue;
    }

    if (state.enabled > 0) {
      if (state.discards > 8) await capture(page, viewport, "midhand-turn");
      if (state.discards > 24) await capture(page, viewport, "latehand-dense");
      if (state.ownMelds > 0) await capture(page, viewport, "hand-with-melds");
      await capture(page, viewport, "turn-rest");

      const tile = page.locator(".hand__slot:not([disabled])").nth(
        Math.min(2, state.enabled - 1),
      );
      await tile.click();
      await page.waitForTimeout(140);
      await capture(page, viewport, "tile-selected");
      await tile.click();
      await page.waitForTimeout(320);
      continue;
    }

    // Nobody owes the player anything; let the opponents move.
    if (state.offered) await capture(page, viewport, "opponent-offer");
    await capture(page, viewport, "opponent-turn");
    await page.waitForTimeout(320);
  }
}

/**
 * Plays one hand all the way to its result. A hand runs to roughly two hundred
 * moves, and the opponents are paced for a human rather than for a harness, so
 * this is deliberately run once rather than per seed: the result sheet is the
 * same surface whichever hand produced it.
 */
async function walkToResult(page, viewport, seed) {
  await page.goto(`${BASE}?seed=${seed}&mode=${activeMode}`, { waitUntil: "domcontentloaded" });
  await applyInsets(page, viewport.insets);
  await page.waitForSelector(".app", { timeout: 10000 });

  for (let step = 0; step < 900; step += 1) {
    const state = await describeState(page);
    if (state.overlay) {
      await capture(page, viewport, "result-overlay", true);
      // The scrolled state of a long faan breakdown is its own composition.
      const scrollable = await page.evaluate(() => {
        const sheet = document.querySelector(".sheet");
        return sheet !== null && sheet.scrollHeight > sheet.clientHeight;
      });
      if (scrollable) await capture(page, viewport, "result-overlay-scrolls", true);
      return true;
    }
    if (state.claims.length > 0) {
      // Take everything on offer: melds and wins end a hand sooner and are the
      // states worth reaching.
      const win = page.locator(".claim--win");
      const target = (await win.count()) > 0 ? win.first() : page.locator(".claim").first();
      await target.click();
      await page.waitForTimeout(120);
      continue;
    }
    if (state.enabled > 0) {
      const tile = page.locator(".hand__slot:not([disabled])").first();
      await tile.click();
      await tile.click();
      await page.waitForTimeout(150);
      continue;
    }
    await page.waitForTimeout(150);
  }
  finding("medium", "coverage", "No hand reached a result within the step budget", viewport.id);
  return false;
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const quick = process.argv.includes("--quick");
const matrix = quick ? VIEWPORTS.filter((v) => v.id === "typical-915") : VIEWPORTS;
const browser = await chromium.launch();

for (const viewport of matrix) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    reducedMotion: "no-preference",
  });
  page.on("pageerror", (error) => {
    finding("high", "runtime", `Uncaught error: ${error.message}`, viewport.id);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      finding("high", "runtime", `Console error: ${message.text().slice(0, 160)}`, viewport.id);
    }
  });

  for (const seed of quick ? SEEDS.slice(0, 3) : SEEDS) {
    await walk(page, viewport, seed, quick ? 26 : 34);
  }

  // The portrait surface and the reduced-motion pass, on one viewport each.
  if (viewport.id === "typical-915") {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto(`${BASE}?seed=qa-1&mode=${activeMode}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    await capture(page, viewport, "portrait-menu");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
  }

  if (viewport.id === "typical-915") {
    await walkToResult(page, viewport, "qa-result");
  }

  await page.close();
}

/*
 * Beginner mode, at the same thresholds.
 *
 * A mode that only removes things cannot introduce an overflow or an
 * undersized target, so this is a guard rather than a new baseline: it runs
 * the identical geometry assertions, and any finding it raises is a real
 * regression in the mode's stylesheet.
 */
{
  activeMode = "beginner";
  for (const viewport of matrix.filter((v) => v.id === "typical-915" || v.id === "small-568")) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
      reducedMotion: "no-preference",
    });
    page.on("pageerror", (error) => {
      finding("high", "runtime", `Uncaught error: ${error.message}`, `${viewport.id}:beginner`);
    });
    for (const seed of SEEDS.slice(0, quick ? 2 : 4)) {
      await walk(page, { ...viewport, id: `${viewport.id}-beginner` }, seed, quick ? 20 : 30);
    }
    await page.close();
  }
  activeMode = "standard";
}

/*
 * The first-launch screen, in both orientations.
 *
 * It renders ahead of the orientation split, so it has to work in whichever
 * one the phone is in on a first launch. The 44px target assertion is the one
 * that matters here.
 */
{
  const page = await browser.newPage({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 2 });
  for (const [id, width, height] of [
    ["choice-landscape", 915, 412],
    ["choice-portrait", 412, 915],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${BASE}?seed=qa-1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".choice", { timeout: 10000 });
    await page.waitForTimeout(250);
    await capture(page, { id, width, height, insets: null }, "mode-choice");
  }
  await page.close();
}

// Reduced motion gets its own context, because it is a browser-level setting.
{
  const page = await browser.newPage({
    viewport: { width: 915, height: 412 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  await walk(page, { id: "reduced-motion", width: 915, height: 412, insets: null }, "qa-1", 14);
  await page.close();
}

/**
 * Learn to Play (#30), at the same thresholds.
 *
 * The tutorial is a second surface built from the same table components, so
 * the geometry rules it has to satisfy are exactly the production ones —
 * nothing about the coach strip or the open opponent seats gets a pass. It
 * gets its own walk rather than a mode flag on `walk()` because its state
 * machine is different: there is no result overlay to wait out, and progress
 * is driven by the coach's own "Next" control as much as by discarding.
 */
async function describeLessonState(page) {
  return page.evaluate(() => {
    const slots = [...document.querySelectorAll(".hand__slot")];
    return {
      go: document.querySelector(".coach__go") !== null,
      enabled: slots.filter((node) => !node.hasAttribute("disabled")).length,
      claims: document.querySelectorAll(".claim").length,
      nonPassClaims: document.querySelectorAll(".claim:not(.claim--pass)").length,
    };
  });
}

/**
 * Peek: open it, look at it, and get back out of it three different ways.
 *
 * This is the surface that replaced the permanently open opponent hands, so
 * the assertions it needs are the ones the old rails could never pass — tiles
 * above the readable floor — plus the ones an overlay over a live table owes:
 * the lesson holds still behind it, and every exit works.
 */
async function walkPeek(page, viewport, lessonId) {
  const control = page.locator(".coach__peek");
  if ((await control.count()) === 0) return;

  await control.first().click();
  await page.waitForSelector(".peek__panel", { timeout: 5000 });
  await page.waitForTimeout(200);
  await capture(page, viewport, `learn-${lessonId}-peek`, true);

  const held = await page.evaluate(() => ({
    panels: document.querySelectorAll(".openseat__hand").length,
    tiles: document.querySelectorAll(".openseat__hand .tile").length,
    discards: document.querySelectorAll(".well__cell").length,
  }));
  if (held.panels === 0 || held.tiles === 0) {
    finding("high", "peek", "Peek opened with no hands in it", `${viewport.id} / ${lessonId}`);
  }

  // The lesson's pacing is stopped while this is up: an opponent moving behind
  // the overlay would change the hands the player came here to read, and would
  // do it out of sight.
  await page.waitForTimeout(1600);
  const after = await page.evaluate(() => document.querySelectorAll(".well__cell").length);
  if (after !== held.discards) {
    finding(
      "high",
      "peek",
      `The table moved behind Peek: ${held.discards} discards became ${after}`,
      `${viewport.id} / ${lessonId}`,
    );
  }

  // Escape, the backdrop and the close control are all the same door.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  if ((await page.locator(".peek__panel").count()) !== 0) {
    finding("high", "peek", "Escape did not close Peek", `${viewport.id} / ${lessonId}`);
  }

  await control.first().click();
  await page.waitForSelector(".peek__panel", { timeout: 5000 });
  await page.goBack();
  await page.waitForTimeout(250);
  if ((await page.locator(".peek__panel").count()) !== 0) {
    finding("high", "peek", "The back button did not close Peek", `${viewport.id} / ${lessonId}`);
  }
  if ((await page.locator(".coach").count()) === 0) {
    finding("high", "peek", "The back button left the lesson entirely", `${viewport.id} / ${lessonId}`);
  }

  await control.first().click();
  await page.waitForSelector(".peek__panel", { timeout: 5000 });
  await page.click(".peek__close");
  await page.waitForTimeout(250);
  if ((await page.locator(".peek__panel").count()) !== 0) {
    finding("high", "peek", "Close did not close Peek", `${viewport.id} / ${lessonId}`);
  }

  // And the lesson is running again afterwards, not frozen behind a closed
  // overlay.
  const resumed = await page.evaluate(() => document.querySelector(".coach") !== null);
  if (!resumed) {
    finding("high", "peek", "The lesson did not survive Peek", `${viewport.id} / ${lessonId}`);
  }
}

/**
 * Walks one lesson far enough to see more than its opening screen: a few
 * coach turns, a discard or two, and a claim decision where the lesson offers
 * one. Capped well under the length of a real hand — a lesson is a handful of
 * scripted steps, not a full game, so twelve is already generous headroom.
 */
async function walkLesson(page, viewport, lessonId, steps) {
  await page.goto(`${BASE}?learn=${lessonId}&seed=qa-learn`, { waitUntil: "domcontentloaded" });
  await applyInsets(page, viewport.insets);
  await page.waitForSelector(".app.tutorial", { timeout: 10000 });
  await page.waitForSelector(".coach", { timeout: 10000 });
  await page.waitForTimeout(250);
  await capture(page, viewport, `learn-${lessonId}-start`);
  await walkPeek(page, viewport, lessonId);

  for (let step = 0; step < steps; step += 1) {
    const state = await describeLessonState(page);

    if (state.go) {
      await capture(page, viewport, `learn-${lessonId}-coach`);
      await page.click(".coach__go");
      await page.waitForTimeout(350);
      continue;
    }

    if (state.enabled > 0) {
      await capture(page, viewport, `learn-${lessonId}-turn`);
      const tile = page.locator(".hand__slot:not([disabled])").first();
      await tile.click();
      await page.waitForTimeout(140);
      await tile.click();
      await page.waitForTimeout(350);
      continue;
    }

    if (state.claims > 0) {
      await capture(page, viewport, `learn-${lessonId}-claim`);
      const selector = state.nonPassClaims > 0 ? ".claim:not(.claim--pass)" : ".claim--pass";
      await page.locator(selector).first().click();
      await page.waitForTimeout(350);
      continue;
    }

    // Nothing is waiting on the player: the coach is pacing itself against the
    // opponents' own moves. Those are paced at 620ms in the tutorial, slower
    // than the table's walk, so give this a slightly longer wait than 350ms
    // before checking again.
    await page.waitForTimeout(700);
  }

  await capture(page, viewport, `learn-${lessonId}-end`);
}

{
  const lessonViewports = VIEWPORTS.filter((v) => v.id === "typical-915" || v.id === "small-568");
  const stepsPerLesson = quick ? 8 : 12;

  for (const viewport of lessonViewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
      reducedMotion: "no-preference",
    });
    page.on("pageerror", (error) => {
      finding("high", "runtime", `Uncaught error: ${error.message}`, `${viewport.id}:learn`);
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        finding("high", "runtime", `Console error: ${message.text().slice(0, 160)}`, `${viewport.id}:learn`);
      }
    });

    await page.goto(`${BASE}?learn=1&seed=qa-learn`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".learn", { timeout: 10000 });
    await page.waitForTimeout(250);
    await capture(page, viewport, "learn-menu");

    for (const lessonId of ["shape", "turn", "improve", "claims", "win"]) {
      await walkLesson(page, viewport, lessonId, stepsPerLesson);
    }

    await page.close();
  }

  // One portrait pass, on the same viewport class the production portrait
  // capture above uses, so the coach strip is checked in the orientation the
  // menu itself lives in as well as the table's own landscape one.
  {
    const page = await browser.newPage({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2,
      reducedMotion: "no-preference",
    });
    page.on("pageerror", (error) => {
      finding("high", "runtime", `Uncaught error: ${error.message}`, "learn-portrait");
    });
    await walkLesson(
      page,
      { id: "learn-portrait-412x915", width: 412, height: 915, insets: null },
      "claims",
      stepsPerLesson,
    );
    await page.close();
  }
}

/*
 * The first-run walkthrough (#33), across the same viewport matrix.
 *
 * The attention layer is the thing this pass exists for. `placement.ts` proves
 * the degradation ladder against synthetic rectangles; only a browser can say
 * whether the callout it chose actually sits clear of the hand a player is
 * deciding with, on a phone whose table has already collapsed two bands to fit.
 *
 * So at every step of the walkthrough it asserts the §5.5 constraints against
 * the rendered boxes: a callout never covers its own target, the player's
 * hand, a live claim band, or the offered tile, and never leaves the viewport.
 * It also asserts what must always be true of a first-run surface — that a
 * spotlight is actually drawn when a step names a target, and that no
 * opponent's concealed tiles are anywhere on the screen.
 */
async function walkOnboarding(page, viewport, path, steps) {
  const url = `${BASE}?experience=${path}&seed=qa-onboard`;
  /*
   * A fresh install, explicitly.
   *
   * `?experience=` only stands in for a tap nobody has made yet: a stored
   * answer wins, and #33 makes that load-bearing — a link must never be able
   * to drop somebody who has played fifty hands into a scripted walkthrough.
   * So the second walk on a reused page would find the first walk's stored
   * answer and go straight to a table. Clearing local state first is the
   * honest analogue of a first launch, and it is the same reset a human
   * tester performs between the three paths.
   */
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
    } catch {
      // Storage may be unavailable; the walk below will say so by timing out.
    }
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".onboarding", { timeout: 10000 });
  const where = `${viewport.id} / onboarding-${path}`;

  for (let step = 0; step < steps; step += 1) {
    await page.waitForTimeout(320);
    if ((await page.$(".onboarding")) === null) break;

    const probe = await page.evaluate(() => {
      const box = (selector) => {
        const node = document.querySelector(selector);
        return node === null ? null : node.getBoundingClientRect();
      };
      const hit = (a, b) =>
        a !== null && b !== null && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const callout = document.querySelector(".attention__callout");
      const drawn = callout !== null && callout.style.visibility !== "hidden";
      const cb = drawn ? callout.getBoundingClientRect() : null;
      const claimsLive = document.querySelectorAll(".claim").length > 0;
      return {
        hasAttention: document.querySelector(".attention") !== null,
        // One mask rect is the full-screen backdrop; the rest are the holes.
        holes: Math.max(0, document.querySelectorAll("#attention-mask rect").length - 1),
        rung: drawn ? (callout.dataset.rung ?? null) : null,
        overHand: drawn && hit(cb, box(".hand")),
        overClaims: drawn && claimsLive && hit(cb, box(".claimband")),
        overOffer: drawn && hit(cb, box(".offer")),
        offscreen:
          drawn &&
          (cb.left < -0.5 || cb.top < -0.5 || cb.right > window.innerWidth + 0.5 || cb.bottom > window.innerHeight + 0.5),
        // Peek must not exist anywhere on this path: no first-run phase
        // reveals a seat, so there is no control and no overlay (§8.1).
        peekControl: document.querySelector(".coach__peek") !== null,
        openHands: document.querySelectorAll(".openseat__hand").length,
        // The same leak guard the production table gets. A seat rail naming a
        // suited tile is a concealed hand on screen.
        namedSeatTiles: [...document.querySelectorAll(".seat")].filter((node) =>
          /of (Characters|Bamboo|Dots)/.test(node.innerHTML),
        ).length,
        menu: document.querySelector('[data-teach="menu"]') !== null,
      };
    });

    if (probe.overHand) {
      finding("high", "occlusion", "A teaching callout covers the player's hand", where);
    }
    if (probe.overClaims) {
      finding("high", "occlusion", "A teaching callout covers a live claim control", where);
    }
    if (probe.overOffer) {
      finding("high", "occlusion", "A teaching callout covers the offered tile", where);
    }
    if (probe.offscreen) {
      finding("high", "geometry", "A teaching callout falls outside the viewport", where);
    }
    if (probe.hasAttention && probe.holes === 0) {
      // §5.6's floor: the callout may degrade all the way to the coach strip,
      // but the spotlight never does. A step with no hole cut is a step whose
      // sentence has no visible referent, which is the defect the whole
      // attention system exists to prevent.
      finding("high", "teaching", "A teaching step spotlights nothing", where);
    }
    if (probe.peekControl || probe.openHands > 0) {
      finding("high", "hidden-information", "Peek is reachable during the first run", where);
    }
    if (probe.namedSeatTiles > 0) {
      finding("high", "hidden-information", `${probe.namedSeatTiles} seats name concealed tiles`, where);
    }
    if (!probe.menu) {
      finding("high", "navigation", "The walkthrough offers no visible Menu", where);
    }

    if (step < 4) await capture(page, viewport, `onboard-${path}-${String(step)}`);
    await assertGeometry(page, `onboarding-${path}`, viewport);

    // Advance the way a player would, preferring whatever the step is asking
    // for. The independent turn deliberately accepts several tiles and refuses
    // the ones that damage the hand, so a blind first-enabled-slot walk would
    // be correctly refused for ever — it picks a named spare instead.
    const prompt = (await page.$eval(".coach__prompt", (n) => n.textContent).catch(() => "")) ?? "";
    const claim = await page.$(".claim");
    if (claim !== null) {
      const wanted = prompt.includes("West Wind")
        ? await page.$('.claim[data-teach-claim="pass"]')
        : ((await page.$('.claim[data-teach-claim="claim-pung"]')) ??
           (await page.$('.claim[data-teach-claim="win"]')));
      await (wanted ?? claim).click();
      continue;
    }
    const named =
      (await page.$('.hand__slot:not([disabled])[aria-label^="Nine of Characters"]')) ??
      (await page.$('.hand__slot:not([disabled])[aria-label^="One of Characters"]'));
    const tile = named ?? (await page.$(".hand__slot:not([disabled])"));
    if (tile !== null) {
      await tile.click();
      await tile.click();
      continue;
    }
    const go = await page.$(".coach__go");
    if (go !== null) await go.click();
  }
}

{
  const onboardViewports = VIEWPORTS.filter(
    (v) => v.id === "typical-915" || v.id === "short-600x340" || v.id === "inset-915",
  );
  const steps = quick ? 8 : 34;

  for (const viewport of onboardViewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
    });
    if (viewport.insets) await applyInsets(page, viewport.insets);
    page.on("pageerror", (error) => {
      finding("high", "runtime", `Uncaught error: ${error.message}`, `${viewport.id}:onboarding`);
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        finding("high", "runtime", `Console error: ${message.text().slice(0, 160)}`, `${viewport.id}:onboarding`);
      }
    });
    await walkOnboarding(page, viewport, "new", steps);
    await walkOnboarding(page, viewport, "rusty", quick ? 6 : 12);
    await page.close();
  }
}

/*
 * Navigation and orientation (#33, ONBOARDING_DESIGN.md §4).
 *
 * The single most important assertion in this file, because it is the defect
 * the issue opened on: a player holding a live landscape table had no visible
 * route to the rest of the product, and the route that existed — rotating the
 * hardware — silently swapped the whole information architecture.
 *
 * So this asserts the replacement end to end: the table carries a Menu, the
 * Menu reaches the secondary surfaces without rotating, portrait *holds* the
 * table rather than navigating away from it, and rotating back returns the
 * same position rather than a fresh deal.
 */
{
  const viewport = { id: "navigation", width: 915, height: 412, insets: null };
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
  });
  page.on("pageerror", (error) => {
    finding("high", "runtime", `Uncaught error: ${error.message}`, viewport.id);
  });

  await page.goto(`${BASE}?seed=qa-nav&mode=standard`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app", { timeout: 10000 });

  if ((await page.$(".status__menu")) === null) {
    finding("high", "navigation", "The landscape table has no visible Menu control", viewport.id);
  }

  // The hand the table is holding, so "state survived" can be asserted rather
  // than assumed. A fresh deal would produce a different one.
  const handBefore = await page.$$eval(".hand__slot", (ns) =>
    ns.map((n) => n.getAttribute("aria-label")).join("|"),
  );

  await page.click(".status__menu");
  await page.waitForSelector(".menu__panel", { timeout: 5000 });
  await capture(page, viewport, "menu-landscape");
  await assertGeometry(page, "menu", viewport);

  // Every secondary surface, reached without ever turning the phone.
  // Selected by accessible name rather than by class: the stats surface reuses
  // the rules surface's stylesheet, so `.rules` matches both and would let a
  // regression that routed Stats to the rules text pass unnoticed.
  for (const [control, selector, name] of [
    [".menu__toggle[aria-describedby='menu-rules']", '[aria-label="Rules reference"]', "rules"],
    [".menu__toggle[aria-describedby='menu-stats']", '[aria-label="Stats"]', "stats"],
    [".menu__toggle[aria-describedby='menu-learn']", ".learn", "learn"],
  ]) {
    if ((await page.$(".menu__panel")) === null) {
      await page.click(".status__menu");
      await page.waitForSelector(".menu__panel", { timeout: 5000 });
    }
    await page.click(control);
    const reached = await page.waitForSelector(selector, { timeout: 5000 }).catch(() => null);
    if (reached === null) {
      finding("high", "navigation", `Menu does not reach ${name} from landscape`, viewport.id);
      continue;
    }
    await capture(page, viewport, `menu-${name}-landscape`);
    // And the same surface in portrait: §4.2 lets a secondary surface reflow,
    // it just forbids portrait from being the way in.
    await page.setViewportSize({ width: 412, height: 915 });
    await page.waitForTimeout(200);
    if ((await page.$(selector)) === null) {
      finding("high", "navigation", `Rotating navigated away from ${name}`, viewport.id);
    }
    await capture(page, { id: "navigation-portrait", width: 412, height: 915, insets: null }, `menu-${name}-portrait`);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(200);
    const back = await page.$(".rules__close, .learn__skip");
    if (back !== null) await back.click();
    await page.waitForTimeout(200);
  }

  // Back closes the sheet rather than leaving the product (§4.3).
  await page.waitForSelector(".app", { timeout: 5000 });
  await page.click(".status__menu");
  await page.waitForSelector(".menu__panel", { timeout: 5000 });
  await page.goBack();
  await page.waitForTimeout(250);
  if ((await page.$(".menu__panel")) !== null) {
    finding("high", "navigation", "Back did not close the menu sheet", viewport.id);
  }
  if ((await page.$(".app")) === null) {
    finding("high", "navigation", "Back left the table instead of closing the sheet", viewport.id);
  }

  // Portrait holds the table; it does not navigate.
  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForTimeout(250);
  if ((await page.$(".portrait")) === null) {
    finding("high", "navigation", "Portrait does not show the rotate-back holding state", viewport.id);
  }
  if ((await page.$(".learn, .rules")) !== null) {
    finding("high", "navigation", "Rotating to portrait navigated to another surface", viewport.id);
  }
  await capture(page, { id: "navigation-portrait", width: 412, height: 915, insets: null }, "table-held");

  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.waitForTimeout(250);
  const handAfter = await page.$$eval(".hand__slot", (ns) =>
    ns.map((n) => n.getAttribute("aria-label")).join("|"),
  );
  if (handAfter !== handBefore) {
    finding("high", "navigation", "Rotating away and back did not preserve the hand", viewport.id);
  }

  await page.close();
}

/*
 * The confident path: "Start playing" reaches a full table with no ceremony.
 *
 * §11 is short and absolute — no tutorial overlay to dismiss, full claims, a
 * visible Menu — so this is short and absolute too.
 */
{
  const viewport = { id: "start-playing", width: 915, height: 412, insets: null };
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
  });
  page.on("pageerror", (error) => {
    finding("high", "runtime", `Uncaught error: ${error.message}`, viewport.id);
  });
  await page.goto(`${BASE}?seed=qa-1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".choice", { timeout: 10000 });
  const labels = await page.$$eval(".choice__label", (ns) => ns.map((n) => n.textContent ?? ""));
  if (labels.some((text) => /faan|beginner|standard/i.test(text))) {
    // §3.1: the first screen must not ask a novice to choose a rules profile.
    finding("high", "onboarding", "The first-launch question names rules-profile jargon", viewport.id);
  }
  await page.click(".choice__option:last-of-type");
  await page.waitForSelector(".app", { timeout: 10000 });
  if ((await page.$(".onboarding")) !== null) {
    finding("high", "onboarding", "Start playing opened a walkthrough", viewport.id);
  }
  if ((await page.$(".status__menu")) === null) {
    finding("high", "navigation", "Start playing reached a table with no Menu", viewport.id);
  }
  await capture(page, viewport, "start-playing");
  await assertGeometry(page, "start-playing", viewport);
  await page.close();
}

/*
 * The layout diagnostics HUD (`?layoutdebug=1`).
 *
 * Two assertions, and they are opposites: with the parameter it is there and
 * carries the numbers a phone needs; without it there is no trace of it
 * anywhere in the interface. A diagnostic that leaks into normal play is a
 * defect, and a diagnostic that cannot be switched on from a phone is useless.
 */
{
  const viewport = { id: "layoutdebug", width: 568, height: 320, insets: null };
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
  });
  page.on("pageerror", (error) => {
    finding("high", "runtime", `Uncaught error: ${error.message}`, viewport.id);
  });

  await page.goto(`${BASE}?seed=qa-1&mode=standard&layoutdebug=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(".app", { timeout: 10000 });
  await page.waitForSelector(".layoutdebug", { timeout: 5000 });
  await page.waitForTimeout(700);
  await capture(page, viewport, "hud", true);

  const hud = await page.evaluate(() => {
    const node = document.querySelector(".layoutdebug");
    const text = node?.textContent ?? "";
    const rect = node?.getBoundingClientRect() ?? { width: 0, height: 0 };
    return {
      text,
      width: rect.width,
      height: rect.height,
      collapses: document.querySelectorAll(".layoutdebug__bar button").length,
    };
  });
  for (const wanted of ["viewport", "safe area", "state", "hand tile", "regions", "breaches"]) {
    if (!hud.text.includes(wanted)) {
      finding("high", "diagnostics", `The layout HUD is missing its ${wanted} row`, viewport.id);
    }
  }
  // It reports the drawn tile as well as the computed one; a HUD that only
  // echoes the engine back cannot tell a stylesheet bug from a geometry bug.
  if (!hud.text.includes("drawn")) {
    finding("high", "diagnostics", "The layout HUD does not report the drawn tile", viewport.id);
  }
  if (hud.collapses < 2) {
    finding("medium", "diagnostics", "The layout HUD cannot be moved or hidden", viewport.id);
  }
  if (hud.width > viewport.width || hud.height > viewport.height) {
    finding("high", "diagnostics", "The layout HUD does not fit the viewport it reports on", viewport.id);
  }

  // Collapsed, it is one line and still says the three things worth glancing at.
  await page.click(".layoutdebug__bar button:last-child");
  await page.waitForTimeout(150);
  await capture(page, viewport, "hud-collapsed", true);

  await page.goto(`${BASE}?seed=qa-1&mode=standard`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app", { timeout: 10000 });
  await page.waitForTimeout(400);
  if ((await page.locator(".layoutdebug").count()) !== 0) {
    finding("high", "diagnostics", "The layout HUD is present without its parameter", viewport.id);
  }

  await page.close();
}

await browser.close();

const byImpact = { high: 0, medium: 0, polish: 0 };
const unique = new Map();
for (const item of findings) {
  const key = `${item.impact}|${item.category}|${item.summary}`;
  if (!unique.has(key)) unique.set(key, { ...item, seen: 0 });
  unique.get(key).seen += 1;
  byImpact[item.impact] = (byImpact[item.impact] ?? 0) + 1;
}

const report = {
  date: new Date().toISOString(),
  viewports: matrix.map((v) => v.id),
  screenshots: [...captured].length,
  totals: byImpact,
  findings: [...unique.values()].sort((a, b) => b.seen - a.seen),
};
await writeFile(resolve(out, "qa-report.json"), `${JSON.stringify(report, null, 2)}\n`);

console.log(`captured ${String(captured.size)} screenshots across ${String(matrix.length)} viewports`);
console.log(`findings: ${JSON.stringify(byImpact)}`);
for (const item of report.findings) {
  console.log(`  [${item.impact}|${item.category}] ${item.summary}  (x${String(item.seen)}) ${item.where}`);
}
process.exit(report.findings.some((f) => f.impact === "high") ? 1 : 0);
