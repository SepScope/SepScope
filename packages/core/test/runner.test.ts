import { describe, expect, it } from "vitest";
import { DEFAULT_TIMEOUT_MS, httpGet } from "../src/http.js";
import { allChecks, runChecks } from "../src/runner.js";
import type { Check } from "../src/types.js";
import { mockFetch } from "./helpers/mock-fetch.js";

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
