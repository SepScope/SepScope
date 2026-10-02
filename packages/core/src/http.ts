import type { CheckContext } from "./types.js";
import { USER_AGENT } from "./version.js";

export const DEFAULT_TIMEOUT_MS = 10_000;

export class TimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

/** GET with SEPscope's User-Agent and a hard timeout. */
export async function httpGet(
  ctx: CheckContext,
  url: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const signal = AbortSignal.timeout(ctx.timeoutMs);
  try {
    return await ctx.fetch(url, {
      method: "GET",
      headers: { ...headers, "User-Agent": USER_AGENT },
      redirect: "follow",
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw new TimeoutError(url, ctx.timeoutMs);
    throw err;
  }
}

export type HttpResult =
  | { ok: true; url: string; status: number; headers: Headers; body: string; latencyMs: number }
  | { ok: false; error: string; latencyMs: number };

/**
 * Waits for ctx.throttle, then GETs `url` and reads the body. Latency covers
 * only the request itself, not time spent queued behind the throttle. Never
 * throws: failures come back as `{ ok: false }` with a readable error.
 */
export async function fetchText(
  ctx: CheckContext,
  url: string,
  headers: Record<string, string> = {},
): Promise<HttpResult> {
  await ctx.throttle?.(url);
  const started = performance.now();
  const latencyMs = () => Math.round(performance.now() - started);
  try {
    const res = await httpGet(ctx, url, headers);
    const body = await res.text();
    // Redirects are followed, so report where we ended up, not where we started.
    return { ok: true, url: res.url || url, status: res.status, headers: res.headers, body, latencyMs: latencyMs() };
  } catch (err) {
    return { ok: false, error: errorMessage(err), latencyMs: latencyMs() };
  }
}

/** fetch reports network failures as a bare "fetch failed"; include the underlying cause. */
export function errorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause as { code?: unknown; message?: unknown } | undefined;
  const detail = [cause?.code, cause?.message].filter((part) => typeof part === "string" && part !== "");
  return detail.length > 0 ? `${err.message} (${[...new Set(detail)].join(": ")})` : err.message;
}
