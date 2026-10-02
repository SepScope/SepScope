import { describe, expect, it } from "vitest";
import { DEFAULT_TIMEOUT_MS, errorMessage, fetchText, httpGet } from "../src/http.js";
import { allChecks, runChecks } from "../src/runner.js";
import type { Check } from "../src/types.js";
import { CORS, VALID_TOML, mockFetch } from "./helpers/mock-fetch.js";

const check = (id: string, status: "pass" | "warn" | "fail", dependsOn?: string[]): Check => ({
  id,
  dependsOn,
  run: async () => ({ checkId: id, status }),
});

describe("runChecks", () => {
  it("runs checks in order and treats warn as satisfying a dependency", async () => {
    const { results } = await runChecks("x", { checks: [check("a", "warn"), check("b", "pass", ["a"])] });
    expect(results.map((r) => r.status)).toEqual(["warn", "pass"]);
  });

  it("skips checks whose dependency failed, was skipped, or never ran", async () => {
    const { results } = await runChecks("x", {
      checks: [check("a", "fail"), check("b", "pass", ["a"]), check("c", "pass", ["b"]), check("d", "pass", ["zzz"])],
    });
    expect(results.map((r) => r.status)).toEqual(["fail", "skipped", "skipped", "skipped"]);
    expect(results[3]?.detail).toEqual({ blockedBy: ["zzz"] });
  });

  it("records a thrown exception as a failure and keeps going", async () => {
    const boom: Check = { id: "boom", run: async () => { throw new Error("kaboom"); } };
    const thrownString: Check = { id: "str", run: async () => { throw "plain"; } };
    const { results } = await runChecks("x", { checks: [boom, thrownString, check("after", "pass")] });
    expect(results).toEqual([
      { checkId: "boom", status: "fail", error: "kaboom" },
      { checkId: "str", status: "fail", error: "plain" },
      { checkId: "after", status: "pass" },
    ]);
  });

  it("defaults to every registered check, the global fetch and a 10s timeout", async () => {
    let seen: { fetch: unknown; timeoutMs: number } | undefined;
    const probe: Check = {
      id: "probe",
      run: async (ctx) => {
        seen = { fetch: ctx.fetch, timeoutMs: ctx.timeoutMs };
        return { checkId: "probe", status: "pass" };
      },
    };
    await runChecks("x", { checks: [probe] });
    expect(seen).toEqual({ fetch: globalThis.fetch, timeoutMs: DEFAULT_TIMEOUT_MS });
    expect(DEFAULT_TIMEOUT_MS).toBe(10_000);

    const { results } = await runChecks("anchor.example", { fetch: mockFetch({}).fetch });
    expect(results.map((r) => r.checkId)).toEqual(allChecks.map((c) => c.id));
  });

  it("registers checks after their dependencies", () => {
    const seen = new Set<string>();
    for (const c of allChecks) {
      for (const dep of c.dependsOn ?? []) expect(seen, `${c.id} depends on ${dep}`).toContain(dep);
      seen.add(c.id);
    }
  });
});

describe("httpGet", () => {
  it("rethrows non-timeout errors unchanged", async () => {
    const ctx = { domain: "x", fetch: mockFetch({}).fetch, timeoutMs: 1000 };
    await expect(httpGet(ctx, "https://nowhere.example/")).rejects.toThrow(/ENOTFOUND/);
  });
});

describe("fetchText", () => {
  const URL_ = "https://anchor.example/x";

  it("waits for the throttle before starting the timeout or the latency clock", async () => {
    const mock = mockFetch({ [URL_]: { body: "hi" } });
    const order: string[] = [];
    const throttle = async (url: string) => {
      order.push(`throttle ${url}`);
      // Longer than the timeout: a throttle inside the timeout would abort the request.
      await new Promise((r) => setTimeout(r, 400));
    };
    const ctx = { domain: "x", fetch: mock.fetch, timeoutMs: 250, throttle };
    const res = await fetchText(ctx, URL_);
    order.push(`fetch ${mock.calls[0]?.url}`);
    expect(order).toEqual([`throttle ${URL_}`, `fetch ${URL_}`]);
    expect(res).toMatchObject({ ok: true, status: 200, body: "hi", url: URL_ });
    // Latency that included the throttle would be at least 400ms.
    expect(res.latencyMs).toBeLessThan(250);
  });

  it("returns failures instead of throwing", async () => {
    const res = await fetchText({ domain: "x", fetch: mockFetch({}).fetch, timeoutMs: 1000 }, URL_);
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/ENOTFOUND/) });
    expect(res.latencyMs).toBeTypeOf("number");
  });
});

describe("runChecks throttle", () => {
  it("passes the throttle to every request a check makes", async () => {
    const tomlUrl = "https://anchor.example/.well-known/stellar.toml";
    const mock = mockFetch({
      [tomlUrl]: { body: VALID_TOML, headers: CORS },
    });
    const throttled: string[] = [];
    await runChecks("anchor.example", { fetch: mock.fetch, throttle: async (url) => void throttled.push(url) });
    expect(throttled).toEqual(mock.calls.map((c) => c.url));
    expect(throttled).toContain(tomlUrl);
    expect(throttled.length).toBeGreaterThan(1);
  });
});

describe("errorMessage", () => {
  it("includes the cause of a network failure", () => {
    const cause = Object.assign(new Error("connect ETIMEDOUT 1.2.3.4:443"), { code: "ETIMEDOUT" });
    expect(errorMessage(new TypeError("fetch failed", { cause }))).toBe(
      "fetch failed (ETIMEDOUT: connect ETIMEDOUT 1.2.3.4:443)",
    );
    expect(errorMessage(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }))).toBe(
      "fetch failed (ECONNRESET)",
    );
    expect(errorMessage(new Error("plain"))).toBe("plain");
    expect(errorMessage("text")).toBe("text");
  });
});
