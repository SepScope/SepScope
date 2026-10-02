import { describe, expect, it, vi } from "vitest";
import { hostThrottle, realClock, type Clock } from "../src/throttle.js";

/**
 * Virtual time: sleepers wake in order of their deadline, and only when the
 * test calls flush(). `skewNextSleep` makes the next sleep end that many ms
 * late (or early, if negative), the way real timers sometimes do.
 */
function fakeClock() {
  let t = 1_000_000;
  let skew = 0;
  const sleeps: number[] = [];
  const timers: { at: number; wake: () => void }[] = [];
  const clock: Clock = {
    now: () => t,
    sleep: (ms) => {
      sleeps.push(ms);
      const at = t + ms + skew;
      skew = 0;
      return new Promise((wake) => timers.push({ at, wake: () => wake() }));
    },
  };
  const settle = () => new Promise((r) => setImmediate(r));
  return {
    clock,
    sleeps,
    advance: (ms: number) => (t += ms),
    skewNextSleep: (ms: number) => (skew = ms),
    async flush() {
      await settle();
      while (timers.length > 0) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers.shift()!;
        t = Math.max(t, next.at);
        next.wake();
        await settle();
      }
    },
  };
}

describe("hostThrottle", () => {
  it("lets the first request to a host through immediately", async () => {
    const { clock, sleeps } = fakeClock();
    await hostThrottle(1000, clock)("https://a.example/x");
    expect(sleeps).toEqual([]);
  });

  it("spaces concurrent requests to the same host a full interval apart", async () => {
    const { clock, flush } = fakeClock();
    const throttle = hostThrottle(1000, clock);
    const t0 = clock.now();
    const released: number[] = [];
    const all = Promise.all(["/1", "/2", "/3"].map((p) => throttle(`https://a.example${p}`).then(() => released.push(clock.now() - t0))));
    await flush();
    await all;
    expect(released).toEqual([0, 1000, 2000]);
  });

  it("never releases early when the timer wakes up too soon", async () => {
    const { clock, sleeps, flush, skewNextSleep } = fakeClock();
    const throttle = hostThrottle(1000, clock);
    const t0 = clock.now();
    await throttle("https://a.example/");
    skewNextSleep(-3);
    const second = throttle("https://a.example/");
    await flush();
    await second;
    expect(clock.now() - t0).toBe(1000);
    expect(sleeps).toEqual([1000, 3]);
  });

  it("treats each host separately, including different ports", async () => {
    const { clock, sleeps, flush } = fakeClock();
    const throttle = hostThrottle(1000, clock);
    await throttle("https://a.example/");
    await throttle("https://b.example/");
    await throttle("https://a.example:8443/");
    expect(sleeps).toEqual([]);
    const again = throttle("https://a.example/again");
    await flush();
    await again;
    expect(sleeps).toEqual([1000]);
  });

  it("only waits for what is left of the interval", async () => {
    const { clock, sleeps, advance, flush } = fakeClock();
    const throttle = hostThrottle(1000, clock);
    await throttle("https://a.example/");
    advance(400);
    const second = throttle("https://a.example/");
    await flush();
    await second;
    advance(5000);
    await throttle("https://a.example/");
    expect(sleeps).toEqual([600]);
  });

  it("measures the next gap from when the previous caller was actually released", async () => {
    const { clock, flush, skewNextSleep } = fakeClock();
    const throttle = hostThrottle(1000, clock);
    const t0 = clock.now();
    const released: number[] = [];
    const call = (p: string) => throttle(`https://a.example${p}`).then(() => released.push(clock.now() - t0));
    const first = call("/1");
    // The second caller's timer fires 300ms late; the third must still wait a full second after it.
    skewNextSleep(300);
    const rest = [call("/2"), call("/3")];
    await flush();
    await Promise.all([first, ...rest]);
    expect(released).toEqual([0, 1300, 2300]);
  });

  it("sleeps for real with the default clock", async () => {
    vi.useFakeTimers();
    try {
      const throttle = hostThrottle(1000);
      await throttle("https://a.example/");
      let done = false;
      const second = throttle("https://a.example/").then(() => (done = true));
      await vi.advanceTimersByTimeAsync(999);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await second;
      expect(done).toBe(true);
      expect(realClock.now()).toBeCloseTo(performance.now(), -1);
    } finally {
      vi.useRealTimers();
    }
  });
});
