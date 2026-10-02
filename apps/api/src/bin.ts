import { main } from "./main.js";

const server = await main(process.env);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void server.close().then(() => process.exit(0)));
}
