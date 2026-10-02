import { describe, expect, it } from "vitest";
import { sep38Info } from "../../src/checks/sep38.js";
import { runChecks } from "../../src/runner.js";
import { DOMAIN, ISSUER, SEP38_INFO, TOML_URL, runInfo } from "../helpers/info-fixtures.js";
import { CORS, mockFetch } from "../helpers/mock-fetch.js";

const FIELD = "ANCHOR_QUOTE_SERVER";
const run = (body: unknown) => runInfo(sep38Info, FIELD, { body: JSON.stringify(body) });

describe("sep38.info", () => {
  it("passes on a valid response and lists the assets", async () => {
    const { result } = await run(SEP38_INFO);
    expect(result).toMatchObject({
      checkId: "sep38.info",
      status: "pass",
      detail: { assets: [`stellar:USDC:${ISSUER}`, "stellar:native", "iso4217:BRL"] },
    });
  });

  it("passes with an empty asset list", async () => {
    expect((await run({ assets: [] })).result).toMatchObject({ status: "pass", detail: { assets: [] } });
  });

  it.each<[string, unknown, RegExp]>([
    ["assets is missing", {}, /assets: /],
    ["assets is an object", { assets: { USDC: {} } }, /assets: /],
    ["an entry has no asset", { assets: [{ country_codes: ["BRA"] }] }, /assets\.0\.asset: /],
    ["an asset is a bare code", { assets: [{ asset: "USDC" }] }, /assets\.0\.asset: is not a SEP-38 asset identifier/],
    ["a stellar asset has no issuer", { assets: [{ asset: "stellar:USDC" }] }, /assets\.0\.asset: /],
    ["a fiat code is not ISO 4217", { assets: [{ asset: "iso4217:usd" }] }, /assets\.0\.asset: /],
  ])("fails when %s", async (_, body, error) => {
    const { result } = await run(body);
    expect(result.status).toBe("fail");
    expect(result.error).toMatch(error);
  });

  it("discovers the endpoint from the toml in a full run", async () => {
    const mock = mockFetch({
      [TOML_URL]: { body: `${FIELD} = "https://anchor.example/sep38"\n`, headers: CORS },
      "https://anchor.example/sep38/info": { body: JSON.stringify(SEP38_INFO) },
    });
    const { results } = await runChecks(DOMAIN, { fetch: mock.fetch });
    expect(results.find((r) => r.checkId === "sep38.info")?.status).toBe("pass");
  });
});
