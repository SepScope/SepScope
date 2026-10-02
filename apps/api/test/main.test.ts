import type { DbConnection } from "@sepscope/db";
import { createTestDb } from "@sepscope/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { main } from "../src/main.js";

let shared: DbConnection;
beforeAll(async () => {
  shared = await createTestDb();
});
afterAll(() => shared.close());

const env = { DATABASE_URL: "postgres://test", API_PORT: "0", API_HOST: "127.0.0.1", LOG_LEVEL: "silent" };

describe("main", () => {
  it("migrates, listens, and serves real HTTP until closed", async () => {
    const migrate = vi.fn(() => shared.migrate());
    const close = vi.fn(async () => {});
    const connect = vi.fn(() => ({ db: shared.db, migrate, close }));
    const server = await main(env, { connect });

    expect(connect).toHaveBeenCalledWith("postgres://test");
    expect(migrate).toHaveBeenCalledTimes(1);
    const res = await fetch(`${server.url}/healthz`, { headers: { origin: "https://wallet.example" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toEqual({ status: "ok" });

    await server.close();
    expect(close).toHaveBeenCalledTimes(1);
    await expect(fetch(`${server.url}/healthz`)).rejects.toThrow();
  });

  it("closes the connection and rethrows when startup fails", async () => {
    const close = vi.fn(async () => {});
    const connect = () => ({ db: shared.db, migrate: async () => Promise.reject(new Error("migration failed")), close });
    await expect(main(env, { connect })).rejects.toThrow("migration failed");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("rejects bad configuration before connecting", async () => {
    const connect = vi.fn();
    await expect(main({}, { connect })).rejects.toThrow(/DATABASE_URL/);
    expect(connect).not.toHaveBeenCalled();
  });
});
