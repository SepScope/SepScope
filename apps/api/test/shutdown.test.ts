import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleShutdown, type ShutdownProcess } from "../src/shutdown.js";
const fakeLogger = () => ({ info: vi.fn(), error: vi.fn() });

function fakeProcess() {
  const emitter = new EventEmitter();
  const exit = vi.fn();
  const proc: ShutdownProcess = { once: (s, fn) => emitter.once(s, fn), exit };
  return { proc, exit, emit: (s: NodeJS.Signals) => emitter.emit(s) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("handleShutdown", () => {
  it.each(["SIGTERM", "SIGINT"] as const)("on %s, stops and exits 0", async (signal) => {
    const { proc, exit, emit } = fakeProcess();
    const logger = fakeLogger();
    const stop = vi.fn(async () => {});
    handleShutdown(stop, { logger, timeoutMs: 1000, proc });
    emit(signal);
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith({ signal, timeoutMs: 1000 }, "shutting down");
  });

  it("exits 1 when stop fails", async () => {
    const { proc, exit, emit } = fakeProcess();
    const logger = fakeLogger();
    handleShutdown(async () => Promise.reject(new Error("close failed")), { logger, timeoutMs: 1000, proc });
    emit("SIGTERM");
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(logger.error).toHaveBeenCalledWith({ err: new Error("close failed") }, "shutdown failed");
  });

  it("exits 1 when stop takes longer than the timeout", async () => {
    vi.useFakeTimers();
    const { proc, exit, emit } = fakeProcess();
    const logger = fakeLogger();
    handleShutdown(() => new Promise(() => {}), { logger, timeoutMs: 1000, proc });
    emit("SIGTERM");
    await vi.advanceTimersByTimeAsync(999);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledWith({ timeoutMs: 1000 }, "shutdown timed out; exiting anyway");
  });

  it("stops only once if both signals arrive", async () => {
    const { proc, exit, emit } = fakeProcess();
    const stop = vi.fn(async () => {});
    handleShutdown(stop, { logger: fakeLogger(), timeoutMs: 1000, proc });
    emit("SIGTERM");
    emit("SIGINT");
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("listens on the real process by default", () => {
    const once = vi.spyOn(process, "once").mockReturnValue(process);
    handleShutdown(async () => {}, { logger: fakeLogger(), timeoutMs: 1000 });
    expect(once.mock.calls.map((c) => c[0])).toEqual(["SIGTERM", "SIGINT"]);
    once.mockRestore();
  });
});
