import { describe, expect, it } from "vitest";
import { sep24Info } from "../src/checks/sep24.js";
import { sep38Info } from "../src/checks/sep38.js";
import { sep6Info } from "../src/checks/sep6.js";
import { infoUrl } from "../src/info.js";
import type { Check } from "../src/types.js";
import { USER_AGENT } from "../src/version.js";
import { SEP24_INFO, SEP38_INFO, SEP6_INFO, runInfo } from "./helpers/info-fixtures.js";

// Failure modes shared by every /info check.
const cases: [Check, string, unknown][] = [
  [sep6Info, "TRANSFER_SERVER", SEP6_INFO],
  [sep24Info, "TRANSFER_SERVER_SEP0024", SEP24_INFO],
  [sep38Info, "ANCHOR_QUOTE_SERVER", SEP38_INFO],
];

describe.each(cases)("%s", (check, field, valid) => {
  it("GETs {endpoint}/info with the SEPscope User-Agent", async () => {
    const { result, calls } = await runInfo(check, field, { body: JSON.stringify(valid) });
    expect(result.status).toBe("pass");
    expect(result.latencyMs).toBeTypeOf("number");
    expect(calls.map((c) => c.url)).toEqual(["https://anchor.example/api/info"]);
    expect(new Headers(calls[0]!.init?.headers).get("user-agent")).toBe(USER_AGENT);
  });

  it("handles a trailing slash on the endpoint", async () => {
    const { result, calls } = await runInfo(check, field, { body: JSON.stringify(valid) }, { base: "https://anchor.example/api/" });
    expect(result.status).toBe("pass");
    expect(calls[0]!.url).toBe("https://anchor.example/api/info");
  });

  it("is skipped, not failed, when the toml does not declare the endpoint", async () => {
    const { result, calls } = await runInfo(check, field, {}, { toml: { NETWORK_PASSPHRASE: "x" } });
    expect(result).toEqual({ checkId: check.id, status: "skipped", error: `${field} is not declared` });
    expect(calls).toHaveLength(0);
  });

  it("fails on a non-200 status", async () => {
    const { result } = await runInfo(check, field, { status: 500, body: "oops" });
    expect(result).toMatchObject({ status: "fail", error: "Expected HTTP 200 from https://anchor.example/api/info, got 500" });
  });

  it("fails on malformed JSON", async () => {
    const { result } = await runInfo(check, field, { body: '{"deposit": ' });
    expect(result).toMatchObject({ status: "fail", error: "Response from https://anchor.example/api/info is not valid JSON" });
  });

  it.each([["null", "null"], ["an array", "[]"], ["an empty object", "{}"]])("fails when the body is %s", async (_, body) => {
    const { result } = await runInfo(check, field, { body });
    expect(result.status).toBe("fail");
    expect(result.error).toMatch(/^Invalid \/info response: /);
  });

  it("fails on a timeout", async () => {
    const { result } = await runInfo(check, field, "hang", { timeoutMs: 20 });
    expect(result.status).toBe("fail");
    expect(result.error).toMatch(/timed out after 20ms$/);
  });

  it("fails on a network error", async () => {
    const { result } = await runInfo(check, field, {}, { toml: { [field]: "https://unmapped.example" } });
    expect(result.status).toBe("fail");
    expect(result.error).toMatch(/ENOTFOUND/);
  });

  it.each([
    ["an unparseable endpoint", "not a url", /is not a valid URL/],
    ["a non-string endpoint", 42, /is not a valid URL/],
    ["an HTTP endpoint", "http://anchor.example/api", /is not HTTPS/],
  ])("fails without a request on %s", async (_, base, error) => {
    const { result, calls } = await runInfo(check, field, {}, { base });
    expect(result.status).toBe("fail");
    expect(result.error).toMatch(error);
    expect(calls).toHaveLength(0);
  });

  it("throws if run without a parsed toml", async () => {
    await expect(check.run({ domain: "anchor.example", fetch: fetch, timeoutMs: 1 })).rejects.toThrow(
      "stellar.toml was not parsed",
    );
  });
});

describe("infoUrl", () => {
  it.each([
    ["https://a.example", "https://a.example/info"],
    ["https://a.example/", "https://a.example/info"],
    ["https://a.example/sep24//", "https://a.example/sep24/info"],
  ])("%s -> %s", (base, expected) => {
    expect(infoUrl(new URL(base))).toBe(expected);
  });
});
