import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Each test file starts its own in-process Postgres (PGlite), which takes a few seconds.
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "lcov"],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
