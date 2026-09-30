import { parse } from "smol-toml";
import { errorMessage, httpGet } from "../http.js";
import type { Check, CheckContext, CheckResult } from "../types.js";

export const REQUIRED_FIELDS = ["NETWORK_PASSPHRASE", "SIGNING_KEY"] as const;

export const ENDPOINT_FIELDS = [
  "WEB_AUTH_ENDPOINT",
  "TRANSFER_SERVER",
  "TRANSFER_SERVER_SEP0024",
  "ANCHOR_QUOTE_SERVER",
] as const;

/**
 * Many servers only emit CORS headers for requests that carry an Origin, as
 * browsers always do cross-origin, so we send one to see what a web wallet sees.
 */
export const CORS_PROBE_ORIGIN = "https://sepscope.invalid";

export function stellarTomlUrl(domain: string): string {
  return new URL("/.well-known/stellar.toml", `https://${domain}`).toString();
}

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

// Dependent checks only run once sep1.reachable passed, so this is set.
function tomlResponse(ctx: CheckContext) {
  if (!ctx.tomlResponse) throw new Error("stellar.toml was not fetched");
  return ctx.tomlResponse;
}

export const sep1Reachable: Check = {
  id: "sep1.reachable",
  async run(ctx) {
    const id = this.id;
    let url: string;
    try {
      url = stellarTomlUrl(ctx.domain);
    } catch {
      return { checkId: id, status: "fail", error: `Invalid domain: ${ctx.domain}` };
    }

    const started = performance.now();
    let res: Response;
    let body: string;
    try {
      res = await httpGet(ctx, url, { Origin: CORS_PROBE_ORIGIN });
      body = await res.text();
    } catch (err) {
      return {
        checkId: id,
        status: "fail",
        latencyMs: Math.round(performance.now() - started),
        error: errorMessage(err),
      };
    }
    const latencyMs = Math.round(performance.now() - started);
    // Redirects are followed, so check where we ended up, not where we started.
    const finalUrl = res.url || url;

    if (!finalUrl.startsWith("https://")) {
      return { checkId: id, status: "fail", latencyMs, error: `Served over non-HTTPS URL ${finalUrl}` };
    }
    if (res.status !== 200) {
      return { checkId: id, status: "fail", latencyMs, error: `Expected HTTP 200, got ${res.status}` };
    }

    ctx.tomlResponse = { url: finalUrl, status: res.status, headers: res.headers, body, latencyMs };
    return { checkId: id, status: "pass", latencyMs };
  },
};

export const sep1Cors: Check = {
  id: "sep1.cors",
  dependsOn: ["sep1.reachable"],
  async run(ctx) {
    const { headers, latencyMs } = tomlResponse(ctx);
    const value = headers.get("access-control-allow-origin");
    if (value === null) {
      return { checkId: this.id, status: "fail", latencyMs, error: "Missing Access-Control-Allow-Origin header" };
    }
    if (value.trim() !== "*") {
      return {
        checkId: this.id,
        status: "fail",
        latencyMs,
        error: `Access-Control-Allow-Origin must be "*", got "${value}"`,
      };
    }
    return { checkId: this.id, status: "pass", latencyMs };
  },
};

export const sep1Parse: Check = {
  id: "sep1.parse",
  dependsOn: ["sep1.reachable"],
  async run(ctx) {
    const { body } = tomlResponse(ctx);
    try {
      ctx.toml = parse(body);
    } catch (err) {
      return { checkId: this.id, status: "fail", error: `Invalid TOML: ${errorMessage(err)}` };
    }
    return { checkId: this.id, status: "pass" };
  },
};

export const sep1Fields: Check = {
  id: "sep1.fields",
  dependsOn: ["sep1.parse"],
  async run(ctx) {
    const toml = ctx.toml;
    if (!toml) throw new Error("stellar.toml was not parsed");

    const problems: string[] = [];
    for (const field of REQUIRED_FIELDS) {
      const value = toml[field];
      if (typeof value !== "string" || value.trim() === "") problems.push(`${field} is missing`);
    }
    const endpoints: Record<string, string> = {};
    for (const field of ENDPOINT_FIELDS) {
      if (!(field in toml)) continue;
      const value = toml[field];
      if (isHttpsUrl(value)) endpoints[field] = value as string;
      else problems.push(`${field} is not a valid HTTPS URL: ${JSON.stringify(value)}`);
    }

    const result: CheckResult = { checkId: this.id, status: "pass", detail: { endpoints } };
    if (problems.length > 0) {
      result.status = "fail";
      result.error = problems.join("; ");
    }
    return result;
  },
};

export const sep1Checks: Check[] = [sep1Reachable, sep1Cors, sep1Parse, sep1Fields];
