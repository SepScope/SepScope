import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("applies the documented defaults", () => {
    expect(loadConfig({ DATABASE_URL: "postgres://x" })).toEqual({
      databaseUrl: "postgres://x",
      port: 8080,
      host: "0.0.0.0",
      logLevel: "info",
      rateLimitPerMinute: 120,
      trustProxy: false,
      shutdownTimeoutMs: 25_000,
    });
  });

  it("reads overrides and treats empty values as unset", () => {
    expect(
      loadConfig({
        DATABASE_URL: "postgres://x",
        API_PORT: "9090",
        API_HOST: "127.0.0.1",
        LOG_LEVEL: "warn",
        RATE_LIMIT_PER_MINUTE: "30",
        TRUST_PROXY: "",
        SHUTDOWN_TIMEOUT_SECONDS: "3",
      }),
    ).toEqual({
      databaseUrl: "postgres://x",
      port: 9090,
      host: "127.0.0.1",
      logLevel: "warn",
      rateLimitPerMinute: 30,
      trustProxy: false,
      shutdownTimeoutMs: 3000,
    });
  });

  it.each([
    ["true", true],
    ["false", false],
    ["2", 2],
  ])("parses TRUST_PROXY=%s", (value, expected) => {
    expect(loadConfig({ DATABASE_URL: "x", TRUST_PROXY: value }).trustProxy).toBe(expected);
  });

  it.each([
    ["DATABASE_URL is missing", {}, /DATABASE_URL/],
    ["the port is out of range", { DATABASE_URL: "x", API_PORT: "70000" }, /API_PORT/],
    ["the rate limit is zero", { DATABASE_URL: "x", RATE_LIMIT_PER_MINUTE: "0" }, /RATE_LIMIT_PER_MINUTE/],
    ["TRUST_PROXY is not a boolean or hop count", { DATABASE_URL: "x", TRUST_PROXY: "yes" }, /TRUST_PROXY/],
    ["the log level is unknown", { DATABASE_URL: "x", LOG_LEVEL: "loud" }, /LOG_LEVEL/],
  ])("rejects when %s", (_, env, error) => {
    expect(() => loadConfig(env)).toThrow(error);
  });
});
