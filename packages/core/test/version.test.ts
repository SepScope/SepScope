import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REPO_URL, USER_AGENT, VERSION } from "../src/version.js";

describe("version", () => {
  it("matches package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(VERSION).toBe(pkg.version);
  });

  it("builds the User-Agent from the version and repo URL", () => {
    expect(USER_AGENT).toBe(`SEPscope/${VERSION} (+${REPO_URL})`);
  });
});
