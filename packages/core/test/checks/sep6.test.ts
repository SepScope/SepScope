import { describe, expect, it } from "vitest";
import { sep6Info } from "../../src/checks/sep6.js";
import { runChecks } from "../../src/runner.js";
import { DOMAIN, SEP6_INFO, TOML_URL, runInfo } from "../helpers/info-fixtures.js";
import { CORS, mockFetch } from "../helpers/mock-fetch.js";

const FIELD = "TRANSFER_SERVER";
const run = (body: unknown) => runInfo(sep6Info, FIELD, { body: JSON.stringify(body) });

describe("sep6.info", () => {
  it("passes on a valid response and lists the enabled assets", async () => {
    const { result } = await run(SEP6_INFO);
    expect(result).toMatchObject({
      checkId: "sep6.info",
      status: "pass",
      detail: { deposit: ["USDC"], withdraw: ["USDC"] },
    });
  });

  it("accepts deposit-exchange and withdraw-exchange", async () => {
    const body = { ...SEP6_INFO, "deposit-exchange": { USDC: { enabled: true } }, "withdraw-exchange": {} };
    expect((await run(body)).result.status).toBe("pass");
  });

  it.each<[string, unknown, RegExp]>([
    ["deposit is missing", { withdraw: SEP6_INFO.withdraw }, /deposit: /],
    ["deposit is an array", { ...SEP6_INFO, deposit: [] }, /deposit: /],
    ["an asset has no enabled flag", { ...SEP6_INFO, withdraw: { USDC: {} } }, /withdraw\.USDC\.enabled: /],
    ["deposit-exchange is malformed", { ...SEP6_INFO, "deposit-exchange": { USDC: { enabled: 1 } } }, /deposit-exchange\.USDC\.enabled: /],
  ])("fails when %s", async (_, body, error) => {
    const { result } = await run(body);
    expect(result.status).toBe("fail");
    expect(result.error).toMatch(error);
  });

  it("discovers the endpoint from the toml in a full run", async () => {
    const mock = mockFetch({
      [TOML_URL]: { body: `${FIELD} = "https://anchor.example/sep6"\n`, headers: CORS },
      "https://anchor.example/sep6/info": { body: JSON.stringify(SEP6_INFO) },
    });
    const { results } = await runChecks(DOMAIN, { fetch: mock.fetch });
    expect(results.find((r) => r.checkId === "sep6.info")?.status).toBe("pass");
  });

  it("is skipped in a full run when the toml does not declare it", async () => {
    const mock = mockFetch({ [TOML_URL]: { body: `SIGNING_KEY = "G"\n`, headers: CORS } });
    const { results } = await runChecks(DOMAIN, { fetch: mock.fetch });
    expect(results.find((r) => r.checkId === "sep6.info")).toMatchObject({
      status: "skipped",
      error: "TRANSFER_SERVER is not declared",
    });
  });
});
