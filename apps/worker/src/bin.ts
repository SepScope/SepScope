import { main } from "./main.js";

const worker = await main(process.env);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void worker.stop().then(() => process.exit(0)));
}
