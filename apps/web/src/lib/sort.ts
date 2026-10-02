import type { AnchorSummary } from "./api";

export type SortKey = "name" | "network" | "score" | "uptime24h" | "lastCheckedAt";
export type SortDir = "asc" | "desc";

/** The direction a column sorts in when first clicked: best or newest first for numbers and times. */
export const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  network: "asc",
  score: "desc",
  uptime24h: "desc",
  lastCheckedAt: "desc",
};

function value(a: AnchorSummary, key: SortKey): string | number | null {
  if (key === "lastCheckedAt") return a.lastCheckedAt === null ? null : Date.parse(a.lastCheckedAt);
  if (key === "name") return a.name.toLowerCase();
  return a[key];
}

/** Sorts a copy. Missing values always go last, whatever the direction; ties fall back to name. */
export function sortAnchors(anchors: readonly AnchorSummary[], key: SortKey, dir: SortDir): AnchorSummary[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...anchors].sort((a, b) => {
    const va = value(a, key);
    const vb = value(b, key);
    if (va === null || vb === null) {
      if (va !== vb) return va === null ? 1 : -1;
    } else if (va !== vb) {
      return (va < vb ? -1 : 1) * sign;
    }
    return a.name.localeCompare(b.name) || a.domain.localeCompare(b.domain);
  });
}
