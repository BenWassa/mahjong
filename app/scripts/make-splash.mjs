/**
 * Renders the Android splash screens from the same SVG source the PWA icons
 * come from (scripts/make-icons.mjs), on the felt background colour
 * (manifest.webmanifest's background_color) rather than Capacitor's stock
 * white-and-blue template art — otherwise the splash flashes a different
 * world before the table appears, which DESIGN.md §19 already commits this
 * app not to do (#11).
 *
 * Overwrites each existing drawable splash.png in place (one per density
 * bucket), at the exact dimensions `cap add android` generated, so the
 * density buckets Android already expects stay correct.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const iconSvg = await readFile(resolve(here, "../public/icons/icon.svg"), "utf8");
const resDir = resolve(here, "../android/app/src/main/res");

const FELT = "#0a1a15";

const TARGETS = [
  { file: "drawable/splash.png", width: 480, height: 320 },
  { file: "drawable-land-mdpi/splash.png", width: 480, height: 320 },
  { file: "drawable-land-hdpi/splash.png", width: 800, height: 480 },
  { file: "drawable-land-xhdpi/splash.png", width: 1280, height: 720 },
  { file: "drawable-land-xxhdpi/splash.png", width: 1600, height: 960 },
  { file: "drawable-land-xxxhdpi/splash.png", width: 1920, height: 1280 },
  { file: "drawable-port-mdpi/splash.png", width: 320, height: 480 },
  { file: "drawable-port-hdpi/splash.png", width: 480, height: 800 },
  { file: "drawable-port-xhdpi/splash.png", width: 720, height: 1280 },
  { file: "drawable-port-xxhdpi/splash.png", width: 960, height: 1600 },
  { file: "drawable-port-xxxhdpi/splash.png", width: 1280, height: 1920 },
];

const browser = await chromium.launch();

for (const { file, width, height } of TARGETS) {
  const page = await browser.newPage({ viewport: { width, height } });
  // The mark sized to a quarter of the shorter side, centred — legible
  // without dominating either a wide landscape or a tall portrait splash.
  const mark = Math.round(Math.min(width, height) * 0.28);
  await page.setContent(
    `<!doctype html><html><body style="margin:0;width:${String(width)}px;height:${String(height)}px;
       background:${FELT};display:flex;align-items:center;justify-content:center">
       <div style="width:${String(mark)}px;height:${String(mark)}px">${iconSvg.replace(
         'viewBox="0 0 512 512"',
         `viewBox="0 0 512 512" width="100%" height="100%"`,
       )}</div>
     </body></html>`,
  );
  await page.waitForTimeout(80);
  const shot = await page.screenshot({ omitBackground: false });
  await writeFile(resolve(resDir, file), shot);
  await page.close();
  console.log(`wrote ${file} (${String(width)}x${String(height)})`);
}

await browser.close();
