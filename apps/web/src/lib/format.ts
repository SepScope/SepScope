import type { AnchorSummary, CheckResult, CheckStatus } from "./api";

export type Health = "healthy" | "degraded" | "down" | "unknown";

/** Status dot: down if the toml was unreachable, healthy at a perfect score, degraded otherwise. */
export function anchorHealth(a: Pick<AnchorSummary, "reachable" | "score">): Health {
  if (a.reachable === null) return "unknown";
  if (!a.reachable) return "down";
  return a.score === 100 ? "healthy" : "degraded";
}

export const HEALTH_LABEL: Record<Health, string> = {
  healthy: "All checks passing",
  degraded: "Some checks failing",
  down: "stellar.toml unreachable",
  unknown: "Not checked yet",
};

export const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: "Pass",
  warn: "Warning",
  fail: "Fail",
  skipped: "Skipped",
};

export function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

export function formatLatency(ms: number | undefined): string {
  if (ms === undefined) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", relative to `now` so server and client agree. */
export function formatRelative(iso: string | null, now: number): string {
  if (iso === null) return "Never";
  const seconds = Math.round((now - Date.parse(iso)) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

interface CheckInfo {
  title: string;
  spec: string;
}

const CHECKS: Record<string, CheckInfo> = {
  "sep1.reachable": { title: "stellar.toml reachable", spec: "SEP-1" },
  "sep1.cors": { title: "CORS header", spec: "SEP-1" },
  "sep1.parse": { title: "Valid TOML", spec: "SEP-1" },
  "sep1.fields": { title: "Required fields", spec: "SEP-1" },
  "sep10.challenge": { title: "Auth challenge", spec: "SEP-10" },
  "sep6.info": { title: "Transfer server /info", spec: "SEP-6" },
  "sep24.info": { title: "Interactive transfer /info", spec: "SEP-24" },
  "sep38.info": { title: "Quote server /info", spec: "SEP-38" },
};

/** Readable name and spec for a check ID; unknown IDs fall back to the ID itself. */
export function checkInfo(checkId: string): CheckInfo {
  const known = CHECKS[checkId];
  if (known) return known;
  const sep = /^sep(\d+)\./.exec(checkId);
  return { title: checkId, spec: sep ? `SEP-${sep[1]}` : "" };
}

export interface Asset {
  code: string;
  /** Issuer, "fiat", or "native"; shown as secondary text. */
  note?: string;
  /** Full identifier, for a tooltip. */
  id: string;
}

/** Parses a SEP-38 asset identifier, or a SEP-6/24 asset code. */
export function parseAsset(id: string): Asset {
  if (id === "native" || id === "stellar:native") return { code: "XLM", note: "native", id };
  const stellar = /^stellar:([^:]+):(G[A-Z2-7]{55})$/.exec(id);
  if (stellar) return { code: stellar[1]!, note: `${stellar[2]!.slice(0, 4)}…${stellar[2]!.slice(-4)}`, id };
  const fiat = /^iso4217:([A-Z]{3})$/.exec(id);
  if (fiat) return { code: fiat[1]!, note: "fiat", id };
  return { code: id, id };
}

export interface AssetGroup {
  label: string;
  assets: Asset[];
}

const stringArray = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === "string") ? v : null;

/** The supported assets in a check's detail: deposit/withdraw (SEP-6/24) or assets (SEP-38). */
export function supportedAssets(detail: unknown): AssetGroup[] {
  if (typeof detail !== "object" || detail === null) return [];
  const d = detail as Record<string, unknown>;
  const groups: AssetGroup[] = [];
  for (const [key, label] of [
    ["deposit", "Deposit"],
    ["withdraw", "Withdraw"],
    ["assets", "Assets"],
  ] as const) {
    const list = stringArray(d[key]);
    if (list) groups.push({ label, assets: list.map(parseAsset) });
  }
  return groups;
}

/**
 * Why a check produced the result it did, in words. A check skipped because a
 * prerequisite did not pass has no error, only `detail.blockedBy`.
 */
export function readableReason(check: Pick<CheckResult, "status" | "error" | "detail">): string | undefined {
  if (check.error) return check.error;
  if (check.status !== "skipped" || typeof check.detail !== "object" || check.detail === null) return undefined;
  const blockedBy = stringArray((check.detail as { blockedBy?: unknown }).blockedBy);
  if (!blockedBy || blockedBy.length === 0) return undefined;
  const names = blockedBy.map((id) => checkInfo(id).title);
  return `Not run because ${names.join(" and ")} did not pass.`;
}

/** The endpoints sep1.fields found in the toml, as [field, url] pairs. */
export function declaredEndpoints(detail: unknown): [string, string][] {
  if (typeof detail !== "object" || detail === null) return [];
  const endpoints = (detail as { endpoints?: unknown }).endpoints;
  if (typeof endpoints !== "object" || endpoints === null) return [];
  return Object.entries(endpoints).filter((e): e is [string, string] => typeof e[1] === "string");
}
