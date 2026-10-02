import { fileURLToPath } from "node:url";
import { z } from "zod";

/** anchors.json at the repository root; the same path from src/ and dist/. */
export const DEFAULT_ANCHORS_FILE = fileURLToPath(new URL("../../../anchors.json", import.meta.url));

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CHECK_INTERVAL_MINUTES: z.coerce.number().positive().default(15),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  ANCHORS_FILE: z.string().min(1).default(DEFAULT_ANCHORS_FILE),
});

export interface Config {
  databaseUrl: string;
  checkIntervalMs: number;
  logLevel: z.infer<typeof envSchema>["LOG_LEVEL"];
  anchorsFile: string;
  /** At most this many anchors are checked at once. */
  concurrency: number;
  /** Minimum gap between two requests to the same host. */
  hostIntervalMs: number;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  // Treat empty variables (e.g. `CHECK_INTERVAL_MINUTES=` in .env) as unset.
  const set = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = envSchema.safeParse(set);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${issues}`);
  }
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    checkIntervalMs: e.CHECK_INTERVAL_MINUTES * 60_000,
    logLevel: e.LOG_LEVEL,
    anchorsFile: e.ANCHORS_FILE,
    concurrency: 4,
    hostIntervalMs: 1000,
  };
}
