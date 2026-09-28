import { Keypair, Networks, Transaction, WebAuth } from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sep10Challenge } from "../../src/checks/sep10.js";
import { runChecks } from "../../src/runner.js";
import type { CheckContext, StellarToml } from "../../src/types.js";
import { USER_AGENT } from "../../src/version.js";
import { CORS, mockFetch, type MockResponse, type MockRoute } from "../helpers/mock-fetch.js";

const DOMAIN = "anchor.example";
const AUTH_URL = "https://anchor.example/auth";
const server = Keypair.random();

const baseToml: StellarToml = {
  NETWORK_PASSPHRASE: Networks.TESTNET,
  SIGNING_KEY: server.publicKey(),
  WEB_AUTH_ENDPOINT: AUTH_URL,
};

interface ChallengeOptions {
  signer?: Keypair;
  network?: string;
  homeDomain?: string;
  account?: string;
  timeout?: number;
  responsePassphrase?: string | null;
}

/** An anchor that answers with a challenge for whatever account was requested. */
function challengeRoute(opts: ChallengeOptions = {}) {
  return (url: URL): MockResponse => {
    const network = opts.network ?? Networks.TESTNET;
    const transaction = WebAuth.buildChallengeTx(
      opts.signer ?? server,
      opts.account ?? url.searchParams.get("account")!,
      opts.homeDomain ?? url.searchParams.get("home_domain")!,
      opts.timeout ?? 300,
      network,
      url.host,
    );
    const passphrase = opts.responsePassphrase === undefined ? network : opts.responsePassphrase;
    return { body: JSON.stringify(passphrase === null ? { transaction } : { transaction, network_passphrase: passphrase }) };
  };
}

function context(route: MockRoute, toml: StellarToml = baseToml, timeoutMs = 10_000) {
  const mock = mockFetch({ [AUTH_URL]: route });
  const ctx: CheckContext = { domain: DOMAIN, fetch: mock.fetch, timeoutMs, toml };
  return { ctx, calls: mock.calls };
}

async function run(route: MockRoute, toml?: StellarToml, timeoutMs?: number) {
  const { ctx, calls } = context(route, toml, timeoutMs);
  return { result: await sep10Challenge.run(ctx), calls };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("sep10.challenge", () => {
  it("passes on a valid challenge and requests it for a throwaway account", async () => {
    const { result, calls } = await run(challengeRoute());
    expect(result.status).toBe("pass");
    expect(result.latencyMs).toBeTypeOf("number");

    const requested = new URL(calls[0]!.url);
    const account = requested.searchParams.get("account")!;
    expect(account).toMatch(/^G[A-Z2-7]{55}$/);
    expect(account).not.toBe(server.publicKey());
    expect(requested.searchParams.get("home_domain")).toBe(DOMAIN);
    expect(new Headers(calls[0]!.init?.headers).get("user-agent")).toBe(USER_AGENT);
    expect(result.detail).toEqual({ endpoint: AUTH_URL, account });
  });

  it("uses a fresh account on every run", async () => {
    const a = await run(challengeRoute());
    const b = await run(challengeRoute());
    expect(a.calls[0]!.url).not.toBe(b.calls[0]!.url);
  });

  it("passes when the response omits network_passphrase", async () => {
    expect((await run(challengeRoute({ responsePassphrase: null }))).result.status).toBe("pass");
  });

  it("is skipped when WEB_AUTH_ENDPOINT is not declared", async () => {
    const { WEB_AUTH_ENDPOINT: _, ...toml } = baseToml;
    const { result, calls } = await run(challengeRoute(), toml);
    expect(result).toMatchObject({ status: "skipped", error: "WEB_AUTH_ENDPOINT is not declared" });
    expect(calls).toHaveLength(0);
  });

  it("fails when the challenge is signed by the wrong key", async () => {
    const { result } = await run(challengeRoute({ signer: Keypair.random() }));
    expect(result.status).toBe("fail");
    expect(result.error).toMatch(/source account is not equal to the server's account|not signed by server/);
  });

  it("fails when the challenge has the server as source but a signature from another key", async () => {
    const route = (url: URL): MockResponse => {
      const xdr = WebAuth.buildChallengeTx(server, url.searchParams.get("account")!, DOMAIN, 300, Networks.TESTNET, url.host);
      // Keep the server as source account, but swap its signature for an impostor's.
      const parsed = new Transaction(xdr, Networks.TESTNET);
      parsed.signatures.length = 0;
      parsed.sign(Keypair.random());
      return { body: JSON.stringify({ transaction: parsed.toXDR() }) };
    };
    const { result } = await run(route);
    expect(result).toMatchObject({ status: "fail", error: `Transaction not signed by server: '${server.publicKey()}'` });
  });

  it("fails when the challenge was built for a different network", async () => {
    const { result } = await run(challengeRoute({ network: Networks.PUBLIC, responsePassphrase: null }));
    expect(result).toMatchObject({ status: "fail", error: `Transaction not signed by server: '${server.publicKey()}'` });
  });

  it("fails when the response network_passphrase disagrees with the toml", async () => {
    const { result } = await run(challengeRoute({ network: Networks.PUBLIC }));
    expect(result.status).toBe("fail");
    expect(result.error).toMatch(/does not match stellar.toml NETWORK_PASSPHRASE/);
  });

  it("fails when the home domain is wrong", async () => {
    const { result } = await run(challengeRoute({ homeDomain: "other.example" }));
    expect(result.status).toBe("fail");
    expect(result.error).toMatch(/does not match the expected home domain/);
  });

  it("fails when the challenge has expired", async () => {
    // Answer for the requested account, but with time bounds an hour in the past.
    const expired = (url: URL) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() - 60 * 60 * 1000);
      const res = challengeRoute()(url);
      vi.useRealTimers();
      return res;
    };
    const { result } = await run(expired);
    expect(result).toMatchObject({ status: "fail", error: "The transaction has expired" });
  });

  it("fails when the challenge is for a different account", async () => {
    const other = Keypair.random().publicKey();
    const { result } = await run(challengeRoute({ account: other }));
    expect(result.status).toBe("fail");
    expect(result.error).toMatch(new RegExp(`^Challenge is for account ${other}`));
  });

  it.each<[string, MockResponse, RegExp]>([
    ["a non-200 status", { status: 400, body: "{}" }, /^Expected HTTP 200, got 400$/],
    ["invalid JSON", { body: "<html>" }, /^Response is not valid JSON$/],
    ["no transaction", { body: JSON.stringify({ error: "nope" }) }, /no "transaction" string/],
    ["malformed XDR", { body: JSON.stringify({ transaction: "AAAA-not-xdr" }) }, /unable to deserialize/],
  ])("fails on %s", async (_, response, error) => {
    const { result } = await run(response);
    expect(result.status).toBe("fail");
    expect(result.error).toMatch(error);
  });

  it("fails on a timeout", async () => {
    const { result } = await run("hang", baseToml, 20);
    expect(result.status).toBe("fail");
    expect(result.error).toMatch(/timed out after 20ms$/);
  });

  it("fails on a network error", async () => {
    const mock = mockFetch({});
    const result = await sep10Challenge.run({ domain: DOMAIN, fetch: mock.fetch, timeoutMs: 1000, toml: baseToml });
    expect(result.status).toBe("fail");
    expect(result.error).toMatch(/ENOTFOUND/);
  });

  it.each<[string, StellarToml, RegExp]>([
    ["an unparseable endpoint", { ...baseToml, WEB_AUTH_ENDPOINT: "not a url" }, /not a valid URL/],
    ["an HTTP endpoint", { ...baseToml, WEB_AUTH_ENDPOINT: "http://anchor.example/auth" }, /not HTTPS/],
    ["a missing SIGNING_KEY", { ...baseToml, SIGNING_KEY: undefined }, /SIGNING_KEY is missing or not a valid/],
    ["an invalid SIGNING_KEY", { ...baseToml, SIGNING_KEY: "GABC" }, /SIGNING_KEY is missing or not a valid/],
    ["a missing NETWORK_PASSPHRASE", { ...baseToml, NETWORK_PASSPHRASE: "" }, /NETWORK_PASSPHRASE is missing/],
  ])("fails without a request on %s", async (_, toml, error) => {
    const { result, calls } = await run(challengeRoute(), toml);
    expect(result.status).toBe("fail");
    expect(result.error).toMatch(error);
    expect(calls).toHaveLength(0);
  });

  it("throws if run without a parsed toml", async () => {
    const { ctx } = context(challengeRoute());
    delete ctx.toml;
    await expect(sep10Challenge.run(ctx)).rejects.toThrow("stellar.toml was not parsed");
  });
});

describe("sep10.challenge in the full run", () => {
  const TOML_URL = "https://anchor.example/.well-known/stellar.toml";
  const tomlBody = `NETWORK_PASSPHRASE = "${Networks.TESTNET}"\nSIGNING_KEY = "${server.publicKey()}"\nWEB_AUTH_ENDPOINT = "${AUTH_URL}"\n`;

  it("discovers the endpoint from the toml and passes", async () => {
    const mock = mockFetch({ [TOML_URL]: { body: tomlBody, headers: CORS }, [AUTH_URL]: challengeRoute() });
    const { results } = await runChecks(DOMAIN, { fetch: mock.fetch });
    expect(results.find((r) => r.checkId === "sep10.challenge")?.status).toBe("pass");
  });

  it("is skipped when the toml does not parse", async () => {
    const mock = mockFetch({ [TOML_URL]: { body: "= nope", headers: CORS } });
    const { results } = await runChecks(DOMAIN, { fetch: mock.fetch });
    expect(results.find((r) => r.checkId === "sep10.challenge")).toMatchObject({
      status: "skipped",
      detail: { blockedBy: ["sep1.parse"] },
    });
  });
});
