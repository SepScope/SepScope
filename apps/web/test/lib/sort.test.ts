import { describe, expect, it } from "vitest";
import { sortAnchors } from "@/lib/sort";
import { minutesAgo, summary } from "../helpers/fixtures";

const anchors = [
  summary({ domain: "b.example", name: "beta", network: "pubnet", score: 50, uptime24h: 90, lastCheckedAt: minutesAgo(30) }),
  summary({ domain: "a.example", name: "Alpha", network: "testnet", score: null, uptime24h: null, lastCheckedAt: null }),
  summary({ domain: "c.example", name: "Gamma", network: "testnet", score: 100, uptime24h: 100, lastCheckedAt: minutesAgo(1) }),
  summary({ domain: "d.example", name: "Delta", network: "pubnet", score: 50, uptime24h: 99, lastCheckedAt: minutesAgo(10) }),
];
const names = (list: { name: string }[]) => list.map((a) => a.name);

describe("sortAnchors", () => {
  it("sorts names case-insensitively", () => {
    expect(names(sortAnchors(anchors, "name", "asc"))).toEqual(["Alpha", "beta", "Delta", "Gamma"]);
    expect(names(sortAnchors(anchors, "name", "desc"))).toEqual(["Gamma", "Delta", "beta", "Alpha"]);
  });

  it("puts missing values last in both directions", () => {
    expect(names(sortAnchors(anchors, "score", "desc"))).toEqual(["Gamma", "beta", "Delta", "Alpha"]);
    expect(names(sortAnchors(anchors, "score", "asc"))).toEqual(["beta", "Delta", "Gamma", "Alpha"]);
  });

  it("breaks ties by name", () => {
    expect(names(sortAnchors(anchors, "network", "asc"))).toEqual(["beta", "Delta", "Alpha", "Gamma"]);
  });

  it("sorts by time and uptime", () => {
    expect(names(sortAnchors(anchors, "lastCheckedAt", "desc"))).toEqual(["Gamma", "Delta", "beta", "Alpha"]);
    expect(names(sortAnchors(anchors, "uptime24h", "asc"))).toEqual(["beta", "Delta", "Gamma", "Alpha"]);
  });

  it("does not modify its input", () => {
    const copy = [...anchors];
    sortAnchors(anchors, "score", "asc");
    expect(anchors).toEqual(copy);
  });

  it("falls back to domain when names tie", () => {
    const twins = [summary({ domain: "z.example", name: "Same" }), summary({ domain: "y.example", name: "Same" })];
    expect(sortAnchors(twins, "name", "asc").map((a) => a.domain)).toEqual(["y.example", "z.example"]);
  });
});
