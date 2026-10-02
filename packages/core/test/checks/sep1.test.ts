import { describe, expect, it } from "vitest";
import {
  CORS_PROBE_ORIGIN,
  sep1Cors,
  sep1Fields,
  sep1Parse,
  sep1Reachable,
  stellarTomlUrl,
} from "../../src/checks/sep1.js";
import { DEFAULT_TIMEOUT_MS } from "../../src/http.js";
import { runChecks } from "../../src/runner.js";
import type { CheckContext } from "../../src/types.js";
import { USER_AGENT } from "../../src/version.js";
import { CORS, VALID_TOML, mockFetch, type MockRoute } from "../helpers/mock-fetch.js";

const DOMAIN = "anchor.example";
const TOML_URL = "https://anchor.example/.well-known/stellar.toml";

function context(route: MockRoute, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const mock = mockFetch({ [TOML_URL]: route });
  const ctx: CheckContext = { domain: DOMAIN, fetch: mock.fetch, timeoutMs };
  return { ctx, calls: mock.calls };
}

async function run(route: MockRoute, timeoutMs?: number) {
  const mock = mockFetch({ [TOML_URL]: route });
  return runChecks(DOMAIN, { fetch: mock.fetch, timeoutMs });
}

function byId(results: { checkId: string }[]) {
  return Object.fromEntries(results.map((r) => [r.checkId, r])) as Record<string, any>;
}

describe("stellarTomlUrl", () => {
  it("builds the well-known URL over HTTPS", () => {
    expect(stellarTomlUrl(DOMAIN)).toBe(TOML_URL);
  });
});

describe("sep1.reachable", () => {
  it("passes on HTTP 200 over HTTPS and stores the response", async () => {
    const { ctx, calls } = context({ body: VALID_TOML, headers: CORS });
    const result = await sep1Reachable.run(ctx);
    expect(result.status).toBe("pass");
    expect(result.latencyMs).toBeTypeOf("number");
    expect(ctx.tomlResponse?.body).toBe(VALID_TOML);
    expect(calls).toHaveLength(1);
    const sent = new Headers(calls[0]!.init?.headers);
    expect(sent.get("user-agent")).toBe(USER_AGENT);
    expect(sent.get("origin")).toBe(CORS_PROBE_ORIGIN);
  });

  it("falls back to the requested URL when the response has none", async () => {
    const { ctx } = context({ body: VALID_TOML, url: "" });
    expect((await sep1Reachable.run(ctx)).status).toBe("pass");
    expect(ctx.tomlResponse?.url).toBe(TOML_URL);
  });

  it("fails on a non-200 status", async () => {
    const { ctx } = context({ status: 404, body: "not found" });
    const result = await sep1Reachable.run(ctx);
    expect(result).toMatchObject({ status: "fail", error: "Expected HTTP 200, got 404" });
    expect(ctx.tomlResponse).toBeUndefined();
  });

  it("fails when redirected to plain HTTP", async () => {
    const { ctx } = context({ body: VALID_TOML, url: "http://anchor.example/.well-known/stellar.toml" });
    const result = await sep1Reachable.run(ctx);
    expect(result.status).toBe("fail");
    expect(result.error).toMatch(/non-HTTPS/);
  });

  it("fails with a timeout error when the server never answers", async () => {
    const { ctx } = context("hang", 20);
    const result = await sep1Reachable.run(ctx);
    expect(result.status).toBe("fail");
    expect(result.error).toBe(`Request to ${TOML_URL} timed out after 20ms`);
  });

  it("fails on a network error", async () => {
    const mock = mockFetch({});
    const result = await sep1Reachable.run({ domain: DOMAIN, fetch: mock.fetch, timeoutMs: 1000 });
    expect(result.status).toBe("fail");
    expect(result.error).toMatch(/ENOTFOUND/);
  });

  it("fails on an invalid domain without making a request", async () => {
    const { ctx, calls } = context({ body: VALID_TOML });
    ctx.domain = "bad domain";
    const result = await sep1Reachable.run(ctx);
    expect(result).toMatchObject({ status: "fail", error: "Invalid domain: bad domain" });
    expect(calls).toHaveLength(0);
  });
});

describe("sep1.cors", () => {
  it("passes when Access-Control-Allow-Origin is *", async () => {
    const results = byId((await run({ body: VALID_TOML, headers: CORS })).results);
    expect(results["sep1.cors"].status).toBe("pass");
  });

  it("fails when the header is missing", async () => {
    const results = byId((await run({ body: VALID_TOML })).results);
    expect(results["sep1.cors"]).toMatchObject({
      status: "fail",
      error: "Missing Access-Control-Allow-Origin header",
    });
  });

  it("fails when the header names a specific origin", async () => {
    const results = byId(
      (await run({ body: VALID_TOML, headers: { "Access-Control-Allow-Origin": "https://wallet.example" } })).results,
    );
    expect(results["sep1.cors"].status).toBe("fail");
    expect(results["sep1.cors"].error).toMatch(/must be "\*"/);
  });

  it("throws if run without a fetched toml", async () => {
    const { ctx } = context({ body: VALID_TOML });
    await expect(sep1Cors.run(ctx)).rejects.toThrow("stellar.toml was not fetched");
  });
});

describe("sep1.parse", () => {
  it("passes on valid TOML and exposes the parsed toml", async () => {
    const report = await run({ body: VALID_TOML, headers: CORS });
    expect(byId(report.results)["sep1.parse"].status).toBe("pass");
    expect(report.toml?.TRANSFER_SERVER_SEP0024).toBe("https://anchor.example/sep24");
  });

  it("fails on malformed TOML", async () => {
    const report = await run({ body: 'SIGNING_KEY = "unterminated\n[[broken', headers: CORS });
    const results = byId(report.results);
    expect(results["sep1.parse"].status).toBe("fail");
    expect(results["sep1.parse"].error).toMatch(/^Invalid TOML/);
    expect(report.toml).toBeUndefined();
  });

  it("throws if run without a fetched toml", async () => {
    const { ctx } = context({ body: VALID_TOML });
    await expect(sep1Parse.run(ctx)).rejects.toThrow("stellar.toml was not fetched");
  });
});

describe("sep1.fields", () => {
  async function fields(toml: Record<string, unknown>) {
    const { ctx } = context({ body: "" });
    ctx.toml = toml;
    return sep1Fields.run(ctx);
  }

  const base = { NETWORK_PASSPHRASE: "Test SDF Network ; September 2015", SIGNING_KEY: "GABC" };

  it("passes with required fields and valid HTTPS endpoints", async () => {
    const result = await fields({ ...base, TRANSFER_SERVER_SEP0024: "https://anchor.example/sep24" });
    expect(result.status).toBe("pass");
    expect(result.detail).toEqual({ endpoints: { TRANSFER_SERVER_SEP0024: "https://anchor.example/sep24" } });
  });

  it("passes when no endpoints are declared", async () => {
    expect((await fields(base)).status).toBe("pass");
  });

  it("fails when required fields are missing or empty", async () => {
    const result = await fields({ SIGNING_KEY: " " });
    expect(result.status).toBe("fail");
    expect(result.error).toBe("NETWORK_PASSPHRASE is missing; SIGNING_KEY is missing");
  });

  it.each([
    ["http URL", "http://anchor.example/auth"],
    ["relative path", "/auth"],
    ["non-string", 42],
  ])("fails when an endpoint is a %s", async (_, value) => {
    const result = await fields({ ...base, WEB_AUTH_ENDPOINT: value });
    expect(result.status).toBe("fail");
    expect(result.error).toMatch(/^WEB_AUTH_ENDPOINT is not a valid HTTPS URL/);
  });

  it("throws if run without a parsed toml", async () => {
    const { ctx } = context({ body: "" });
    await expect(sep1Fields.run(ctx)).rejects.toThrow("stellar.toml was not parsed");
  });
});

describe("SEP-1 dependency handling", () => {
  it("skips dependent checks when the toml is unreachable", async () => {
    const results = byId((await run({ status: 500 })).results);
    expect(results["sep1.reachable"].status).toBe("fail");
    expect(results["sep1.cors"].status).toBe("skipped");
    expect(results["sep1.parse"].status).toBe("skipped");
    expect(results["sep1.fields"].status).toBe("skipped");
  });

  it("skips sep1.fields but still runs sep1.cors when the toml does not parse", async () => {
    const results = byId((await run({ body: "= nope", headers: CORS })).results);
    expect(results["sep1.cors"].status).toBe("pass");
    expect(results["sep1.parse"].status).toBe("fail");
    expect(results["sep1.fields"]).toMatchObject({ status: "skipped", detail: { blockedBy: ["sep1.parse"] } });
  });

  it("skips everything downstream on a timeout", async () => {
    const results = (await run("hang", 20)).results;
    expect(results[0]).toMatchObject({ checkId: "sep1.reachable", status: "fail" });
    expect(results.slice(1).map((r) => r.status)).toEqual(results.slice(1).map(() => "skipped"));
  });
});
