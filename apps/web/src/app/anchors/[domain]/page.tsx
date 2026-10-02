import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCard } from "@/components/CheckCard";
import { EmptyState } from "@/components/EmptyState";
import { StatusDot } from "@/components/StatusDot";
import { getAnchor } from "@/lib/api";
import { anchorHealth, formatPercent, formatRelative, formatTimestamp, HEALTH_LABEL } from "@/lib/format";

// Always render with the latest results from the API, never at build time.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: decodeURIComponent((await params).domain) };
}

export default async function AnchorPage({ params }: Props) {
  const domain = decodeURIComponent((await params).domain);
  const anchor = await getAnchor(domain);
  if (!anchor) notFound();
  const health = anchorHealth(anchor);
  const now = Date.now();

  const stats: [string, string][] = [
    ["Score", formatPercent(anchor.score)],
    ["Uptime 24h", formatPercent(anchor.uptime24h)],
    ["Uptime 7d", formatPercent(anchor.uptime7d)],
    ["Last check", formatRelative(anchor.lastCheckedAt, now)],
  ];

  return (
    <>
      <nav className="mb-4 text-xs">
        <Link href="/" className="text-muted hover:text-fg">
          ← All anchors
        </Link>
      </nav>

      <header className="mb-6">
        <div className="flex items-center gap-2.5">
          <StatusDot health={health} />
          <h1 className="truncate text-lg font-semibold">{anchor.name}</h1>
        </div>
        <p className="mt-0.5 text-sm text-muted">
          {anchor.domain} · {anchor.network} · {HEALTH_LABEL[health]}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
          {stats.map(([label, value]) => (
            <div key={label} className="bg-surface px-4 py-3">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-0.5 text-base font-medium tabular-nums">
                {label === "Last check" && anchor.lastCheckedAt ? (
                  <time dateTime={anchor.lastCheckedAt} title={formatTimestamp(anchor.lastCheckedAt)}>
                    {value}
                  </time>
                ) : (
                  value
                )}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      <h2 className="mb-3 text-sm font-medium">Checks</h2>
      {anchor.checks.length === 0 ? (
        <EmptyState title="Not checked yet">Results appear after the worker's first run for this anchor.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {anchor.checks.map((check) => (
            <CheckCard key={check.checkId} check={check} />
          ))}
        </div>
      )}
    </>
  );
}
