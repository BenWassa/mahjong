import { defineConfig } from "vitest/config";

/**
 * The root package owns the engine, the scoring, the bots and the correctness
 * gate. The production app in app/ is a separate package with its own
 * toolchain, its own module aliases and its own suite; without this the root
 * run would sweep app/src and fail to resolve imports it knows nothing about.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
