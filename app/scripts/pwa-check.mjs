/**
 * Verifies the two PWA claims that matter: the app is installable, and once
 * installed it plays with the network gone.
 *
 * The offline half is the point. This product has no backend, so "works
 * offline" is not a degraded mode to fall back to, it is the normal one, and
 * an untested service worker is an assertion rather than a feature.
 */
import { chromium } from "playwright";

const BASE = process.env.QA_BASE ?? "http://localhost:4174/mahjong/";
const problems = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 915, height: 412 } });
const page = await context.newPage();

// 1. The manifest declares what an installable landscape game needs.
await page.goto(BASE, { waitUntil: "networkidle" });
const manifestHref = await page.getAttribute('link[rel="manifest"]', "href");
if (manifestHref === null) problems.push("No manifest link in the document head");

const manifest = await page.evaluate(async (href) => {
  const response = await fetch(href);
  return response.json();
}, manifestHref ?? "./manifest.webmanifest");

for (const [key, expected] of [
  ["display", "standalone"],
  ["orientation", "landscape"],
]) {
  if (manifest[key] !== expected) {
    problems.push(`manifest.${key} is ${JSON.stringify(manifest[key])}, expected ${expected}`);
  }
}
if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
  problems.push("manifest declares no icons");
}
if (!manifest.icons?.some((icon) => icon.purpose?.includes("maskable"))) {
  problems.push("manifest declares no maskable icon");
}
for (const icon of manifest.icons ?? []) {
  const url = new URL(icon.src, new URL(BASE)).href;
  const response = await page.request.get(url);
  if (!response.ok()) problems.push(`icon ${icon.src} returned ${response.status()}`);
}

// 2. The service worker installs and takes control.
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
  timeout: 15000,
}).catch(() => { problems.push("Service worker never took control of the page"); });

const cached = await page.evaluate(async () => {
  const keys = await caches.keys();
  if (keys.length === 0) return 0;
  const cache = await caches.open(keys[0]);
  return (await cache.keys()).length;
});
if (cached < 5) problems.push(`Precache holds only ${cached} entries`);

// 3. With the network gone, a cold navigation still deals a playable hand.
// `mode=standard` answers the one-time first-launch question. Without it a
// fresh browser context correctly lands on ModeChoice, so waiting for `.app`
// would test the old entry flow rather than the offline PWA contract.
await context.setOffline(true);
await page.goto(`${BASE}?seed=offline-check&mode=standard`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".app", { timeout: 15000 }).catch(() => {
  problems.push("The table did not render with the network offline");
});

const offline = await page.evaluate(() => ({
  tiles: document.querySelectorAll(".hand__slot").length,
  faces: document.querySelectorAll(".hand__slot svg text, .hand__slot svg circle, .hand__slot svg rect")
    .length,
  turn: document.querySelector(".status__turn")?.textContent ?? "",
}));
if (offline.tiles !== 13 && offline.tiles !== 14) {
  problems.push(`Offline deal produced ${offline.tiles} hand tiles`);
}
if (offline.faces < 20) problems.push("Tile engraving did not render offline");
if (offline.turn.trim() === "") problems.push("Turn state was empty offline");

// 4. Play a discard offline, to prove the engine and bots are in the bundle.
await page.locator(".hand__slot:not([disabled])").first().click();
await page.locator(".hand__slot:not([disabled])").first().click();
await page.waitForTimeout(1200);
const afterDiscard = await page.evaluate(() => ({
  discards: document.querySelectorAll(".well__cell").length,
  errors: document.querySelectorAll("#root").length,
}));
if (afterDiscard.discards < 1) {
  problems.push("Discarding offline did not reach the discard pile");
}

await browser.close();

if (problems.length > 0) {
  console.error("PWA check failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`PWA check passed: installable, ${cached} precached entries, plays offline`);
