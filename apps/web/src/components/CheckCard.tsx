import type { CheckResult } from "@/lib/api";
import { checkInfo, declaredEndpoints, formatLatency, readableReason, supportedAssets } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

export function CheckCard({ check }: { check: CheckResult }) {
  const { title, spec } = checkInfo(check.checkId);
  const assets = supportedAssets(check.detail);
  const endpoints = declaredEndpoints(check.detail);
  const reason = readableReason(check);

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4" aria-label={title}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{title}</h3>
          <p className="truncate font-mono text-xs text-muted">
            {spec && <span>{spec} · </span>}
            {check.checkId}
          </p>
        </div>
        <StatusBadge status={check.status} />
      </header>

      {/* Checks that reuse another check's response (e.g. sep1.parse) make no request of their own. */}
      {check.latencyMs !== undefined && (
        <dl className="text-xs">
          <dt className="text-muted">Latency</dt>
          <dd className="tabular-nums">{formatLatency(check.latencyMs)}</dd>
        </dl>
      )}

      {reason && (
        <p
          className={`rounded-md px-2.5 py-2 text-xs break-words ${
            check.status === "skipped" ? "bg-surface-2 text-muted" : "bg-fail-soft text-fg"
          }`}
        >
          {reason}
        </p>
      )}

      {assets.map((group) => (
        <div key={group.label}>
          <h4 className="mb-1.5 text-xs text-muted">
            {group.label} <span className="tabular-nums">({group.assets.length})</span>
          </h4>
          {group.assets.length === 0 ? (
            <p className="text-xs text-muted">None enabled</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {group.assets.map((asset) => (
                <li
                  key={asset.id}
                  title={asset.id}
                  className="inline-flex items-baseline gap-1 rounded border border-line bg-surface-2 px-1.5 py-0.5 text-xs"
                >
                  <span className="font-medium">{asset.code}</span>
                  {asset.note && <span className="font-mono text-[10px] text-muted">{asset.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {endpoints.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs text-muted">Declared endpoints</h4>
          <dl className="space-y-1 text-xs">
            {endpoints.map(([field, url]) => (
              <div key={field} className="min-w-0">
                <dt className="font-mono text-[10px] text-muted">{field}</dt>
                <dd className="truncate font-mono" title={url}>
                  {url}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </article>
  );
}
