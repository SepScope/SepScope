import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiBaseUrl, getAnchor, getAnchors } from "@/lib/api";
import { detail, mockFetch, summary } from "../helpers/fixtures";

const BASE = "http://localhost:8080";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("apiBaseUrl", () => {
  it("prefers API_URL, then NEXT_PUBLIC_API_URL, then localhost, without a trailing slash", () => {
    expect(apiBaseUrl({ API_URL: "http://api:8080/", NEXT_PUBLIC_API_URL: "https://x" })).toBe("http://api:8080");
    expect(apiBaseUrl({ API_URL: "", NEXT_PUBLIC_API_URL: "https://api.example//" })).toBe("https://api.example");
    expect(apiBaseUrl({})).toBe(BASE);
  });

  it("reads process.env by default", () => {
    vi.stubEnv("API_URL", "http://from-env:1");
    expect(apiBaseUrl()).toBe("http://from-env:1");
  });
});

describe("getAnchors", () => {
  it("returns the list, fetched fresh on every request", async () => {
    const calls = mockFetch({ [`${BASE}/v1/anchors`]: { body: [summary()] } });
    expect(await getAnchors()).toEqual([summary()]);
    expect(calls[0]!.init).toMatchObject({ cache: "no-store" });
  });

  it.each([
    ["the API is unreachable", "network-error" as const, /Could not reach the SEPscope API at http:\/\/localhost:8080: fetch failed/],
    ["the API errors", { status: 500, body: {} }, /returned HTTP 500 for \/v1\/anchors/],
    ["the body is not JSON", { raw: "<html>" }, /returned invalid JSON for \/v1\/anchors/],
  ])("throws a readable ApiError when %s", async (_, route, message) => {
    mockFetch({ [`${BASE}/v1/anchors`]: route });
    const err = await getAnchors().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as Error).message).toMatch(message);
  });

  it("keeps the HTTP status on the error", async () => {
    mockFetch({ [`${BASE}/v1/anchors`]: { status: 503 } });
    await expect(getAnchors()).rejects.toMatchObject({ status: 503 });
  });

  it("treats a 404 as no anchors", async () => {
    mockFetch({ [`${BASE}/v1/anchors`]: { status: 404 } });
    expect(await getAnchors()).toEqual([]);
  });
});

describe("getAnchor", () => {
  it("returns the anchor, with the domain encoded in the path", async () => {
    const calls = mockFetch({ [`${BASE}/v1/anchors/a.example`]: { body: detail() } });
    expect(await getAnchor("a.example")).toEqual(detail());
    mockFetch({});
    await getAnchor("a/b").catch(() => {});
    expect(calls[0]!.url).toBe(`${BASE}/v1/anchors/a.example`);
  });

  it("encodes characters that would change the path", async () => {
    const calls = mockFetch({ [`${BASE}/v1/anchors/a%2Fb`]: { status: 404 } });
    expect(await getAnchor("a/b")).toBeNull();
    expect(calls[0]!.url).toBe(`${BASE}/v1/anchors/a%2Fb`);
  });
});
