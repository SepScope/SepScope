import { runChecks, type RunOptions } from "@sepscope/core";
import { checkResults, checkRuns, type Database } from "@sepscope/db";
import { eq } from "drizzle-orm";
import { forEachLimit } from "./pool.js";
import type { Anchor } from "./registry.js";

export interface Logger {
  info(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface RunDeps {
  logger: Logger;
  /** Shared across all anchors so the per-host limit holds globally. */
  throttle: (url: string) => Promise<void>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  runChecks?: (domain: string, options: RunOptions) => ReturnType<typeof runChecks>;
  now?: () => Date;
}

/**
 * Records one check_run for `anchor`. runChecks isolates each check, so a
 * failing check is stored as `fail` and the rest still run. If the run itself
 * throws, the check_run is still closed and the error rethrown.
 */
export async function runAnchor(db: Database, anchor: Anchor, deps: RunDeps): Promise<number> {
  const now = deps.now ?? (() => new Date());
  const [run] = await db.insert(checkRuns).values({ anchorId: anchor.id, startedAt: now() }).returning({ id: checkRuns.id });
  const runId = run!.id;
  try {
    const { results } = await (deps.runChecks ?? runChecks)(anchor.domain, {
      fetch: deps.fetch,
      throttle: deps.throttle,
      timeoutMs: deps.timeoutMs,
    });
    await db.transaction(async (tx) => {
      if (results.length > 0) {
        await tx.insert(checkResults).values(
          results.map((r) => ({
            runId,
            checkId: r.checkId,
            status: r.status,
            latencyMs: r.latencyMs ?? null,
            detail: r.detail ?? null,
            error: r.error ?? null,
          })),
        );
      }
      await tx.update(checkRuns).set({ finishedAt: now() }).where(eq(checkRuns.id, runId));
    });
    const failed = results.filter((r) => r.status === "fail").map((r) => r.checkId);
    deps.logger.info({ domain: anchor.domain, runId, checks: results.length, failed }, "anchor checked");
    return runId;
  } catch (err) {
    await db.update(checkRuns).set({ finishedAt: now() }).where(eq(checkRuns.id, runId));
    throw err;
  }
}

export interface CycleOptions extends RunDeps {
  concurrency: number;
  /** Once aborted (on shutdown), anchors not yet started are skipped; in-flight ones finish. */
  signal?: AbortSignal;
}

/** Checks every anchor, `concurrency` at a time. One anchor's failure never stops the others. */
export async function runCycle(db: Database, anchors: readonly Anchor[], options: CycleOptions): Promise<void> {
  const started = Date.now();
  let failedAnchors = 0;
  let skippedAnchors = 0;
  await forEachLimit(anchors, options.concurrency, async (anchor) => {
    if (options.signal?.aborted) {
      skippedAnchors++;
      return;
    }
    try {
      await runAnchor(db, anchor, options);
    } catch (err) {
      failedAnchors++;
      options.logger.error({ domain: anchor.domain, err }, "anchor run failed");
    }
  });
  options.logger.info(
    { anchors: anchors.length, failedAnchors, skippedAnchors, durationMs: Date.now() - started },
    skippedAnchors > 0 ? "cycle cancelled" : "cycle finished",
  );
}
