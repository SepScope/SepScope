import { pino } from "pino";
import { main } from "./main.js";
import { handleShutdown } from "./shutdown.js";

try {
  const server = await main(process.env);
  handleShutdown(() => server.close(), { logger: server.logger, timeoutMs: server.shutdownTimeoutMs });
} catch (err) {
  // Startup failures (bad config, unreachable database, port in use) are logged as JSON too.
  pino().fatal({ err }, "api failed to start");
  process.exit(1);
}
