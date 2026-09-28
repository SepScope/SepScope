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

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
