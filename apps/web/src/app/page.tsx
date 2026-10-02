import { AnchorTable } from "@/components/AnchorTable";
import { EmptyState } from "@/components/EmptyState";
import { getAnchors } from "@/lib/api";
import { anchorHealth, type Health } from "@/lib/format";

const SUMMARY: [Health, string][] = [
  ["healthy", "healthy"],
  ["degraded", "degraded"],
  ["down", "down"],
];

// Always render with the latest results from the API, never at build time.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const anchors = await getAnchors();
  const counts = Object.fromEntries(SUMMARY.map(([h]) => [h, anchors.filter((a) => anchorHealth(a) === h).length]));

  return (
    <>
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h1 className="text-lg font-semibold">Anchors</h1>
        {anchors.length > 0 && (
          <p className="text-xs text-muted tabular-nums">
            {anchors.length} monitored · {SUMMARY.map(([h, label]) => `${counts[h]} ${label}`).join(" · ")}
          </p>
        )}
      </div>
      {anchors.length === 0 ? (
        <EmptyState title="No anchors yet">
          Anchors appear here once they are added to <code className="font-mono">anchors.json</code> and the worker has
          synced them.
        </EmptyState>
      ) : (
        <AnchorTable anchors={anchors} now={Date.now()} />
      )}
    </>
  );
}
