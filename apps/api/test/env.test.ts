import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENV_VARS } from "../src/config.js";

// Every variable the API reads must be documented, set or commented out, in .env.example.
const example = readFileSync(new URL("../../../.env.example", import.meta.url), "utf8");
const documented = new Set([...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));

describe(".env.example", () => {
  it.each(ENV_VARS)("documents %s", (name) => {
    expect(documented).toContain(name);
  });
});
