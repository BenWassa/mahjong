/**
 * Renders the PWA icon PNGs from the single SVG source.
 *
 * Kept as a script rather than a build step: the icons change roughly never,
 * and a build that needs a browser to produce a favicon is a build that breaks
 * on the first machine without one.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const icons = resolve(here, "../public/icons");

const svg = await readFile(resolve(icons, "icon.svg"), "utf8");

const targets = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
];

const browser = await chromium.launch();
await mkdir(icons, { recursive: true });

for (const { file, size, maskable } of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  // A maskable icon must survive being cropped to a circle, so the artwork is
  // inset to the safe zone and the field is extended behind it.
  const inset = maskable ? size * 0.1 : 0;
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#0e2620">
       <div style="position:absolute;inset:${inset}px">${svg.replace(
         'viewBox="0 0 512 512"',
         `viewBox="0 0 512 512" width="100%" height="100%"`,
       )}</div>
     </body></html>`,
  );
  await page.waitForTimeout(120);
  const shot = await page.screenshot({ omitBackground: false });
  await writeFile(resolve(icons, file), shot);
  await page.close();
  console.log(`wrote ${file} (${String(size)}px)`);
}

await browser.close();
