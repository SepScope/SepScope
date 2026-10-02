import type { Database, DbConnection } from "@sepscope/db";
import { createTestDb, resetTestDb } from "@sepscope/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp, type AppOptions } from "../src/app.js";
import { NOW, addAnchor, addRun, hoursAgo, reachable } from "./helpers/seed.js";

let conn: DbConnection;
beforeAll(async () => {
  conn = await createTestDb();
});
beforeEach(() => resetTestDb(conn));
afterAll(() => conn.close());

const app = (overrides: Partial<AppOptions> = {}) =>
  buildApp({ db: conn.db, rateLimitPerMinute: 1000, now: () => NOW, ...overrides });

async function get(url: string, overrides?: Partial<AppOptions>) {
  const a = await app(overrides);
  const res = await a.inject({ method: "GET", url });
  await a.close();
  return { status: res.statusCode, body: res.json(), headers: res.headers };
}

describe("GET /healthz", () => {
  it("is ok when the database answers", async () => {
    expect(await get("/healthz")).toMatchObject({ status: 200, body: { status: "ok" } });
  });

  it("is 503 when the database does not", async () => {
    const broken = { execute: async () => Promise.reject(new Error("connection refused")) } as unknown as Database;
    expect(await get("/healthz", { db: broken })).toMatchObject({
      status: 503,
      body: { statusCode: 503, error: "Service Unavailable", message: "Database unavailable" },
    });
  });
});

describe("GET /v1/anchors", () => {
  it("is an empty list before any anchor is synced", async () => {
    expect(await get("/v1/anchors")).toMatchObject({ status: 200, body: [] });
  });

  it("reports score, uptime and last-checked time from the runs", async () => {
    const a = await addAnchor(conn.db, "a.example", "testnet", "Anchor A");
    // Older run: a failure that only the 7-day uptime should still see.
    await addRun(conn.db, a.id, hoursAgo(48), [reachable("fail")]);
    // Latest run: 2 of 3 non-skipped checks passed.
    await addRun(conn.db, a.id, hoursAgo(1), [
      reachable("pass"),
      { checkId: "sep1.cors", status: "fail", error: "Missing Access-Control-Allow-Origin header" },
      { checkId: "sep1.parse", status: "pass" },
      { checkId: "sep6.info", status: "skipped" },
    ]);
    // In progress: ignored for score and last-checked time.
    await addRun(conn.db, a.id, hoursAgo(0), [], { finished: false });

    const { status, body } = await get("/v1/anchors");
    expect(status).toBe(200);
    expect(body).toEqual([
      {
        domain: "a.example",
        network: "testnet",
        name: "Anchor A",
        reachable: true,
        score: 66.7,
        uptime24h: 100,
        uptime7d: 50,
        lastCheckedAt: new Date(hoursAgo(1).getTime() + 5000).toISOString(),
      },
    ]);
  });

  it("lists anchors without runs with null metrics, sorted by domain", async () => {
    await addAnchor(conn.db, "z.example");
    const b = await addAnchor(conn.db, "b.example", "pubnet");
    await addRun(conn.db, b.id, hoursAgo(200), [reachable("pass")]); // older than 7 days
    const { body } = await get("/v1/anchors");
    expect(body.map((a: { domain: string }) => a.domain)).toEqual(["b.example", "z.example"]);
    expect(body[0]).toMatchObject({ score: 100, uptime24h: null, uptime7d: null });
    expect(body[1]).toMatchObject({ reachable: null, score: null, uptime24h: null, uptime7d: null, lastCheckedAt: null });
  });

  it("reports an anchor whose toml was unreachable in the latest run", async () => {
    const a = await addAnchor(conn.db, "down.example");
    await addRun(conn.db, a.id, hoursAgo(3), [reachable("pass")]);
    await addRun(conn.db, a.id, hoursAgo(1), [reachable("fail"), { checkId: "sep1.cors", status: "skipped" }]);
    expect((await get("/v1/anchors")).body[0]).toMatchObject({ reachable: false, score: 0, uptime24h: 50 });
  });

  it("filters by network", async () => {
    await addAnchor(conn.db, "test.example", "testnet");
    await addAnchor(conn.db, "pub.example", "pubnet");
    const { body } = await get("/v1/anchors?network=pubnet");
    expect(body.map((a: { domain: string }) => a.domain)).toEqual(["pub.example"]);
  });

  it("rejects an unknown network", async () => {
    expect((await get("/v1/anchors?network=futurenet")).status).toBe(400);
  });
});

describe("GET /v1/anchors/:domain", () => {
  it("returns the latest result for each check, in check order, omitting empty fields", async () => {
    const a = await addAnchor(conn.db, "a.example");
    await addRun(conn.db, a.id, hoursAgo(5), [reachable("fail")]);
    await addRun(conn.db, a.id, hoursAgo(1), [
      { checkId: "sep24.info", status: "pass", latencyMs: 311, detail: { deposit: ["USDC"], withdraw: ["USDC"] } },
      { checkId: "sep1.cors", status: "pass", latencyMs: 142 },
      reachable("pass"),
      { checkId: "sep6.info", status: "skipped", error: "TRANSFER_SERVER is not declared" },
      { checkId: "retired.check", status: "pass" },
    ]);

    const { status, body } = await get("/v1/anchors/a.example");
    expect(status).toBe(200);
    // Score counts only the latest run; uptime counts both runs in the last 24 hours.
    expect(body).toMatchObject({ domain: "a.example", score: 100, uptime24h: 50 });
    expect(body.checks).toEqual([
      { checkId: "sep1.reachable", status: "pass", latencyMs: 100 },
      { checkId: "sep1.cors", status: "pass", latencyMs: 142 },
      { checkId: "sep6.info", status: "skipped", error: "TRANSFER_SERVER is not declared" },
      { checkId: "sep24.info", status: "pass", latencyMs: 311, detail: { deposit: ["USDC"], withdraw: ["USDC"] } },
      { checkId: "retired.check", status: "pass" },
    ]);
  });

  it("has no checks before the first run", async () => {
    await addAnchor(conn.db, "a.example");
    expect((await get("/v1/anchors/a.example")).body).toMatchObject({ score: null, checks: [] });
  });

  it("is 404 for an unknown anchor", async () => {
    expect(await get("/v1/anchors/nope.example")).toMatchObject({
      status: 404,
      body: { statusCode: 404, error: "Not Found", message: "Unknown anchor: nope.example" },
    });
  });
});

describe("GET /v1/anchors/:domain/history", () => {
  async function seed() {
    const a = await addAnchor(conn.db, "a.example");
    const old = await addRun(conn.db, a.id, hoursAgo(72), [reachable("fail"), { checkId: "sep1.cors", status: "pass" }]);
    const recent = await addRun(conn.db, a.id, hoursAgo(2), [
      reachable("pass"),
      { checkId: "sep1.cors", status: "fail", error: "nope" },
    ]);
    return { old, recent };
  }

  it("defaults to every check over the last 24 hours", async () => {
    const { recent } = await seed();
    const { status, body } = await get("/v1/anchors/a.example/history");
    expect(status).toBe(200);
    expect(body).toEqual({
      domain: "a.example",
      check: null,
      range: "24h",
      results: [
        { runId: recent.id, startedAt: hoursAgo(2).toISOString(), checkId: "sep1.cors", status: "fail", error: "nope" },
        { runId: recent.id, startedAt: hoursAgo(2).toISOString(), checkId: "sep1.reachable", status: "pass", latencyMs: 100 },
      ],
    });
  });

  it("returns one check over 7 days, oldest first", async () => {
    const { old, recent } = await seed();
    const { body } = await get("/v1/anchors/a.example/history?check=sep1.reachable&range=7d");
    expect(body.check).toBe("sep1.reachable");
    expect(body.range).toBe("7d");
    expect(body.results.map((r: { runId: number; status: string }) => [r.runId, r.status])).toEqual([
      [old.id, "fail"],
      [recent.id, "pass"],
    ]);
  });

  it.each([
    ["an unknown check", "?check=sep99.nope"],
    ["an unknown range", "?range=30d"],
  ])("rejects %s", async (_, query) => {
    await seed();
    expect((await get(`/v1/anchors/a.example/history${query}`)).status).toBe(400);
  });

  it("is 404 for an unknown anchor", async () => {
    expect((await get("/v1/anchors/nope.example/history")).status).toBe(404);
  });
});

describe("cross-cutting behaviour", () => {
  it("allows GET from any origin", async () => {
    const { headers } = await get("/v1/anchors");
    const a = await app();
    const res = await a.inject({ method: "GET", url: "/v1/anchors", headers: { origin: "https://wallet.example" } });
    const preflight = await a.inject({
      method: "OPTIONS",
      url: "/v1/anchors",
      headers: { origin: "https://wallet.example", "access-control-request-method": "GET" },
    });
    await a.close();
    expect(headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-methods"]).toBe("GET, HEAD");
  });

  it("is read-only", async () => {
    const a = await app();
    const res = await a.inject({ method: "POST", url: "/v1/anchors", payload: {} });
    await a.close();
    expect(res.statusCode).toBe(404);
  });

  it("rate-limits per client but never /healthz", async () => {
    const a = await app({ rateLimitPerMinute: 2 });
    const hit = (url: string) => a.inject({ method: "GET", url }).then((r) => r.statusCode);
    expect([await hit("/v1/anchors"), await hit("/v1/anchors"), await hit("/v1/anchors")]).toEqual([200, 200, 429]);
    expect([await hit("/healthz"), await hit("/healthz"), await hit("/healthz")]).toEqual([200, 200, 200]);
    await a.close();
  });

  it("with a trusted proxy hop, limits each forwarded client separately", async () => {
    const a = await app({ rateLimitPerMinute: 1, trustProxy: 1 });
    const hit = (ip: string) =>
      a.inject({ method: "GET", url: "/v1/anchors", headers: { "x-forwarded-for": ip } }).then((r) => r.statusCode);
    expect([await hit("1.1.1.1"), await hit("2.2.2.2"), await hit("1.1.1.1")]).toEqual([200, 200, 429]);
    await a.close();
  });

  it("serves OpenAPI docs at /docs", async () => {
    const a = await app();
    const ui = await a.inject({ method: "GET", url: "/docs" });
    const spec = await a.inject({ method: "GET", url: "/docs/json" });
    await a.close();
    expect(ui.statusCode).toBeLessThan(400);
    const doc = spec.json();
    expect(doc.openapi).toMatch(/^3\./);
    expect(Object.keys(doc.paths).sort()).toEqual([
      "/healthz",
      "/v1/anchors",
      "/v1/anchors/{domain}",
      "/v1/anchors/{domain}/history",
    ]);
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining(["AnchorSummary", "AnchorDetail", "CheckResult", "History", "Error"]),
    );
  });
});
