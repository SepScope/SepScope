import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  API_PORT: z.coerce.number().int().min(0).max(65535).default(8080),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  // "true" trusts every proxy; a number trusts that many hops. Needed behind a reverse
  // proxy so rate limits apply per client rather than to the proxy's address.
  TRUST_PROXY: z
    .union([z.enum(["true", "false"]).transform((v) => v === "true"), z.coerce.number().int().nonnegative()])
    .default(false),
  SHUTDOWN_TIMEOUT_SECONDS: z.coerce.number().positive().default(25),
});

/** Every environment variable the API reads; each must be documented in .env.example. */
export const ENV_VARS = Object.keys(envSchema.shape);

export interface Config {
  databaseUrl: string;
  port: number;
  host: string;
  logLevel: z.infer<typeof envSchema>["LOG_LEVEL"];
  rateLimitPerMinute: number;
  trustProxy: boolean | number;
  /** After SIGTERM, how long to let in-flight requests finish before exiting anyway. */
  shutdownTimeoutMs: number;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  // Treat empty variables (e.g. `API_PORT=` in .env) as unset.
  const set = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = envSchema.safeParse(set);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${issues}`);
  }
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    port: e.API_PORT,
    host: e.API_HOST,
    logLevel: e.LOG_LEVEL,
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
    trustProxy: e.TRUST_PROXY,
    shutdownTimeoutMs: e.SHUTDOWN_TIMEOUT_SECONDS * 1000,
  };
}
