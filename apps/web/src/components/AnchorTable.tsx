"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AnchorSummary } from "@/lib/api";
import { anchorHealth, formatPercent, formatRelative, formatTimestamp } from "@/lib/format";
import { DEFAULT_DIR, sortAnchors, type SortDir, type SortKey } from "@/lib/sort";
import { StatusDot } from "./StatusDot";

interface Column {
  key: SortKey;
  label: string;
  className: string;
}

const COLUMNS: Column[] = [
  { key: "name", label: "Anchor", className: "text-left" },
  { key: "network", label: "Network", className: "text-left hidden sm:table-cell" },
  { key: "score", label: "Score", className: "text-right" },
  { key: "uptime24h", label: "Uptime 24h", className: "text-right" },
  { key: "lastCheckedAt", label: "Last check", className: "text-right hidden md:table-cell" },
];

/**
 * `now` comes from the server render, so relative times match between server
 * and client and do not cause a hydration mismatch.
 */
export function AnchorTable({ anchors, now }: { anchors: AnchorSummary[]; now: number }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "name", dir: "asc" });
  const rows = useMemo(() => sortAnchors(anchors, sort.key, sort.dir), [anchors, sort]);

  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: DEFAULT_DIR[key] },
    );

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <table className="w-full border-collapse text-sm tabular-nums">
        <thead className="bg-surface-2 text-xs text-muted">
          <tr>
            {COLUMNS.map((col) => {
              const active = sort.key === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                  className={`px-3 py-2 font-medium whitespace-nowrap sm:px-4 ${col.className}`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(col.key)}
                    className={`inline-flex items-center gap-1 rounded hover:text-fg focus-visible:outline-2 focus-visible:outline-accent ${active ? "text-fg" : ""}`}
                  >
                    {col.label}
                    <span aria-hidden="true" className={active ? "" : "opacity-0"}>
                      {active && sort.dir === "desc" ? "↓" : "↑"}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.domain} className="border-t border-line hover:bg-surface-2">
              <td className="px-3 py-2.5 sm:px-4">
                <Link
                  href={`/anchors/${encodeURIComponent(a.domain)}`}
                  className="flex min-w-0 items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <StatusDot health={anchorHealth(a)} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.name}</span>
                    <span className="block truncate text-xs text-muted">{a.domain}</span>
                  </span>
                </Link>
              </td>
              <td className="hidden px-3 py-2.5 text-muted sm:table-cell sm:px-4">{a.network}</td>
              <td className="px-3 py-2.5 text-right sm:px-4">{formatPercent(a.score)}</td>
              <td className="px-3 py-2.5 text-right sm:px-4">{formatPercent(a.uptime24h)}</td>
              <td className="hidden px-3 py-2.5 text-right text-muted md:table-cell sm:px-4">
                {a.lastCheckedAt ? (
                  <time dateTime={a.lastCheckedAt} title={formatTimestamp(a.lastCheckedAt)}>
                    {formatRelative(a.lastCheckedAt, now)}
                  </time>
                ) : (
                  "Never"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
