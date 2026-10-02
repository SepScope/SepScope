import { vi } from "vitest";
import type { AnchorDetail, AnchorSummary } from "@/lib/api";

export const NOW = Date.parse("2026-10-02T12:00:00Z");
export const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

export function summary(overrides: Partial<AnchorSummary> = {}): AnchorSummary {
  return {
    domain: "testanchor.stellar.org",
    network: "testnet",
    name: "Stellar Test Anchor",
    reachable: true,
    score: 100,
    uptime24h: 100,
    uptime7d: 99.4,
    lastCheckedAt: minutesAgo(5),
    ...overrides,
  };
}

export function detail(overrides: Partial<AnchorDetail> = {}): AnchorDetail {
  return {
    ...summary(),
    checks: [
      { checkId: "sep1.reachable", status: "pass", latencyMs: 142 },
      { checkId: "sep1.cors", status: "fail", latencyMs: 142, error: "Missing Access-Control-Allow-Origin header" },
      { checkId: "sep6.info", status: "skipped", error: "TRANSFER_SERVER is not declared" },
      {
        checkId: "sep24.info",
        status: "pass",
        latencyMs: 1311,
        detail: { deposit: ["USDC", "native"], withdraw: ["USDC"] },
      },
    ],
    ...overrides,
  };
}

type Route = { status?: number; body?: unknown; raw?: string } | "network-error";

/** Stubs global fetch with canned responses by URL; unmapped URLs fail like a refused connection. */
export function mockFetch(routes: Record<string, Route>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    calls.push({ url: input, init });
    const route = routes[input];
    if (route === undefined || route === "network-error") throw new TypeError("fetch failed");
    return new Response(route.raw ?? JSON.stringify(route.body ?? null), { status: route.status ?? 200 });
  });
  return calls;
}

/** jsdom has no matchMedia; this one reports `dark` and lets tests flip it. */
export function mockMatchMedia(dark: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    get matches() {
      return dark;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal("matchMedia", () => media);
  return {
    setDark(value: boolean) {
      dark = value;
      listeners.forEach((fn) => fn());
    },
    listenerCount: () => listeners.size,
  };
}
