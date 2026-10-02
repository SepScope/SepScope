import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { anchors, checkResults, checkRuns, type DbConnection } from "@sepscope/db";
import { createTestDb, resetTestDb } from "@sepscope/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/main.js";
import type { Timers } from "../src/scheduler.js";
import { anchorFetch, fakeLogger } from "./helpers/fixtures.js";

let shared: DbConnection;
beforeAll(async () => {
  shared = await createTestDb();
});
beforeEach(() => resetTestDb(shared));
afterAll(() => shared.close());

async function setup(registry: unknown = [{ domain: "a.example", network: "testnet", name: "A" }]) {
  const dir = await mkdtemp(join(tmpdir(), "sepscope-"));
  const anchorsFile = join(dir, "anchors.json");
  await writeFile(anchorsFile, JSON.stringify(registry));
  // main closes its connection on stop; keep the shared database open for the next test.
  const migrate = vi.fn(() => shared.migrate());
  const close = vi.fn(async () => {});
  const conn: DbConnection = { db: shared.db, migrate, close };
  const scheduled: { fn: () => void; ms: number }[] = [];
  const timers: Timers = {
    setTimeout: (fn, ms) => scheduled.push({ fn, ms }),
    clearTimeout: vi.fn(),
    now: () => 0,
  };
  const env = { DATABASE_URL: "postgres://test", ANCHORS_FILE: anchorsFile, CHECK_INTERVAL_MINUTES: "5" };
  return { conn, migrate, close, scheduled, timers, env };
}

/** Lets the first cycle (which starts synchronously) finish. */
async function settle(conn: DbConnection) {
  await vi.waitFor(async () => expect((await conn.db.select().from(checkRuns))[0]?.finishedAt).toBeInstanceOf(Date));
}

describe("main", () => {
  it("migrates, syncs the registry, runs a first cycle, and schedules the next", async () => {
    const { conn, migrate, close, scheduled, timers, env } = await setup();
    const logger = fakeLogger();
    const connect = vi.fn(() => conn);
    const worker = await main(env, { connect, logger, timers, fetch: anchorFetch(["a.example"]) });

    expect(connect).toHaveBeenCalledWith("postgres://test");
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(await conn.db.select().from(anchors)).toMatchObject([{ domain: "a.example" }]);
    await settle(conn);
    expect((await conn.db.select().from(checkResults)).length).toBeGreaterThan(0);
    await vi.waitFor(() => expect(scheduled.map((s) => s.ms)).toEqual([5 * 60_000]));

    await worker.stop();
    expect(close).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ anchors: 1, concurrency: 4 }), "worker started");
  });

  it("logs a cycle that fails as a whole and keeps the schedule", async () => {
    const { conn, scheduled, timers, env } = await setup();
    const logger = fakeLogger();
    // The cycle's own bookkeeping is the only thing that can reject it; anchor failures are caught per anchor.
    logger.info.mockImplementation((_, msg) => {
      if (msg === "cycle finished") throw new Error("log sink down");
    });
    const worker = await main(env, { connect: () => conn, logger, timers, fetch: anchorFetch([]) });
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledWith({ err: new Error("log sink down") }, "cycle failed"));
    await vi.waitFor(() => expect(scheduled).toHaveLength(1));
    await worker.stop();
  });

  it("closes the connection and rethrows when startup fails", async () => {
    const { conn, close, env } = await setup([{ domain: "not a domain", network: "testnet", name: "X" }]);
    await expect(main(env, { connect: () => conn, logger: fakeLogger() })).rejects.toThrow(/Invalid anchor registry/);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("rejects bad configuration before connecting", async () => {
    const connect = vi.fn();
    await expect(main({}, { connect })).rejects.toThrow(/DATABASE_URL/);
    expect(connect).not.toHaveBeenCalled();
  });

  it("uses pino when no logger is given", async () => {
    const { conn, timers, env } = await setup([]);
    const worker = await main({ ...env, LOG_LEVEL: "silent" }, { connect: () => conn, timers });
    await worker.stop();
  });
});
