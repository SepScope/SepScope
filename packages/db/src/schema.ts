import { sql } from "drizzle-orm";
import {
  bigserial,
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const checkStatus = pgEnum("check_status", ["pass", "warn", "fail", "skipped"]);

/** One row per monitored anchor, synced from anchors.json. */
export const anchors = pgTable(
  "anchors",
  {
    id: serial("id").primaryKey(),
    domain: text("domain").notNull().unique(),
    network: text("network").notNull(),
    name: text("name").notNull(),
  },
  (t) => [check("anchors_network_check", sql`${t.network} in ('pubnet', 'testnet')`)],
);

/** One row per scheduled run of an anchor. finished_at is null while the run is in progress. */
export const checkRuns = pgTable(
  "check_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    anchorId: integer("anchor_id")
      .notNull()
      .references(() => anchors.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("check_runs_anchor_started_idx").on(t.anchorId, t.startedAt.desc())],
);

/** One row per check within a run. */
export const checkResults = pgTable(
  "check_results",
  {
    runId: bigint("run_id", { mode: "number" })
      .notNull()
      .references(() => checkRuns.id, { onDelete: "cascade" }),
    checkId: text("check_id").notNull(),
    status: checkStatus("status").notNull(),
    latencyMs: integer("latency_ms"),
    detail: jsonb("detail"),
    error: text("error"),
  },
  (t) => [primaryKey({ columns: [t.runId, t.checkId] }), index("check_results_check_idx").on(t.checkId)],
);
