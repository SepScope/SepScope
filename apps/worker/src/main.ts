import { createDb, type DbConnection } from "@sepscope/db";
import { pino } from "pino";
import { loadConfig } from "./config.js";
import { loadRegistry, syncAnchors } from "./registry.js";
import { runCycle, type Logger } from "./run.js";
import { startScheduler, type Timers } from "./scheduler.js";
import { hostThrottle } from "./throttle.js";

export interface MainDeps {
  connect: (databaseUrl: string) => DbConnection;
  logger?: Logger;
  fetch?: typeof globalThis.fetch;
  timers?: Timers;
}

export interface Worker {
  stop(): Promise<void>;
}

/** Migrates, syncs anchors.json, and starts checking every anchor on the configured interval. */
export async function main(env: Record<string, string | undefined>, deps: MainDeps = { connect: createDb }): Promise<Worker> {
  const config = loadConfig(env);
  const logger = deps.logger ?? pino({ level: config.logLevel });
  const conn = deps.connect(config.databaseUrl);
  try {
    await conn.migrate();
    const anchors = await syncAnchors(conn.db, await loadRegistry(config.anchorsFile));
    logger.info(
      { anchors: anchors.length, intervalMs: config.checkIntervalMs, concurrency: config.concurrency },
      "worker started",
    );

    const throttle = hostThrottle(config.hostIntervalMs);
    const scheduler = startScheduler(
      config.checkIntervalMs,
      () => runCycle(conn.db, anchors, { concurrency: config.concurrency, throttle, logger, fetch: deps.fetch }),
      (err) => logger.error({ err }, "cycle failed"),
      deps.timers,
    );
    return {
      async stop() {
        await scheduler.stop();
        await conn.close();
        logger.info({}, "worker stopped");
      },
    };
  } catch (err) {
    await conn.close();
    throw err;
  }
}
