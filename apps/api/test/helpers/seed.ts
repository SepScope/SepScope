import type { CheckStatus } from "@sepscope/core";
import { anchors, checkResults, checkRuns, type Database } from "@sepscope/db";

export const NOW = new Date("2026-10-02T12:00:00Z");
export const HOUR = 60 * 60 * 1000;
export const hoursAgo = (h: number) => new Date(NOW.getTime() - h * HOUR);

export async function addAnchor(db: Database, domain: string, network: "pubnet" | "testnet" = "testnet", name = domain) {
  const [row] = await db.insert(anchors).values({ domain, network, name }).returning();
  return row!;
}

export interface SeedResult {
  checkId: string;
  status: CheckStatus;
  latencyMs?: number;
  detail?: unknown;
  error?: string;
}

/** Adds a finished run (or an in-progress one, with `finished: false`) and its results. */
export async function addRun(
  db: Database,
  anchorId: number,
  startedAt: Date,
  results: SeedResult[],
  { finished = true } = {},
) {
  const [run] = await db
    .insert(checkRuns)
    .values({ anchorId, startedAt, finishedAt: finished ? new Date(startedAt.getTime() + 5000) : null })
    .returning();
  if (results.length > 0) {
    await db.insert(checkResults).values(
      results.map((r) => ({
        runId: run!.id,
        checkId: r.checkId,
        status: r.status,
        latencyMs: r.latencyMs ?? null,
        detail: r.detail ?? null,
        error: r.error ?? null,
      })),
    );
  }
  return run!;
}

export const reachable = (status: CheckStatus): SeedResult => ({ checkId: "sep1.reachable", status, latencyMs: 100 });
