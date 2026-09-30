import { sep1Checks } from "./checks/sep1.js";
import { sep10Checks } from "./checks/sep10.js";
import { DEFAULT_TIMEOUT_MS, errorMessage } from "./http.js";
import type { Check, CheckContext, CheckResult, StellarToml } from "./types.js";

/** Every registered check, in run order. A check must come after its dependencies. */
export const allChecks: Check[] = [...sep1Checks, ...sep10Checks];

export interface RunOptions {
  checks?: Check[];
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export interface RunReport {
  results: CheckResult[];
  toml?: StellarToml;
}

const PASSING = new Set(["pass", "warn"]);

/**
 * Runs checks in order. A check whose dependencies did not pass is skipped,
 * and an exception inside one check is recorded as its failure without
 * aborting the rest of the run.
 */
export async function runChecks(domain: string, options: RunOptions = {}): Promise<RunReport> {
  const checks = options.checks ?? allChecks;
  const ctx: CheckContext = {
    domain,
    fetch: options.fetch ?? globalThis.fetch,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
  const statuses = new Map<string, string>();
  const results: CheckResult[] = [];

  for (const check of checks) {
    const blocked = (check.dependsOn ?? []).filter((dep) => !PASSING.has(statuses.get(dep) ?? ""));
    let result: CheckResult;
    if (blocked.length > 0) {
      result = { checkId: check.id, status: "skipped", detail: { blockedBy: blocked } };
    } else {
      try {
        result = await check.run(ctx);
      } catch (err) {
        result = { checkId: check.id, status: "fail", error: errorMessage(err) };
      }
    }
    statuses.set(check.id, result.status);
    results.push(result);
  }

  return { results, toml: ctx.toml };
}
