import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { anchors, type DbConnection } from "@sepscope/db";
import { createTestDb, resetTestDb } from "@sepscope/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ANCHORS_FILE } from "../src/config.js";
import { loadRegistry, syncAnchors } from "../src/registry.js";

async function registryFile(content: string) {
  const path = join(await mkdtemp(join(tmpdir(), "sepscope-")), "anchors.json");
  await writeFile(path, content);
  return path;
}

describe("loadRegistry", () => {
  it("loads the repository's anchors.json", async () => {
    const entries = await loadRegistry(DEFAULT_ANCHORS_FILE);
    expect(entries.map((e) => e.domain)).toContain("testanchor.stellar.org");
  });

  it.each([
    ["is not JSON", "[{", /Could not read anchor registry/],
    ["is not an array", "{}", /Invalid anchor registry .*\(root\)/],
    ["has a URL instead of a domain", '[{"domain":"https://a.example","network":"testnet","name":"A"}]', /0\.domain: must be a bare/],
    ["has an unknown network", '[{"domain":"a.example","network":"futurenet","name":"A"}]', /0\.network/],
    ["has a blank name", '[{"domain":"a.example","network":"pubnet","name":" "}]', /0\.name/],
    [
      "repeats a domain",
      '[{"domain":"a.example","network":"pubnet","name":"A"},{"domain":"a.example","network":"pubnet","name":"B"}]',
      /1\.domain: duplicate domain a\.example/,
    ],
  ])("rejects a registry that %s", async (_, content, error) => {
    await expect(loadRegistry(await registryFile(content))).rejects.toThrow(error);
  });

  it("rejects a missing file", async () => {
    await expect(loadRegistry("/nonexistent/anchors.json")).rejects.toThrow(/Could not read anchor registry.*ENOENT/);
  });
});

describe("syncAnchors", () => {
  let conn: DbConnection;
  beforeAll(async () => {
    conn = await createTestDb();
  });
  beforeEach(() => resetTestDb(conn));
  afterAll(() => conn.close());

  it("inserts new anchors and updates existing ones by domain", async () => {
    const first = await syncAnchors(conn.db, [
      { domain: "a.example", network: "testnet", name: "A" },
      { domain: "b.example", network: "pubnet", name: "B" },
    ]);
    const second = await syncAnchors(conn.db, [{ domain: "a.example", network: "pubnet", name: "A renamed" }]);

    expect(second).toEqual([{ id: first[0]!.id, domain: "a.example" }]);
    const rows = await conn.db.select().from(anchors).orderBy(anchors.domain);
    expect(rows).toMatchObject([
      { domain: "a.example", network: "pubnet", name: "A renamed" },
      // Removed from the registry: kept, with its history, but no longer returned for scheduling.
      { domain: "b.example", network: "pubnet", name: "B" },
    ]);
  });

  it("returns nothing for an empty registry", async () => {
    expect(await syncAnchors(conn.db, [])).toEqual([]);
  });
});
