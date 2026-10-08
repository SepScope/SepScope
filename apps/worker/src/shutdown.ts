export interface ShutdownLogger {
  info(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

/** The parts of `process` this needs, so tests can pass a fake. */
export interface ShutdownProcess {
  once(signal: NodeJS.Signals, listener: () => void): unknown;
  exit(code: number): void;
}

export interface ShutdownOptions {
  logger: ShutdownLogger;
  timeoutMs: number;
  proc?: ShutdownProcess;
  signals?: NodeJS.Signals[];
}

/**
 * On the first SIGTERM or SIGINT, runs `stop` and exits 0, or exits 1 if it
 * fails or takes longer than `timeoutMs`. Handlers are registered with
 * `once`, so a second signal falls back to Node's default and kills the
 * process immediately.
 */
export function handleShutdown(stop: () => Promise<void>, options: ShutdownOptions): void {
  const { logger, timeoutMs, proc = process, signals = ["SIGTERM", "SIGINT"] } = options;
  let stopping = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal, timeoutMs }, "shutting down");
    const timer = setTimeout(() => {
      logger.error({ timeoutMs }, "shutdown timed out; exiting anyway");
      proc.exit(1);
    }, timeoutMs);
    timer.unref?.();
    stop().then(
      () => {
        clearTimeout(timer);
        logger.info({}, "shutdown complete");
        proc.exit(0);
      },
      (err: unknown) => {
        clearTimeout(timer);
        logger.error({ err }, "shutdown failed");
        proc.exit(1);
      },
    );
  };
  for (const signal of signals) proc.once(signal, () => shutdown(signal));
}
