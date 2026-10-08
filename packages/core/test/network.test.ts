import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_TIMEOUT_MS } from "../src/http.js";
import { CONNECT_ATTEMPT_TIMEOUT_MS, configureNetwork } from "../src/network.js";

const original = net.getDefaultAutoSelectFamilyAttemptTimeout();
afterEach(() => net.setDefaultAutoSelectFamilyAttemptTimeout(original));

describe("configureNetwork", () => {
  it("raises Node's per-address connect attempt limit above its 250ms default", () => {
    net.setDefaultAutoSelectFamilyAttemptTimeout(250);
    configureNetwork();
    expect(net.getDefaultAutoSelectFamilyAttemptTimeout()).toBe(CONNECT_ATTEMPT_TIMEOUT_MS);
  });

  it("leaves room to try more than one address inside the check timeout", () => {
    expect(CONNECT_ATTEMPT_TIMEOUT_MS).toBeGreaterThan(250);
    expect(CONNECT_ATTEMPT_TIMEOUT_MS * 2).toBeLessThan(DEFAULT_TIMEOUT_MS);
  });
});
