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
    const doc = document.documentElement;
    const slots = [...document.querySelectorAll(".hand__slot")];
    const rects = slots.map((node) => node.getBoundingClientRect());
    const controls = [
      ...document.querySelectorAll(".claim, .sheet__go, .portrait__toggle, .coach__go, .learn__lesson"),
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
      // Effective hit area, which is padded past the drawn tile on purpose.
      smallestTarget: slots.length
        ? Math.min(
            ...slots.map((node) => {
              const after = getComputedStyle(node, "::after");
              return Math.min(
                Math.max(node.getBoundingClientRect().width, Number.parseFloat(after.minWidth) || 0),
                Math.max(node.getBoundingClientRect().height, Number.parseFloat(after.minHeight) || 0),
              );
            }),
          )
        : null,
      smallestControl: controls.length
        ? Math.min(...controls.map((node) => node.getBoundingClientRect().height))
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
