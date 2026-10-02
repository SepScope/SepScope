import { createDb, type DbConnection } from "@sepscope/db";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

export interface MainDeps {
  connect: (databaseUrl: string) => DbConnection;
}

export interface Server {
  /** The address the server is listening on, e.g. http://127.0.0.1:8080. */
  url: string;
  close(): Promise<void>;
}

/** Migrates, then serves the API on API_HOST:API_PORT. */
export async function main(env: Record<string, string | undefined>, deps: MainDeps = { connect: createDb }): Promise<Server> {
  const config = loadConfig(env);
  const conn = deps.connect(config.databaseUrl);
  try {
    await conn.migrate();
    const app = await buildApp({
      db: conn.db,
      rateLimitPerMinute: config.rateLimitPerMinute,
      trustProxy: config.trustProxy,
      logger: { level: config.logLevel },
    });
    const url = await app.listen({ port: config.port, host: config.host });
    return {
      url,
      async close() {
        await app.close();
        await conn.close();
      },
    };
  } catch (err) {
    await conn.close();
    throw err;
  }
}
