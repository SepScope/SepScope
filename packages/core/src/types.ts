export type CheckStatus = "pass" | "warn" | "fail" | "skipped";

export interface CheckResult {
  checkId: string;
  status: CheckStatus;
  latencyMs?: number;
  detail?: unknown;
  error?: string;
}

/** A parsed stellar.toml. Later checks read their endpoints from it. */
export type StellarToml = Record<string, unknown>;

export interface TomlResponse {
  url: string;
  status: number;
  headers: Headers;
  body: string;
  latencyMs: number;
}

export interface CheckContext {
  domain: string;
  /** Injectable so every check can be unit-tested with mocked HTTP. */
  fetch: typeof globalThis.fetch;
  timeoutMs: number;
  /**
   * Awaited before every request, outside its timeout and latency. The worker
   * uses it to keep to one request per second per host.
   */
  throttle?: (url: string) => Promise<void>;
  /** Set by sep1.reachable. */
  tomlResponse?: TomlResponse;
  /** Set by sep1.parse; later checks discover their endpoints here. */
  toml?: StellarToml;
}

export interface Check {
  id: string;
  dependsOn?: string[];
  run(ctx: CheckContext): Promise<CheckResult>;
}
