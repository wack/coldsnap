import { fileURLToPath } from "node:url";

import { workflow } from "@workflow/vitest";
import { defineConfig } from "vitest/config";

/**
 * Integration tests that run the real durable workflows in-process on the
 * Workflow SDK's Local World, against Coldsnap's in-memory doubles.
 */
export default defineConfig({
  plugins: [workflow()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.workflow.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
