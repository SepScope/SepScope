import { describe, expect, it } from "vitest";
import { STALE_GRACE_MS, isStale, startHealthServer } from "../src/health.js";

describe("isStale", () => {
  const interval = 15 * 60_000;
  it("allows two intervals plus a grace period without progress", () => {
    expect(isStale(0, 2 * interval + STALE_GRACE_MS, interval)).toBe(false);
    expect(isStale(0, 2 * interval + STALE_GRACE_MS + 1, interval)).toBe(true);
  });
});

describe("startHealthServer", () => {
  it("reports 200 or 503 from the check, and 503 if it throws", async () => {
    const reports = [
      { healthy: true, body: { status: "ok" } },
      { healthy: false, body: { status: "stalled" } },
    ];
    let call = 0;
    const server = await startHealthServer(0, "127.0.0.1", async () => {
      const report = reports[call++];
      if (!report) throw new Error("boom");
      return report;
    });
    const get = async (path = "/healthz", method = "GET") => {
      const res = await fetch(`${server.url}${path}`, { method });
      return [res.status, await res.json()];
    };
    expect(await get()).toEqual([200, { status: "ok" }]);
    expect(await get()).toEqual([503, { status: "stalled" }]);
    expect(await get()).toEqual([503, { status: "error", error: "boom" }]);
    expect(await get("/nope")).toEqual([404, { error: "Not Found" }]);
    expect(await get("/healthz", "POST")).toEqual([404, { error: "Not Found" }]);
    await server.close();
  });

  it("formats IPv6 addresses in its URL", async () => {
    const server = await startHealthServer(0, "::1", async () => ({ healthy: true, body: {} })).catch(() => null);
    // Hosts without IPv6 loopback cannot bind ::1; that is not what this test is about.
    if (!server) return;
    expect(server.url).toMatch(/^http:\/\/\[::1\]:\d+$/);
    expect((await fetch(`${server.url}/healthz`)).status).toBe(200);
    await server.close();
  });

  it("rejects when the port is taken", async () => {
    const first = await startHealthServer(0, "127.0.0.1", async () => ({ healthy: true, body: {} }));
    const port = Number(new URL(first.url).port);
    await expect(startHealthServer(port, "127.0.0.1", async () => ({ healthy: true, body: {} }))).rejects.toThrow(
      /EADDRINUSE/,
    );
    await first.close();
  });
});
