import { describe, expect, it } from "vitest";
import { allChecks, runChecks } from "../../src/runner.js";

// Hits the real network. Run with RUN_LIVE_TESTS=1; skipped otherwise so CI stays fast.
describe.skipIf(process.env.RUN_LIVE_TESTS !== "1")("live: testanchor.stellar.org", () => {
  it("runs the full check suite", async () => {
    const report = await runChecks("testanchor.stellar.org");
    // The test anchor declares every endpoint, so nothing should be skipped either.
    const failures = report.results.filter((r) => r.status !== "pass");

    expect(report.results.map((r) => r.checkId)).toEqual(allChecks.map((c) => c.id));
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
    expect(report.toml?.NETWORK_PASSPHRASE).toBe("Test SDF Network ; September 2015");
  });
});
