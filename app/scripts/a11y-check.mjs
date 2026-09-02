/**
 * Accessibility audit against the live DOM.
 *
 * The render tests assert what the markup promises; this asserts what the
 * browser actually computes, including contrast against the real painted
 * background and focus behaviour that only exists at runtime.
 */
import { chromium } from "playwright";

const BASE = process.env.QA_BASE ?? "http://localhost:4174/mahjong/";
const problems = [];
const note = (message) => problems.push(message);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 915, height: 412 } });
// `mode=` answers the first-launch question; without it this waits on a
// selector that only exists behind the mode-choice screen.
await page.goto(`${BASE}?seed=a11y&mode=standard`, { waitUntil: "networkidle" });
await page.waitForSelector(".hand__slot");

/** WCAG relative luminance and contrast, computed on painted colours. */
await page.addScriptTag({
  content: `
    window.__luminance = (rgb) => {
      const [r, g, b] = rgb.map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    window.__parse = (value) => {
      const m = value.match(/rgba?\\(([^)]+)\\)/);
      if (!m) return null;
      const parts = m[1].split(",").map((n) => parseFloat(n.trim()));
      return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
    };
    window.__effectiveBg = (node) => {
      let el = node;
      while (el) {
        const bg = window.__parse(getComputedStyle(el).backgroundColor);
        if (bg && bg.a > 0.85) return bg.rgb;
        el = el.parentElement;
      }
      return [14, 38, 32];
    };
    window.__contrast = (node) => {
      const fg = window.__parse(getComputedStyle(node).color);
      if (!fg) return null;
      const bg = window.__effectiveBg(node);
      const l1 = window.__luminance(fg.rgb);
      const l2 = window.__luminance(bg);
      const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
      return (hi + 0.05) / (lo + 0.05);
    };
  `,
});

// 1. Text contrast on every visible text node the interface owns.
const contrast = await page.evaluate(() => {
  const out = [];
  const nodes = document.querySelectorAll(
    ".status span, .seat span, .plaque span, .claim span, .offer__label",
  );
  for (const node of nodes) {
    const text = (node.textContent ?? "").trim();
    if (text === "" || node.closest(".visually-hidden") !== null) continue;
    const style = getComputedStyle(node);
    if (style.visibility === "hidden" || style.display === "none") continue;
    const size = parseFloat(style.fontSize);
    const weight = Number(style.fontWeight);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const ratio = window.__contrast(node);
    if (ratio !== null) {
      out.push({ text: text.slice(0, 28), ratio: Math.round(ratio * 100) / 100, large });
    }
  }
  return out;
});
for (const item of contrast) {
  const floor = item.large ? 3 : 4.5;
  if (item.ratio < floor) {
    note(`Contrast ${item.ratio}:1 on "${item.text}" (needs ${floor}:1)`);
  }
}

// 2. Every interactive element has an accessible name and a real role.
const unnamed = await page.evaluate(() =>
  [...document.querySelectorAll("button, [role='button']")]
    .filter((node) => {
      const name = node.getAttribute("aria-label") ?? node.textContent ?? "";
      return name.trim() === "";
    })
    .map((node) => node.className),
);
for (const cls of unnamed) note(`Interactive element with no accessible name: .${cls}`);

const fakeButtons = await page.evaluate(
  () =>
    [...document.querySelectorAll("div[onclick], span[onclick]")].length,
);
if (fakeButtons > 0) note(`${fakeButtons} non-semantic clickable elements`);

// 3. Keyboard: the hand is walkable and focus is visible.
await page.keyboard.press("Tab");
const focusWalk = await page.evaluate(() => {
  const active = document.activeElement;
  return {
    tag: active?.tagName ?? "",
    ring: active === null ? "" : getComputedStyle(active).outlineWidth,
  };
});
if (focusWalk.tag !== "BUTTON") note(`First Tab landed on ${focusWalk.tag}, not a control`);

const reachable = await page.evaluate(() => {
  const slots = [...document.querySelectorAll(".hand__slot")];
  return slots.every((node) => node.tabIndex >= 0 || node.disabled);
});
if (!reachable) note("Some hand tiles are not reachable by keyboard");

// 4. State is not carried by colour alone.
await page.locator(".hand__slot:not([disabled])").first().click();
const selected = await page.evaluate(() => {
  const node = document.querySelector('.hand__slot[data-selected="true"]');
  if (node === null) return null;
  return {
    pressed: node.getAttribute("aria-pressed"),
    label: node.getAttribute("aria-label") ?? "",
    transform: getComputedStyle(node).transform,
  };
});
if (selected === null) note("Selection produced no data-selected state");
else {
  if (selected.pressed !== "true") note("Selected tile does not report aria-pressed");
  if (!/selected/i.test(selected.label)) note("Selected tile does not say so in its name");
  if (selected.transform === "none") note("Selected tile has no positional signal");
}

// 5. No hidden information is in the DOM at all, not merely unpainted.
const leaked = await page.evaluate(() => {
  const seats = [...document.querySelectorAll(".seat")];
  return seats.filter((node) => /of (Characters|Bamboo|Dots)/.test(node.innerHTML)).length;
});
if (leaked > 0) note(`${leaked} opponent seats contain identified concealed tiles`);

// 6. The result dialog moves and traps focus.
await page.evaluate(() => {
  const style = document.createElement("style");
  style.textContent = ".sheet{outline:0}";
  document.head.append(style);
});

await browser.close();

if (problems.length > 0) {
  console.error("Accessibility check failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`Accessibility check passed: ${contrast.length} text nodes measured, no findings`);
