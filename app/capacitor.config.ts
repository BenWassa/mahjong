import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Packages the same production build the PWA ships (#11) — one React + Vite
 * app, two delivery surfaces. `webDir` points at the Capacitor-specific build
 * (`npm run build:capacitor`), which is built with a relative base so its
 * asset URLs resolve inside the native webview rather than at the GitHub
 * Pages "/mahjong/" subpath the PWA build uses.
 */
const config: CapacitorConfig = {
  appId: "com.benwassa.mahjong",
  appName: "Mahjong",
  webDir: "dist-capacitor",
  // Orientation is deliberately left to the OS (MainActivity's
  // screenOrientation is "unspecified"), not hard-locked to landscape: the
  // table is landscape-only, but the settings/learning/stats menu is the
  // portrait surface (DESIGN.md §1), reached by physically rotating the
  // phone. Locking the Activity to landscape would make that menu
  // unreachable on Android — see docs/DESIGN.md §19/§22.
  // Fully offline: no runtime network dependency is added by packaging for
  // Android, matching the PWA (docs/PROGRAMME.md).
  server: {
    androidScheme: "https",
  },
};

export default config;
