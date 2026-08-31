import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Issue #7 prototype. Bound to 0.0.0.0 so the author's Android phone can reach
// it over the local network; the device gate cannot be satisfied by emulation.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
