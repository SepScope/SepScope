import { describe, expect, it } from "vitest";
import { sep24Info } from "../../src/checks/sep24.js";
import { runChecks } from "../../src/runner.js";
import { DOMAIN, SEP24_INFO, TOML_URL, runInfo } from "../helpers/info-fixtures.js";
import { CORS, mockFetch } from "../helpers/mock-fetch.js";

const FIELD = "TRANSFER_SERVER_SEP0024";
const run = (body: unknown) => runInfo(sep24Info, FIELD, { body: JSON.stringify(body) });

describe("sep24.info", () => {
  it("passes on a valid response and lists the enabled assets", async () => {
    const { result } = await run(SEP24_INFO);
    expect(result).toMatchObject({
      checkId: "sep24.info",
      status: "pass",
      detail: { deposit: ["USDC", "native"], withdraw: ["USDC"] },
    });
  });

  it("passes with only the required fields", async () => {
    const { result } = await run({ deposit: {}, withdraw: {} });
    expect(result).toMatchObject({ status: "pass", detail: { deposit: [], withdraw: [] } });
  });

  it.each<[string, unknown, RegExp]>([
    ["withdraw is missing", { deposit: SEP24_INFO.deposit }, /withdraw: /],
    ["an asset has no enabled flag", { ...SEP24_INFO, deposit: { USDC: { min_amount: 1 } } }, /deposit\.USDC\.enabled: /],
    ["enabled is a string", { ...SEP24_INFO, withdraw: { USDC: { enabled: "true" } } }, /withdraw\.USDC\.enabled: /],
    ["fee is malformed", { ...SEP24_INFO, fee: true }, /fee: /],
  ])("fails when %s", async (_, body, error) => {
    const { result } = await run(body);
    expect(result.status).toBe("fail");
    expect(result.error).toMatch(error);
  });

  it("discovers the endpoint from the toml in a full run", async () => {
    const mock = mockFetch({
      [TOML_URL]: { body: `${FIELD} = "https://anchor.example/sep24"\n`, headers: CORS },
      "https://anchor.example/sep24/info": { body: JSON.stringify(SEP24_INFO) },
    });
    const { results } = await runChecks(DOMAIN, { fetch: mock.fetch });
    expect(results.find((r) => r.checkId === "sep24.info")?.status).toBe("pass");
  });

  it("is skipped when the toml is unreachable", async () => {
    const { results } = await runChecks(DOMAIN, { fetch: mockFetch({}).fetch });
    expect(results.find((r) => r.checkId === "sep24.info")).toMatchObject({
      status: "skipped",
      detail: { blockedBy: ["sep1.parse"] },
    });
  });
});
