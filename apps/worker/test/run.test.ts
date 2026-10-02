import { runChecks, type Check, type RunOptions } from "@sepscope/core";
import { checkResults, checkRuns, type DbConnection } from "@sepscope/db";
import { createTestDb, resetTestDb } from "@sepscope/db/testing";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { syncAnchors, type Anchor } from "../src/registry.js";
import { runAnchor, runCycle } from "../src/run.js";
import { anchorFetch, fakeLogger, noThrottle } from "./helpers/fixtures.js";

let conn: DbConnection;
beforeAll(async () => {
  conn = await createTestDb();
});
beforeEach(() => resetTestDb(conn));
afterAll(() => conn.close());

const seed = (...domains: string[]) =>
  syncAnchors(conn.db, domains.map((domain) => ({ domain, network: "testnet" as const, name: domain })));

const resultsFor = (runId: number) =>
  conn.db.select().from(checkResults).where(eq(checkResults.runId, runId)).orderBy(asc(checkResults.checkId));

/** runChecks with a fixed list of checks instead of the real suite. */
const withChecks = (checks: Check[]) => (domain: string, options: RunOptions) => runChecks(domain, { ...options, checks });

describe("runAnchor", () => {
  it("records a run with one row per check and closes it", async () => {
    const [anchor] = await seed("a.example");
    const times = [new Date("2026-10-02T10:00:00Z"), new Date("2026-10-02T10:00:03Z")];
    const runId = await runAnchor(conn.db, anchor!, {
      logger: fakeLogger(),
      throttle: noThrottle,
      fetch: anchorFetch(["a.example"]),
      now: () => times.shift()!,
    });

    const [run] = await conn.db.select().from(checkRuns).where(eq(checkRuns.id, runId));
    expect(run).toMatchObject({
      anchorId: anchor!.id,
      startedAt: new Date("2026-10-02T10:00:00Z"),
      finishedAt: new Date("2026-10-02T10:00:03Z"),
    });

    const rows = await resultsFor(runId);
    const byId = Object.fromEntries(rows.map((r) => [r.checkId, r]));
    expect(byId["sep1.reachable"]).toMatchObject({ status: "pass", error: null });
    expect(byId["sep1.reachable"]!.latencyMs).toBeTypeOf("number");
    expect(byId["sep1.fields"]).toMatchObject({ status: "pass", detail: { endpoints: {} } });
    expect(byId["sep24.info"]).toMatchObject({ status: "skipped", error: "TRANSFER_SERVER_SEP0024 is not declared" });
  });

  it("isolates checks: one that throws is stored as fail and the rest still run", async () => {
    const [anchor] = await seed("a.example");
    const checks: Check[] = [
      { id: "boom", run: async () => { throw new Error("kaboom"); } },
      { id: "fine", run: async () => ({ checkId: "fine", status: "pass", latencyMs: 3 }) },
      { id: "after-boom", dependsOn: ["boom"], run: async () => ({ checkId: "after-boom", status: "pass" }) },
    ];
    const runId = await runAnchor(conn.db, anchor!, { logger: fakeLogger(), throttle: noThrottle, runChecks: withChecks(checks) });

    expect(await resultsFor(runId)).toMatchObject([
      { checkId: "after-boom", status: "skipped", detail: { blockedBy: ["boom"] } },
      { checkId: "boom", status: "fail", error: "kaboom", latencyMs: null },
      { checkId: "fine", status: "pass", latencyMs: 3 },
    ]);
  });

  it("closes the run and rethrows if the run itself fails", async () => {
    const [anchor] = await seed("a.example");
    const failing = async () => {
      throw new Error("runner exploded");
    };
    await expect(
      runAnchor(conn.db, anchor!, { logger: fakeLogger(), throttle: noThrottle, runChecks: failing }),
    ).rejects.toThrow("runner exploded");

    const runs = await conn.db.select().from(checkRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.finishedAt).toBeInstanceOf(Date);
    expect(await conn.db.select().from(checkResults)).toEqual([]);
  });

  it("closes a run that produced no results", async () => {
    const [anchor] = await seed("a.example");
    const runId = await runAnchor(conn.db, anchor!, { logger: fakeLogger(), throttle: noThrottle, runChecks: withChecks([]) });
    const [run] = await conn.db.select().from(checkRuns).where(eq(checkRuns.id, runId));
    expect(run!.finishedAt).toBeInstanceOf(Date);
  });

  it("passes the throttle through to every request", async () => {
    const [anchor] = await seed("a.example");
    const fetch = anchorFetch(["a.example"]);
    const throttled: string[] = [];
    await runAnchor(conn.db, anchor!, { logger: fakeLogger(), fetch, throttle: async (url) => void throttled.push(url) });
    expect(throttled).toEqual(fetch.calls);
  });
});

describe("runCycle", () => {
  it("checks every anchor with at most `concurrency` at once", async () => {
    const anchors = await seed(...Array.from({ length: 9 }, (_, i) => `a${i}.example`));
    let inFlight = 0;
    let peak = 0;
    const slow: Check = {
      id: "slow",
      run: async () => {
        peak = Math.max(peak, ++inFlight);
        await new Promise((r) => setTimeout(r, 10));
        inFlight--;
        return { checkId: "slow", status: "pass" };
      },
    };
    const logger = fakeLogger();
    await runCycle(conn.db, anchors, { concurrency: 4, logger, throttle: noThrottle, runChecks: withChecks([slow]) });

    expect(peak).toBe(4);
    expect(await conn.db.select().from(checkRuns)).toHaveLength(9);
    expect(await conn.db.select().from(checkResults)).toHaveLength(9);
    expect(logger.info).toHaveBeenLastCalledWith(expect.objectContaining({ anchors: 9, failedAnchors: 0 }), "cycle finished");
  });

  it("keeps going when one anchor's run fails", async () => {
    const anchors = await seed("good.example", "bad.example", "also-good.example");
    const logger = fakeLogger();
    const runChecksFor = async (domain: string, options: RunOptions) => {
      if (domain === "bad.example") throw new Error("bad anchor");
      return withChecks([{ id: "ok", run: async () => ({ checkId: "ok", status: "pass" }) }])(domain, options);
    };
    await runCycle(conn.db, anchors, { concurrency: 4, logger, throttle: noThrottle, runChecks: runChecksFor });

    expect(await conn.db.select().from(checkResults)).toHaveLength(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ domain: "bad.example", err: expect.any(Error) }),
      "anchor run failed",
    );
    expect(logger.info).toHaveBeenLastCalledWith(expect.objectContaining({ anchors: 3, failedAnchors: 1 }), "cycle finished");
  });

  it("does nothing for an empty anchor list", async () => {
    const empty: Anchor[] = [];
    await runCycle(conn.db, empty, { concurrency: 4, logger: fakeLogger(), throttle: noThrottle });
    expect(await conn.db.select().from(checkRuns)).toEqual([]);
  });
});
