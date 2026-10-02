import { eq, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { anchors, checkResults, checkRuns, createDb, withAdvisoryLock, type DbConnection, type LockablePool } from "../src/index.js";
import { createTestDb, resetTestDb } from "../src/testing.js";

let conn: DbConnection;
beforeAll(async () => {
  conn = await createTestDb();
});
beforeEach(() => resetTestDb(conn));
afterAll(() => conn.close());

async function seedRun() {
  const [anchor] = await conn.db
    .insert(anchors)
    .values({ domain: "anchor.example", network: "testnet", name: "Anchor" })
    .returning();
  const [run] = await conn.db
    .insert(checkRuns)
    .values({ anchorId: anchor!.id, startedAt: new Date() })
    .returning();
  return { anchor: anchor!, run: run! };
}

describe("schema", () => {
  it("stores a run with its results, including jsonb detail", async () => {
    const { run } = await seedRun();
    await conn.db.insert(checkResults).values([
      { runId: run.id, checkId: "sep24.info", status: "pass", latencyMs: 311, detail: { deposit: ["USDC"] } },
      { runId: run.id, checkId: "sep6.info", status: "skipped", error: "TRANSFER_SERVER is not declared" },
    ]);
    const rows = await conn.db.select().from(checkResults).where(eq(checkResults.runId, run.id));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.checkId === "sep24.info")?.detail).toEqual({ deposit: ["USDC"] });
    expect(run.finishedAt).toBeNull();
  });

  it("rejects an unknown status", async () => {
    const { run } = await seedRun();
    await expect(
      conn.db.insert(checkResults).values({ runId: run.id, checkId: "x", status: "bogus" as "pass" }),
    ).rejects.toThrow();
  });

  it("rejects a duplicate check within one run", async () => {
    const { run } = await seedRun();
    const row = { runId: run.id, checkId: "sep1.cors", status: "pass" as const };
    await conn.db.insert(checkResults).values(row);
    await expect(conn.db.insert(checkResults).values(row)).rejects.toThrow();
  });

  it("rejects duplicate domains and unknown networks", async () => {
    await seedRun();
    await expect(
      conn.db.insert(anchors).values({ domain: "anchor.example", network: "testnet", name: "Dup" }),
    ).rejects.toThrow();
    await expect(
      conn.db.insert(anchors).values({ domain: "other.example", network: "futurenet", name: "X" }),
    ).rejects.toThrow();
  });

  it("deletes runs and results with their anchor", async () => {
    const { anchor, run } = await seedRun();
    await conn.db.insert(checkResults).values({ runId: run.id, checkId: "sep1.cors", status: "pass" });
    await conn.db.delete(anchors).where(eq(anchors.id, anchor.id));
    expect(await conn.db.select().from(checkRuns)).toEqual([]);
    expect(await conn.db.select().from(checkResults)).toEqual([]);
  });

  it("resetTestDb empties every table and restarts ids", async () => {
    const { anchor } = await seedRun();
    await resetTestDb(conn);
    expect(await conn.db.select().from(checkRuns)).toEqual([]);
    expect((await seedRun()).anchor.id).toBe(anchor.id);
  });

  it("re-running migrations is a no-op", async () => {
    await expect(conn.migrate()).resolves.toBeUndefined();
  });
});

describe("foreign keys", () => {
  it.each([
    [checkRuns, "anchors"],
    [checkResults, "check_runs"],
  ] as const)("%# points at %s and cascades deletes", (table, target) => {
    const [fk] = getTableConfig(table).foreignKeys;
    const ref = fk!.reference();
    expect(getTableName(ref.foreignTable)).toBe(target);
    expect(ref.foreignColumns.map((c) => c.name)).toEqual(["id"]);
    expect(fk!.onDelete).toBe("cascade");
  });
});

describe("createDb", () => {
  it("does not connect until the first query", async () => {
    const pg = createDb("postgres://user:pass@127.0.0.1:1/none");
    expect(pg.db).toBeDefined();
    await pg.close();
  });

  it("surfaces connection errors from migrate", async () => {
    const pg = createDb("postgres://user:pass@127.0.0.1:1/none");
    await expect(pg.migrate()).rejects.toThrow();
    await pg.close();
  });
});

describe("withAdvisoryLock", () => {
  function fakePool() {
    const log: string[] = [];
    const client = {
      query: vi.fn(async (text: string, values: unknown[]) => void log.push(`${text} ${values.join(",")}`)),
      release: vi.fn(() => void log.push("release")),
    };
    const pool: LockablePool = { connect: async () => client };
    return { pool, log, client };
  }

  it("locks, runs, unlocks and releases, in that order", async () => {
    const { pool, log } = fakePool();
    const result = await withAdvisoryLock(pool, 42, async () => {
      log.push("fn");
      return "done";
    });
    expect(result).toBe("done");
    expect(log).toEqual(["select pg_advisory_lock($1) 42", "fn", "select pg_advisory_unlock($1) 42", "release"]);
  });

  it("unlocks and releases when fn throws", async () => {
    const { pool, log } = fakePool();
    await expect(withAdvisoryLock(pool, 42, async () => Promise.reject(new Error("migration failed")))).rejects.toThrow(
      "migration failed",
    );
    expect(log).toEqual(["select pg_advisory_lock($1) 42", "select pg_advisory_unlock($1) 42", "release"]);
  });

  it("releases the connection and skips fn when the lock cannot be taken", async () => {
    const { pool, client } = fakePool();
    client.query.mockRejectedValueOnce(new Error("lock failed"));
    const fn = vi.fn();
    await expect(withAdvisoryLock(pool, 42, fn)).rejects.toThrow("lock failed");
    expect(fn).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
