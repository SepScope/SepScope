import { describe, expect, it } from "vitest";
import { forEachLimit } from "../src/pool.js";

describe("forEachLimit", () => {
  it("processes every item with at most `limit` in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const seen: number[] = [];
    await forEachLimit([1, 2, 3, 4, 5, 6, 7, 8, 9], 4, async (n) => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      seen.push(n);
      inFlight--;
    });
    expect(peak).toBe(4);
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("handles fewer items than the limit, and none at all", async () => {
    const seen: string[] = [];
    await forEachLimit(["a"], 4, async (s) => void seen.push(s));
    await forEachLimit([], 4, async () => void seen.push("never"));
    expect(seen).toEqual(["a"]);
  });
});
