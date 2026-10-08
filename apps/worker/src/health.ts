import http from "node:http";
import type { AddressInfo } from "node:net";

export interface HealthReport {
  healthy: boolean;
  body: Record<string, unknown>;
}

export interface HealthServer {
  /** e.g. http://127.0.0.1:8081 */
  url: string;
  close(): Promise<void>;
}

/** A cycle may run long; only flag the worker once it is well past due. */
export const STALE_GRACE_MS = 5 * 60_000;

/**
 * True when nothing has finished for over two intervals plus a grace period,
 * i.e. the scheduler is stuck. `lastProgressAt` is the last finished cycle,
 * or the start time before the first one.
 */
export function isStale(lastProgressAt: number, now: number, intervalMs: number): boolean {
  return now - lastProgressAt > 2 * intervalMs + STALE_GRACE_MS;
}

/** Serves GET /healthz: 200 when `check` reports healthy, 503 otherwise or if it throws. */
export async function startHealthServer(
  port: number,
  host: string,
  check: () => Promise<HealthReport>,
): Promise<HealthServer> {
  const server = http.createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    };
    if (req.method !== "GET" || req.url !== "/healthz") return send(404, { error: "Not Found" });
    try {
      const report = await check();
      send(report.healthy ? 200 : 503, report.body);
    } catch (err) {
      send(503, { status: "error", error: (err as Error).message });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  const address = server.address() as AddressInfo;
  return {
    url: `http://${address.family === "IPv6" ? `[${address.address}]` : address.address}:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
