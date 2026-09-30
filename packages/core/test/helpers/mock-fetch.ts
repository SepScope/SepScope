/**
 * Mocked HTTP for check tests. Map each URL to a canned response, or to
 * "hang" to simulate a server that never answers (for timeout tests).
 * A route may also be a function of the requested URL, for responses that
 * depend on query parameters. Routes match the full URL first, then the URL
 * without its query string. Unmapped URLs reject like a DNS failure. Every
 * call is recorded.
 */
export interface MockResponse {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  /** Final URL after redirects; defaults to the requested URL. */
  url?: string;
}

export type MockRoute = MockResponse | "hang" | ((url: URL) => MockResponse | "hang");

export interface MockFetch {
  fetch: typeof globalThis.fetch;
  calls: { url: string; init?: RequestInit }[];
}

export function mockFetch(routes: Record<string, MockRoute>): MockFetch {
  const calls: MockFetch["calls"] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    calls.push({ url, init });
    const parsed = new URL(url);
    let route = routes[url] ?? routes[`${parsed.origin}${parsed.pathname}`];
    if (typeof route === "function") route = route(parsed);
    if (route === undefined) throw new TypeError(`fetch failed: getaddrinfo ENOTFOUND ${parsed.host}`);
    if (route === "hang") {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    }
    const res = new Response(route.body ?? "", { status: route.status ?? 200, headers: route.headers });
    Object.defineProperty(res, "url", { value: route.url ?? url });
    return res;
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

export const CORS = { "Access-Control-Allow-Origin": "*" };

export const VALID_TOML = `
NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"
SIGNING_KEY = "GCHLHDBOKG2JWMJQBTLSL5XG6NO7ESXI2TAQKZXCXWXB5WI2X6W233PR"
WEB_AUTH_ENDPOINT = "https://anchor.example/auth"
TRANSFER_SERVER = "https://anchor.example/sep6"
TRANSFER_SERVER_SEP0024 = "https://anchor.example/sep24"
ANCHOR_QUOTE_SERVER = "https://anchor.example/sep38"

[[CURRENCIES]]
code = "USDC"
`;
