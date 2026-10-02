import { allChecks } from "@sepscope/core";
import { z } from "zod";

const checkIds = allChecks.map((c) => c.id) as [string, ...string[]];

export const network = z.enum(["pubnet", "testnet"]);
export const status = z.enum(["pass", "warn", "fail", "skipped"]);
const percent = z.number().min(0).max(100).nullable();

export const anchorSummary = z
  .object({
    domain: z.string(),
    network,
    name: z.string(),
    reachable: z
      .boolean()
      .nullable()
      .describe("Whether stellar.toml was reachable (sep1.reachable passed) in the latest run; null before the first run."),
    score: percent.describe("Percentage of non-skipped checks that passed in the latest run; null before the first run."),
    uptime24h: percent.describe("Percentage of sep1.reachable passes over the last 24 hours; null without data."),
    uptime7d: percent.describe("Percentage of sep1.reachable passes over the last 7 days; null without data."),
    lastCheckedAt: z.iso.datetime().nullable().describe("When the latest run finished."),
  })
  .meta({ id: "AnchorSummary" });

export const checkResult = z
  .object({
    checkId: z.string(),
    status,
    latencyMs: z.number().int().optional(),
    detail: z.unknown().optional().describe("Check-specific data, e.g. the supported assets."),
    error: z.string().optional().describe("Human-readable reason for a fail or skip."),
  })
  .meta({ id: "CheckResult" });

export const anchorDetail = anchorSummary
  .extend({ checks: z.array(checkResult).describe("The latest result for each check.") })
  .meta({ id: "AnchorDetail" });

export const historyRange = z.enum(["24h", "7d"]);

export const historyQuery = z.object({
  check: z.enum(checkIds).optional().describe("Only this check. Omit for every check."),
  range: historyRange.default("24h"),
});

export const historyEntry = checkResult
  .extend({ runId: z.number().int(), startedAt: z.iso.datetime() })
  .meta({ id: "HistoryEntry" });

export const history = z
  .object({
    domain: z.string(),
    check: z.string().nullable(),
    range: historyRange,
    results: z.array(historyEntry).describe("Oldest first."),
  })
  .meta({ id: "History" });

export const domainParams = z.object({ domain: z.string().min(1).max(253) });

export const listQuery = z.object({ network: network.optional() });

export const errorResponse = z
  .object({ statusCode: z.number().int(), error: z.string(), message: z.string() })
  .meta({ id: "Error" });

export const health = z.object({ status: z.literal("ok") });
