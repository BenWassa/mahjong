/**
 * Static verification of the Capacitor Android packaging (#11) — everything
 * about it that can be checked without a JDK, an Android SDK, or network
 * access to Google's Maven repository, none of which every environment this
 * repo's automation runs in can assume.
 *
 * Actually compiling the native project (`npm run cap:android:debug`) is a
 * stronger check where the environment has that access; this script is the
 * fast, dependency-free floor everything else builds on, and it is what
 * catches "the sync silently drifted from the build" between those runs.
 *
 *   node scripts/capacitor-check.mjs
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const problems = [];
const note = (message) => problems.push(message);

async function readIfExists(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

// 1. The Capacitor-targeted build exists and resolves its own assets
// relative to itself, not to the GitHub Pages "/mahjong/" subpath the PWA
// build uses — that base is meaningless inside the native webview.
const distIndex = await readIfExists(resolve(appRoot, "dist-capacitor/index.html"));
if (distIndex === null) {
  note("dist-capacitor/index.html is missing — run `npm run build:capacitor` first");
} else if (/["'(]\/mahjong\//.test(distIndex)) {
  note("dist-capacitor/index.html references an absolute /mahjong/ asset path");
}

// 2. `cap sync` actually copied that build into the native project.
const syncedIndex = await readIfExists(
  resolve(appRoot, "android/app/src/main/assets/public/index.html"),
);
if (syncedIndex === null) {
  note("android/app/src/main/assets/public/index.html is missing — run `npm run cap:sync`");
} else if (distIndex !== null && syncedIndex !== distIndex) {
  note("the synced Android assets do not match the current dist-capacitor build — run `npm run cap:sync`");
}

const syncedConfig = await readIfExists(
  resolve(appRoot, "android/app/src/main/assets/capacitor.config.json"),
);
if (syncedConfig === null) {
  note("android/app/src/main/assets/capacitor.config.json is missing — run `npm run cap:sync`");
}

// 3. The manifest declares what the product requires: the app's own
// identity (not Capacitor's template default), and no more than the one
// permission a local WebView needs to load its own bundled assets — this
// app makes no network calls of its own (docs/PROGRAMME.md's offline
// amendment).
const manifest = await readIfExists(
  resolve(appRoot, "android/app/src/main/AndroidManifest.xml"),
);
if (manifest === null) {
  note("android/app/src/main/AndroidManifest.xml is missing — run `npx cap add android`");
} else {
  if (!manifest.includes('android:name=".MainActivity"')) {
    note("AndroidManifest.xml has no MainActivity declared");
  }
  const permissions = [...manifest.matchAll(/<uses-permission android:name="([^"]+)"/g)].map(
    (match) => match[1],
  );
  const unexpected = permissions.filter((permission) => permission !== "android.permission.INTERNET");
  if (unexpected.length > 0) {
    note(`AndroidManifest.xml requests unexpected permissions: ${unexpected.join(", ")}`);
  }
}

const buildGradle = await readIfExists(resolve(appRoot, "android/app/build.gradle"));
if (buildGradle === null) {
  note("android/app/build.gradle is missing — run `npx cap add android`");
} else if (!buildGradle.includes('applicationId "com.benwassa.mahjong"')) {
  note("android/app/build.gradle applicationId does not match capacitor.config.ts's appId");
}

// 4. The template's stock resource references were fixed to point at real
// resources — Capacitor's default Android template ships a styles.xml that
// references colors it never defines.
const colors = await readIfExists(resolve(appRoot, "android/app/src/main/res/values/colors.xml"));
if (colors === null) {
  note("android/app/src/main/res/values/colors.xml is missing (styles.xml references it)");
}

if (problems.length > 0) {
  console.error(`capacitor-check found ${String(problems.length)} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log("capacitor-check passed: Capacitor Android packaging is internally consistent");
}
