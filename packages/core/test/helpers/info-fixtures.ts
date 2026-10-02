import type { Check, CheckContext, StellarToml } from "../../src/types.js";
import { mockFetch, type MockRoute } from "./mock-fetch.js";

export const DOMAIN = "anchor.example";
export const ISSUER = "GCHLHDBOKG2JWMJQBTLSL5XG6NO7ESXI2TAQKZXCXWXB5WI2X6W233PR";
export const TOML_URL = "https://anchor.example/.well-known/stellar.toml";

export const SEP6_INFO = {
  deposit: { USDC: { enabled: true, authentication_required: true }, SRT: { enabled: false } },
  withdraw: { USDC: { enabled: true, types: { bank_account: {} } } },
  fee: { enabled: false },
};

export const SEP24_INFO = {
  deposit: { USDC: { enabled: true, min_amount: 1 }, native: { enabled: true } },
  withdraw: { USDC: { enabled: true }, native: { enabled: false } },
  fee: { enabled: true },
  features: { account_creation: true, claimable_balances: true },
};

export const SEP38_INFO = {
  assets: [
    { asset: `stellar:USDC:${ISSUER}` },
    { asset: "stellar:native" },
    { asset: "iso4217:BRL", country_codes: ["BRA"], sell_delivery_methods: [] },
  ],
};

/** Runs `check` against a toml declaring `field` = `base`, with `{base}/info` routed to `route`. */
export async function runInfo(
  check: Check,
  field: string,
  route: MockRoute,
  { base = "https://anchor.example/api", toml, timeoutMs = 10_000 }: { base?: unknown; toml?: StellarToml; timeoutMs?: number } = {},
) {
  const mock = mockFetch({ [`${String(base).replace(/\/+$/, "")}/info`]: route });
  const ctx: CheckContext = { domain: DOMAIN, fetch: mock.fetch, timeoutMs, toml: toml ?? { [field]: base } };
  return { result: await check.run(ctx), calls: mock.calls };
}
