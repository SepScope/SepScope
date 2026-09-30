import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { allChecks } from "../src/runner.js";
import { REPO_URL, USER_AGENT, VERSION } from "../src/version.js";

// Enforces the testing rules in CONTRIBUTING.md for every future check.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkSources = readdirSync(join(root, "src/checks")).filter((f) => f.endsWith(".ts"));

describe("testing conventions", () => {
  it.each(checkSources)("src/checks/%s has a unit test file", (file) => {
    const testFiles = readdirSync(join(root, "test/checks"));
    expect(testFiles).toContain(`${basename(file, ".ts")}.test.ts`);
  });

  it.each(allChecks.map((c) => c.id))("check %s is exercised by a unit test", (id) => {
    const tests = readdirSync(join(root, "test/checks"))
      .map((f) => readFileSync(join(root, "test/checks", f), "utf8"))
      .join("\n");
    expect(tests).toContain(`"${id}"`);
  });

  it("has a live integration test", () => {
    expect(readdirSync(join(root, "test/live")).some((f) => f.endsWith(".live.test.ts"))).toBe(true);
  });
});

describe("version", () => {
  it("matches package.json and is used in the User-Agent", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(VERSION).toBe(pkg.version);
    expect(USER_AGENT).toBe(`SEPscope/${pkg.version} (+${REPO_URL})`);
  });
});
