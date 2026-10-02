export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  // Monotonic and sub-millisecond, unlike Date.now().
  now: () => performance.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Spaces requests to the same host at least `intervalMs` apart, across every
 * anchor and run sharing this throttle. Callers for a host queue in order, and
 * each waits until `intervalMs` after the previous one was actually released,
 * so a late release never shortens the next gap.
 */
export function hostThrottle(intervalMs: number, clock: Clock = realClock): (url: string) => Promise<void> {
  // Per host: resolves with the time the most recent caller was released.
  const lastRelease = new Map<string, Promise<number>>();
  return async (url) => {
    const host = new URL(url).host;
    const previous = lastRelease.get(host);
    let release!: (at: number) => void;
    lastRelease.set(host, new Promise((resolve) => (release = resolve)));

    if (previous) {
      const earliest = (await previous) + intervalMs;
      // Timers can fire a little early, so sleep until the time has really arrived.
      for (let wait = earliest - clock.now(); wait > 0; wait = earliest - clock.now()) await clock.sleep(wait);
    }
    release(clock.now());
  };
}
