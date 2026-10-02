import { afterEach, describe, expect, it, vi } from "vitest";
import { startScheduler } from "../src/scheduler.js";

afterEach(() => {
  vi.useRealTimers();
});

const MIN = 60_000;

describe("startScheduler", () => {
  it("runs immediately and then every interval, start to start", async () => {
    vi.useFakeTimers();
    const starts: number[] = [];
    const t0 = Date.now();
    const task = async () => {
      starts.push(Date.now() - t0);
      await new Promise((r) => setTimeout(r, 2 * MIN)); // each cycle takes 2 minutes
    };
    const scheduler = startScheduler(15 * MIN, task, vi.fn());
    await vi.advanceTimersByTimeAsync(31 * MIN);
    expect(starts).toEqual([0, 15 * MIN, 30 * MIN]);
    const stopping = scheduler.stop();
    await vi.advanceTimersByTimeAsync(2 * MIN);
    await stopping;
  });

  it("starts the next cycle immediately when one overruns, never overlapping", async () => {
    vi.useFakeTimers();
    let running = 0;
    let overlapped = false;
    const starts: number[] = [];
    const t0 = Date.now();
    const task = async () => {
      if (running++ > 0) overlapped = true;
      starts.push(Date.now() - t0);
      await new Promise((r) => setTimeout(r, 20 * MIN));
      running--;
    };
    const scheduler = startScheduler(15 * MIN, task, vi.fn());
    await vi.advanceTimersByTimeAsync(45 * MIN);
    expect(starts).toEqual([0, 20 * MIN, 40 * MIN]);
    expect(overlapped).toBe(false);
    const stopping = scheduler.stop();
    await vi.advanceTimersByTimeAsync(20 * MIN);
    await stopping;
  });

  it("reports a failed cycle and keeps the schedule", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    let calls = 0;
    const task = async () => {
      if (++calls === 1) throw new Error("cycle broke");
    };
    const scheduler = startScheduler(15 * MIN, task, onError);
    await vi.advanceTimersByTimeAsync(15 * MIN);
    expect(onError).toHaveBeenCalledWith(new Error("cycle broke"));
    expect(calls).toBe(2);
    await scheduler.stop();
  });

  it("stop waits for the cycle in progress and schedules nothing after it", async () => {
    vi.useFakeTimers();
    let calls = 0;
    let finished = false;
    const task = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, MIN));
      finished = true;
    };
    const scheduler = startScheduler(15 * MIN, task, vi.fn());
    const stopping = scheduler.stop();
    await vi.advanceTimersByTimeAsync(MIN);
    await stopping;
    expect(finished).toBe(true);
    await vi.advanceTimersByTimeAsync(60 * MIN);
    expect(calls).toBe(1);
  });
});
