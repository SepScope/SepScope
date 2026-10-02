export type Network = "pubnet" | "testnet";
export type CheckStatus = "pass" | "warn" | "fail" | "skipped";

/** GET /v1/anchors item. */
export interface AnchorSummary {
  domain: string;
  network: Network;
  name: string;
  reachable: boolean | null;
  score: number | null;
  uptime24h: number | null;
  uptime7d: number | null;
  lastCheckedAt: string | null;
}

export interface CheckResult {
  checkId: string;
  status: CheckStatus;
  latencyMs?: number;
  detail?: unknown;
  error?: string;
}

/** GET /v1/anchors/:domain. */
export interface AnchorDetail extends AnchorSummary {
  checks: CheckResult[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Server-side requests may need a different address than the browser (e.g. a
 * Docker service name), so API_URL takes precedence over NEXT_PUBLIC_API_URL.
 */
export function apiBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.API_URL || env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/+$/, "");
}

async function request<T>(path: string): Promise<T | null> {
  const url = `${apiBaseUrl()}${path}`;
  let res: Response;
  try {
    // Results change every few minutes; always show the latest.
    res = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  } catch (err) {
    throw new ApiError(`Could not reach the SEPscope API at ${apiBaseUrl()}: ${(err as Error).message}`);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(`The SEPscope API returned HTTP ${res.status} for ${path}`, res.status);
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(`The SEPscope API returned invalid JSON for ${path}`, res.status);
  }
}

export async function getAnchors(): Promise<AnchorSummary[]> {
  return (await request<AnchorSummary[]>("/v1/anchors")) ?? [];
}

/** Null when the API does not know the anchor. */
export function getAnchor(domain: string): Promise<AnchorDetail | null> {
  return request<AnchorDetail>(`/v1/anchors/${encodeURIComponent(domain)}`);
}
