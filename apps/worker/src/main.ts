import { configureNetwork } from "@sepscope/core";
import { createDb, type DbConnection } from "@sepscope/db";
import { sql } from "drizzle-orm";
import { pino } from "pino";
import { loadConfig } from "./config.js";
import { isStale, startHealthServer } from "./health.js";
import { loadRegistry, syncAnchors } from "./registry.js";
import { runCycle, type Logger } from "./run.js";
import { startScheduler, type Timers } from "./scheduler.js";
import { hostThrottle } from "./throttle.js";

export interface MainDeps {
  connect: (databaseUrl: string) => DbConnection;
  logger?: Logger;
  fetch?: typeof globalThis.fetch;
  timers?: Timers;
  now?: () => number;
}

export interface Worker {
  logger: Logger;
  /** Where GET /healthz is served. */
  healthUrl: string;
  shutdownTimeoutMs: number;
  /** Skips anchors not yet started, waits for in-flight ones, then closes everything. */
  stop(): Promise<void>;
}

/** Migrates, syncs anchors.json, serves /healthz, and checks every anchor on the configured interval. */
export async function main(env: Record<string, string | undefined>, deps: MainDeps = { connect: createDb }): Promise<Worker> {
  const config = loadConfig(env);
  configureNetwork();
  const logger = deps.logger ?? pino({ level: config.logLevel });
  const now = deps.now ?? Date.now;
  const conn = deps.connect(config.databaseUrl);
  try {
    await conn.migrate();
    const anchors = await syncAnchors(conn.db, await loadRegistry(config.anchorsFile));

    const startedAt = now();
    let lastCycleFinishedAt: number | null = null;
    const health = await startHealthServer(config.healthPort, config.healthHost, async () => {
      await conn.db.execute(sql`select 1`);
      const stale = isStale(lastCycleFinishedAt ?? startedAt, now(), config.checkIntervalMs);
      const body = {
        status: stale ? "stalled" : "ok",
        anchors: anchors.length,
        lastCycleFinishedAt: lastCycleFinishedAt === null ? null : new Date(lastCycleFinishedAt).toISOString(),
      };
      return { healthy: !stale, body };
    });
    logger.info(
      { anchors: anchors.length, intervalMs: config.checkIntervalMs, concurrency: config.concurrency, health: health.url },
      "worker started",
    );

    const throttle = hostThrottle(config.hostIntervalMs);
    const shutdown = new AbortController();
    const scheduler = startScheduler(
      config.checkIntervalMs,
      async () => {
        await runCycle(conn.db, anchors, {
          concurrency: config.concurrency,
          throttle,
          logger,
          fetch: deps.fetch,
          signal: shutdown.signal,
        });
        lastCycleFinishedAt = now();
      },
      (err) => logger.error({ err }, "cycle failed"),
      deps.timers,
    );
    return {
      logger,
      healthUrl: health.url,
      shutdownTimeoutMs: config.shutdownTimeoutMs,
      async stop() {
        shutdown.abort();
        await scheduler.stop();
        await health.close();
        await conn.close();
        logger.info({}, "worker stopped");
      },
    };
  } catch (err) {
    await conn.close();
    throw err;
  }
}
