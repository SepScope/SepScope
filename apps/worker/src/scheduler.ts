export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

const realTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
  now: () => Date.now(),
};

export interface Scheduler {
  /** Stops scheduling and waits for the cycle in progress, if any. */
  stop(): Promise<void>;
}

/**
 * Runs `task` now and then every `intervalMs`, measured start to start.
 * Cycles never overlap: one that overruns the interval is followed
 * immediately by the next. A rejected task is reported and the schedule
 * continues.
 */
export function startScheduler(
  intervalMs: number,
  task: () => Promise<void>,
  onError: (err: unknown) => void,
  timers: Timers = realTimers,
): Scheduler {
  let stopped = false;
  let handle: unknown;
  let current: Promise<void> = Promise.resolve();

  const tick = () => {
    const started = timers.now();
    current = task()
      .catch(onError)
      .then(() => {
        if (stopped) return;
        const wait = started + intervalMs - timers.now();
        // An overrun cycle is followed at once; setTimeout(0) would still add a tick of delay.
        if (wait > 0) handle = timers.setTimeout(tick, wait);
        else tick();
      });
  };
  tick();

  return {
    async stop() {
      stopped = true;
      timers.clearTimeout(handle);
      await current;
    },
  };
}
