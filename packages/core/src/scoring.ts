import type { CheckResult, CheckStatus } from "./types.js";

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const WEEK_MS = 7 * DAY_MS;

/**
 * The percentage (0-100) of non-skipped checks in a run that passed. Only
 * `pass` counts as passed; `warn` and `fail` count against the score.
 * Returns null when nothing ran, since there is nothing to score.
 */
export function score(results: readonly Pick<CheckResult, "status">[]): number | null {
  const counted = results.filter((r) => r.status !== "skipped");
  if (counted.length === 0) return null;
  return (100 * counted.filter((r) => r.status === "pass").length) / counted.length;
}

/** One sep1.reachable outcome, at the time its run started. */
export interface ReachabilitySample {
  at: Date;
  status: CheckStatus;
}

/**
 * The percentage (0-100) of sep1.reachable passes in the `windowMs` ending at
 * `now`, inclusive at both ends. Samples outside the window, and skipped ones,
 * are ignored. Returns null when the window holds no samples.
 */
export function uptime(samples: readonly ReachabilitySample[], now: Date, windowMs: number): number | null {
  const end = now.getTime();
  const start = end - windowMs;
  const inWindow = samples.filter((s) => {
    const at = s.at.getTime();
    return at >= start && at <= end && s.status !== "skipped";
  });
  if (inWindow.length === 0) return null;
  return (100 * inWindow.filter((s) => s.status === "pass").length) / inWindow.length;
}

export interface Uptime {
  uptime24h: number | null;
  uptime7d: number | null;
}

/** Uptime over the last 24 hours and 7 days. */
export function uptimeWindows(samples: readonly ReachabilitySample[], now: Date): Uptime {
  return { uptime24h: uptime(samples, now, DAY_MS), uptime7d: uptime(samples, now, WEEK_MS) };
}
