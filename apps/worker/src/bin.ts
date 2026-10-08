import { pino } from "pino";
import { main } from "./main.js";
import { handleShutdown } from "./shutdown.js";

try {
  const worker = await main(process.env);
  handleShutdown(() => worker.stop(), { logger: worker.logger, timeoutMs: worker.shutdownTimeoutMs });
} catch (err) {
  // Startup failures (bad config, unreachable database, invalid anchors.json) are logged as JSON too.
  pino().fatal({ err }, "worker failed to start");
  process.exit(1);
}
