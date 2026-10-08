import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // A self-contained server for the Docker image; Vercel ignores this.
  output: "standalone",
  // Trace dependencies from the monorepo root so workspace hoisting is followed.
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
};

export default config;
