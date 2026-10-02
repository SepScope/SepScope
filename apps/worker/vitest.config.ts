import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (path: string) => fileURLToPath(new URL(`../../packages/${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    // Test against workspace packages' sources, so no build is needed first.
    alias: [
      { find: /^@sepscope\/core$/, replacement: src("core/src/index.ts") },
      { find: /^@sepscope\/db$/, replacement: src("db/src/index.ts") },
      { find: /^@sepscope\/db\/testing$/, replacement: src("db/src/testing.ts") },
    ],
  },
  test: {
    include: ["test/**/*.test.ts"],
    // Each test file starts its own in-process Postgres (PGlite), which takes a few seconds.
    hookTimeout: 60_000,
    // Live tests hit the network; they are no-ops unless RUN_LIVE_TESTS=1.
    testTimeout: process.env.RUN_LIVE_TESTS === "1" ? 60_000 : 5_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "lcov"],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
