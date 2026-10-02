import { allChecks, score, uptimeWindows, WEEK_MS, type CheckStatus, type ReachabilitySample } from "@sepscope/core";
import { anchors, checkResults, checkRuns, type Database } from "@sepscope/db";
import { and, asc, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";

export interface CheckResultView {
  checkId: string;
  status: CheckStatus;
  latencyMs?: number;
  detail?: unknown;
  error?: string;
}

export interface AnchorSummaryView {
  domain: string;
  network: "pubnet" | "testnet";
  name: string;
  score: number | null;
  uptime24h: number | null;
  uptime7d: number | null;
  lastCheckedAt: string | null;
}

export interface HistoryEntryView extends CheckResultView {
  runId: number;
  startedAt: string;
}

const RANGE_MS = { "24h": 24 * 60 * 60 * 1000, "7d": WEEK_MS } as const;
export type HistoryRange = keyof typeof RANGE_MS;

type ResultRow = typeof checkResults.$inferSelect;
type AnchorRow = typeof anchors.$inferSelect;

/** Percentages are stored unrounded; the API reports one decimal place. */
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

/** Drops null columns, so absent values are omitted rather than sent as null. */
function toView(r: Pick<ResultRow, "checkId" | "status" | "latencyMs" | "detail" | "error">): CheckResultView {
  const view: CheckResultView = { checkId: r.checkId, status: r.status };
  if (r.latencyMs !== null) view.latencyMs = r.latencyMs;
  if (r.detail !== null) view.detail = r.detail;
  if (r.error !== null) view.error = r.error;
  return view;
}

const checkOrder = new Map(allChecks.map((c, i) => [c.id, i]));
/** Registered run order, so related checks sit together; unknown (retired) checks go last. */
const byCheckOrder = (a: { checkId: string }, b: { checkId: string }) =>
  (checkOrder.get(a.checkId) ?? Infinity) - (checkOrder.get(b.checkId) ?? Infinity) || a.checkId.localeCompare(b.checkId);

/** The latest finished run per anchor, with its results. */
async function latestRuns(db: Database, anchorIds: number[]) {
  if (anchorIds.length === 0) return new Map<number, { finishedAt: Date; results: ResultRow[] }>();
  const runs = await db
    .selectDistinctOn([checkRuns.anchorId], { id: checkRuns.id, anchorId: checkRuns.anchorId, finishedAt: checkRuns.finishedAt })
    .from(checkRuns)
    .where(and(inArray(checkRuns.anchorId, anchorIds), isNotNull(checkRuns.finishedAt)))
    .orderBy(checkRuns.anchorId, desc(checkRuns.startedAt));
  const results = runs.length
    ? await db.select().from(checkResults).where(inArray(checkResults.runId, runs.map((r) => r.id)))
    : [];
  return new Map(
    runs.map((run) => [run.anchorId, { finishedAt: run.finishedAt!, results: results.filter((r) => r.runId === run.id) }]),
  );
}

/** sep1.reachable outcomes over the last 7 days, per anchor. */
async function reachability(db: Database, anchorIds: number[], now: Date) {
  const samples = new Map<number, ReachabilitySample[]>();
  if (anchorIds.length === 0) return samples;
  const rows = await db
    .select({ anchorId: checkRuns.anchorId, at: checkRuns.startedAt, status: checkResults.status })
    .from(checkResults)
    .innerJoin(checkRuns, eq(checkResults.runId, checkRuns.id))
    .where(
      and(
        inArray(checkRuns.anchorId, anchorIds),
        eq(checkResults.checkId, "sep1.reachable"),
        gte(checkRuns.startedAt, new Date(now.getTime() - WEEK_MS)),
      ),
    );
  for (const { anchorId, ...sample } of rows) {
    samples.set(anchorId, [...(samples.get(anchorId) ?? []), sample]);
  }
  return samples;
}

async function summarize(db: Database, rows: AnchorRow[], now: Date) {
  const ids = rows.map((a) => a.id);
  const [latest, samples] = await Promise.all([latestRuns(db, ids), reachability(db, ids, now)]);
  return rows.map((a) => {
    const run = latest.get(a.id);
    const up = uptimeWindows(samples.get(a.id) ?? [], now);
    const summary: AnchorSummaryView = {
      domain: a.domain,
      network: a.network as AnchorSummaryView["network"],
      name: a.name,
      score: round1(run ? score(run.results) : null),
      uptime24h: round1(up.uptime24h),
      uptime7d: round1(up.uptime7d),
      lastCheckedAt: run ? run.finishedAt.toISOString() : null,
    };
    return { summary, results: run?.results ?? [] };
  });
}

export async function listAnchors(
  db: Database,
  now: Date,
  filter: { network?: "pubnet" | "testnet" } = {},
): Promise<AnchorSummaryView[]> {
  const rows = await db
    .select()
    .from(anchors)
    .where(filter.network ? eq(anchors.network, filter.network) : undefined)
    .orderBy(asc(anchors.domain));
  return (await summarize(db, rows, now)).map((s) => s.summary);
}

export async function getAnchor(
  db: Database,
  domain: string,
  now: Date,
): Promise<(AnchorSummaryView & { checks: CheckResultView[] }) | null> {
  const rows = await db.select().from(anchors).where(eq(anchors.domain, domain));
  if (rows.length === 0) return null;
  const [{ summary, results }] = (await summarize(db, rows, now)) as [Awaited<ReturnType<typeof summarize>>[number]];
  return { ...summary, checks: results.map(toView).sort(byCheckOrder) };
}

export async function getHistory(
  db: Database,
  domain: string,
  options: { check?: string; range: HistoryRange; now: Date },
): Promise<HistoryEntryView[] | null> {
  const [anchor] = await db.select({ id: anchors.id }).from(anchors).where(eq(anchors.domain, domain));
  if (!anchor) return null;
  const rows = await db
    .select({
      runId: checkRuns.id,
      startedAt: checkRuns.startedAt,
      checkId: checkResults.checkId,
      status: checkResults.status,
      latencyMs: checkResults.latencyMs,
      detail: checkResults.detail,
      error: checkResults.error,
    })
    .from(checkResults)
    .innerJoin(checkRuns, eq(checkResults.runId, checkRuns.id))
    .where(
      and(
        eq(checkRuns.anchorId, anchor.id),
        gte(checkRuns.startedAt, new Date(options.now.getTime() - RANGE_MS[options.range])),
        options.check ? eq(checkResults.checkId, options.check) : undefined,
      ),
    )
    .orderBy(asc(checkRuns.startedAt), asc(checkResults.checkId));
  return rows.map((r) => ({ runId: r.runId, startedAt: r.startedAt.toISOString(), ...toView(r) }));
}
