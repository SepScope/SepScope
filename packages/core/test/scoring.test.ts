import { describe, expect, it } from "vitest";
import { DAY_MS, HOUR_MS, WEEK_MS, score, uptime, uptimeWindows, type ReachabilitySample } from "../src/scoring.js";
import type { CheckStatus } from "../src/types.js";

const statuses = (...s: CheckStatus[]) => s.map((status) => ({ status }));

describe("score", () => {
  it("is 100 when every non-skipped check passed", () => {
    expect(score(statuses("pass", "pass", "skipped", "pass"))).toBe(100);
  });

  it("is the percentage of non-skipped checks that passed", () => {
    // 3 of the 4 non-skipped checks passed; the two skipped ones do not count.
    expect(score(statuses("pass", "fail", "skipped", "pass", "skipped", "pass"))).toBe(75);
    expect(score(statuses("pass", "fail", "fail"))).toBeCloseTo(33.333, 3);
  });

  it("counts warn against the score, like fail", () => {
    expect(score(statuses("pass", "warn"))).toBe(50);
  });

  it("is 0 when nothing passed", () => {
    expect(score(statuses("fail", "warn", "skipped"))).toBe(0);
  });

  it("is null when every check was skipped or there are none", () => {
    expect(score(statuses("skipped", "skipped"))).toBeNull();
    expect(score([])).toBeNull();
  });
});

describe("uptime", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  const ago = (ms: number, status: CheckStatus): ReachabilitySample => ({ at: new Date(now.getTime() - ms), status });

  it("is the percentage of passes within the window", () => {
    const samples = [ago(0, "pass"), ago(HOUR_MS, "fail"), ago(2 * HOUR_MS, "pass"), ago(3 * HOUR_MS, "pass")];
    expect(uptime(samples, now, DAY_MS)).toBe(75);
  });

  it("ignores samples outside the window, including future ones", () => {
    const samples = [ago(HOUR_MS, "pass"), ago(DAY_MS + 1, "fail"), ago(-1, "fail")];
    expect(uptime(samples, now, DAY_MS)).toBe(100);
  });

  it("includes samples exactly at either edge of the window", () => {
    expect(uptime([ago(0, "fail"), ago(DAY_MS, "pass")], now, DAY_MS)).toBe(50);
  });

  it("ignores skipped samples and counts warn as not passing", () => {
    expect(uptime([ago(0, "pass"), ago(1, "skipped"), ago(2, "warn")], now, DAY_MS)).toBe(50);
  });

  it("is null when the window holds no samples", () => {
    expect(uptime([], now, DAY_MS)).toBeNull();
    expect(uptime([ago(2 * DAY_MS, "pass"), ago(3, "skipped")], now, DAY_MS)).toBeNull();
  });

  it("does not depend on sample order", () => {
    const samples = [ago(5 * HOUR_MS, "fail"), ago(0, "pass"), ago(3 * DAY_MS, "pass"), ago(HOUR_MS, "pass")];
    expect(uptime(samples, now, WEEK_MS)).toBe(uptime([...samples].reverse(), now, WEEK_MS));
  });
});

describe("uptimeWindows", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  const ago = (ms: number, status: CheckStatus): ReachabilitySample => ({ at: new Date(now.getTime() - ms), status });

  it("reports 24-hour and 7-day uptime separately", () => {
    // Last 24h: 2 of 2 passed. Over 7 days: 2 of 4.
    const samples = [ago(HOUR_MS, "pass"), ago(12 * HOUR_MS, "pass"), ago(2 * DAY_MS, "fail"), ago(6 * DAY_MS, "fail")];
    expect(uptimeWindows(samples, now)).toEqual({ uptime24h: 100, uptime7d: 50 });
  });

  it("reports null for a window without data", () => {
    expect(uptimeWindows([ago(3 * DAY_MS, "pass")], now)).toEqual({ uptime24h: null, uptime7d: 100 });
    expect(uptimeWindows([ago(8 * DAY_MS, "pass")], now)).toEqual({ uptime24h: null, uptime7d: null });
  });
});

it("uses the expected window lengths", () => {
  expect([HOUR_MS, DAY_MS, WEEK_MS]).toEqual([3_600_000, 86_400_000, 604_800_000]);
});
