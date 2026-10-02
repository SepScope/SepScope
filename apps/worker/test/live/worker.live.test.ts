import { checkResults, checkRuns } from "@sepscope/db";
import { createTestDb } from "@sepscope/db/testing";
import { allChecks } from "@sepscope/core";
import { describe, expect, it } from "vitest";
import { syncAnchors } from "../../src/registry.js";
import { runCycle } from "../../src/run.js";
import { hostThrottle } from "../../src/throttle.js";

// Hits the real network. Run with RUN_LIVE_TESTS=1; skipped otherwise so CI stays fast.
describe.skipIf(process.env.RUN_LIVE_TESTS !== "1")("live: worker cycle against testanchor.stellar.org", () => {
  it("stores a full run and keeps to one request per second per host", async () => {
    const conn = await createTestDb();
    try {
      const anchors = await syncAnchors(conn.db, [
        { domain: "testanchor.stellar.org", network: "testnet", name: "Stellar Test Anchor" },
      ]);
      const sent: { host: string; at: number }[] = [];
      const fetch: typeof globalThis.fetch = (input, init) => {
        sent.push({ host: new URL(String(input)).host, at: performance.now() });
        return globalThis.fetch(input, init);
      };
      const logger = { info: () => {}, error: () => {} };
      await runCycle(conn.db, anchors, { concurrency: 4, logger, throttle: hostThrottle(1000), fetch });

      const [run] = await conn.db.select().from(checkRuns);
      expect(run?.finishedAt).toBeInstanceOf(Date);
      const results = await conn.db.select().from(checkResults);
      expect(results.map((r) => r.checkId).sort()).toEqual(allChecks.map((c) => c.id).sort());
      const notPassing = results.filter((r) => r.status !== "pass");
      expect(notPassing, JSON.stringify(notPassing, null, 2)).toEqual([]);

      expect(sent.length).toBeGreaterThan(1);
      // The throttle spaces releases exactly; allow 1ms for the hop from release to fetch().
      for (let i = 1; i < sent.length; i++) {
        if (sent[i]!.host === sent[i - 1]!.host) expect(sent[i]!.at - sent[i - 1]!.at).toBeGreaterThanOrEqual(999);
      }
    } finally {
      await conn.close();
    }
  });
});
