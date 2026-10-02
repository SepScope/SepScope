import { vi, type Mock } from "vitest";
import type { Logger } from "../../src/run.js";

export const TOML = `
NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"
SIGNING_KEY = "GCHLHDBOKG2JWMJQBTLSL5XG6NO7ESXI2TAQKZXCXWXB5WI2X6W233PR"
`;

/** Serves a minimal stellar.toml for each domain; every other URL fails like DNS. */
export function anchorFetch(domains: string[]): typeof globalThis.fetch & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : input.toString();
    calls.push(url);
    const { host, pathname } = new URL(url);
    if (domains.includes(host) && pathname === "/.well-known/stellar.toml") {
      const res = new Response(TOML, { headers: { "Access-Control-Allow-Origin": "*" } });
      Object.defineProperty(res, "url", { value: url });
      return res;
    }
    throw new TypeError(`fetch failed: getaddrinfo ENOTFOUND ${host}`);
  }) as typeof globalThis.fetch & { calls: string[] };
  fn.calls = calls;
  return fn;
}

export function fakeLogger(): Logger & { info: Mock; error: Mock } {
  return { info: vi.fn(), error: vi.fn() };
}

/** Throttle that never waits, for tests that are not about rate limiting. */
export const noThrottle = async () => {};
