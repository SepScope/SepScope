import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anchors, checkResults, checkRuns, createDb, type DbConnection } from "../src/index.js";
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
