import { describe, expect, it } from "vitest";
import {
  anchorHealth,
  checkInfo,
  declaredEndpoints,
  formatLatency,
  formatPercent,
  formatRelative,
  formatTimestamp,
  parseAsset,
  readableReason,
  supportedAssets,
} from "@/lib/format";
import { NOW, minutesAgo } from "../helpers/fixtures";

const ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

describe("anchorHealth", () => {
  it.each([
    [{ reachable: null, score: null }, "unknown"],
    [{ reachable: false, score: 0 }, "down"],
    [{ reachable: true, score: 100 }, "healthy"],
    [{ reachable: true, score: 87.5 }, "degraded"],
    [{ reachable: true, score: null }, "degraded"],
  ] as const)("%o is %s", (anchor, expected) => {
    expect(anchorHealth(anchor)).toBe(expected);
  });
});

describe("formatting", () => {
  it("formats percentages", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(100)).toBe("100%");
    expect(formatPercent(99.4)).toBe("99.4%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("formats latency", () => {
    expect(formatLatency(undefined)).toBe("—");
    expect(formatLatency(142)).toBe("142 ms");
    expect(formatLatency(1311)).toBe("1.31 s");
  });

  it.each([
    [null, "Never"],
    [minutesAgo(0.5), "just now"],
    [minutesAgo(5), "5 min ago"],
    [minutesAgo(60 * 3), "3 h ago"],
    [minutesAgo(60 * 47), "47 h ago"],
    [minutesAgo(60 * 24 * 3), "3 d ago"],
  ])("formats %s relative to now as %s", (iso, expected) => {
    expect(formatRelative(iso, NOW)).toBe(expected);
  });

  it("formats an absolute UTC timestamp", () => {
    expect(formatTimestamp("2026-10-02T09:15:02.123Z")).toBe("2026-10-02 09:15:02 UTC");
  });
});

describe("checkInfo", () => {
  it("names known checks", () => {
    expect(checkInfo("sep24.info")).toEqual({ title: "Interactive transfer /info", spec: "SEP-24" });
  });

  it("falls back to the ID, and still finds the SEP when it can", () => {
    expect(checkInfo("sep31.info")).toEqual({ title: "sep31.info", spec: "SEP-31" });
    expect(checkInfo("custom")).toEqual({ title: "custom", spec: "" });
  });
});

describe("assets", () => {
  it.each([
    ["native", { code: "XLM", note: "native" }],
    ["stellar:native", { code: "XLM", note: "native" }],
    [`stellar:USDC:${ISSUER}`, { code: "USDC", note: "GBBD…FLA5" }],
    ["iso4217:BRL", { code: "BRL", note: "fiat" }],
    ["SRT", { code: "SRT" }],
  ])("parses %s", (id, expected) => {
    expect(parseAsset(id)).toEqual({ ...expected, id });
  });

  it("groups SEP-6/24 deposit and withdraw assets", () => {
    expect(supportedAssets({ deposit: ["USDC"], withdraw: [] })).toEqual([
      { label: "Deposit", assets: [{ code: "USDC", id: "USDC" }] },
      { label: "Withdraw", assets: [] },
    ]);
  });

  it("lists SEP-38 assets", () => {
    expect(supportedAssets({ assets: ["iso4217:USD"] })).toEqual([
      { label: "Assets", assets: [{ code: "USD", note: "fiat", id: "iso4217:USD" }] },
    ]);
  });

  it.each([null, undefined, "x", { deposit: "USDC" }, { assets: [1, 2] }, { endpoints: {} }])(
    "finds nothing in %o",
    (value) => {
      expect(supportedAssets(value)).toEqual([]);
    },
  );
});

describe("readableReason", () => {
  it("prefers the check's own error", () => {
    expect(readableReason({ status: "fail", error: "Expected HTTP 200, got 404" })).toBe("Expected HTTP 200, got 404");
  });

  it("explains which prerequisites blocked a skipped check", () => {
    expect(readableReason({ status: "skipped", detail: { blockedBy: ["sep1.parse", "custom.dep"] } })).toBe(
      "Not run because Valid TOML and custom.dep did not pass.",
    );
  });

  it.each([
    [{ status: "pass" as const }],
    [{ status: "pass" as const, detail: { blockedBy: ["sep1.parse"] } }],
    [{ status: "skipped" as const, detail: null }],
    [{ status: "skipped" as const, detail: { blockedBy: [] } }],
    [{ status: "skipped" as const, detail: { blockedBy: "sep1.parse" } }],
  ])("has nothing to say for %o", (check) => {
    expect(readableReason(check)).toBeUndefined();
  });
});

describe("declaredEndpoints", () => {
  it("lists string endpoints", () => {
    expect(declaredEndpoints({ endpoints: { WEB_AUTH_ENDPOINT: "https://a/auth", BAD: 1 } })).toEqual([
      ["WEB_AUTH_ENDPOINT", "https://a/auth"],
    ]);
  });

  it.each([null, "x", {}, { endpoints: null }])("finds nothing in %o", (value) => {
    expect(declaredEndpoints(value)).toEqual([]);
  });
});
