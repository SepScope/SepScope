import { describe, expect, it } from "vitest";
import { DEFAULT_ANCHORS_FILE, loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("applies the documented defaults", () => {
    expect(loadConfig({ DATABASE_URL: "postgres://x" })).toEqual({
      databaseUrl: "postgres://x",
      checkIntervalMs: 15 * 60_000,
      logLevel: "info",
      anchorsFile: DEFAULT_ANCHORS_FILE,
      concurrency: 4,
      hostIntervalMs: 1000,
    });
    expect(DEFAULT_ANCHORS_FILE).toMatch(/SepScope\/anchors\.json$/);
  });

  it("reads overrides and treats empty values as unset", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://x",
      CHECK_INTERVAL_MINUTES: "0.5",
      LOG_LEVEL: "debug",
      ANCHORS_FILE: "/tmp/a.json",
      UNRELATED: "",
    });
    expect(config).toMatchObject({ checkIntervalMs: 30_000, logLevel: "debug", anchorsFile: "/tmp/a.json" });
    expect(loadConfig({ DATABASE_URL: "postgres://x", CHECK_INTERVAL_MINUTES: "" }).checkIntervalMs).toBe(900_000);
  });

  it.each([
    ["DATABASE_URL is missing", {}, /DATABASE_URL/],
    ["the interval is not a number", { DATABASE_URL: "x", CHECK_INTERVAL_MINUTES: "soon" }, /CHECK_INTERVAL_MINUTES/],
    ["the interval is zero", { DATABASE_URL: "x", CHECK_INTERVAL_MINUTES: "0" }, /CHECK_INTERVAL_MINUTES/],
    ["the log level is unknown", { DATABASE_URL: "x", LOG_LEVEL: "loud" }, /LOG_LEVEL/],
  ])("rejects when %s", (_, env, error) => {
    expect(() => loadConfig(env)).toThrow(error);
  });
});
