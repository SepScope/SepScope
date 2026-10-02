import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { MIGRATIONS_FOLDER, type DbConnection } from "./index.js";
import * as schema from "./schema.js";
import { anchors } from "./schema.js";

/**
 * An in-memory Postgres (PGlite) with every migration applied, for tests.
 * Real Postgres semantics (enums, foreign keys, jsonb) without a server.
 */
export async function createTestDb(): Promise<DbConnection> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  const connection: DbConnection = {
    db,
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    close: () => client.close(),
  };
  await connection.migrate();
  return connection;
}

/** Empties every table and restarts id sequences, so one test database can be shared by a whole file. */
export async function resetTestDb(conn: DbConnection): Promise<void> {
  await conn.db.execute(sql`truncate table ${anchors} restart identity cascade`);
}
