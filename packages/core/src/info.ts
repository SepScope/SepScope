import type { z } from "zod";
import { fetchText } from "./http.js";
import type { Check, CheckResult } from "./types.js";

export interface InfoCheckOptions<T> {
  id: string;
  /** The stellar.toml field holding the server's base URL. */
  field: string;
  schema: z.ZodType<T>;
  /** Builds the result's detail, e.g. the supported assets, from a valid response. */
  detail(info: T): unknown;
}

/** `{base}/info`, tolerating a trailing slash on the declared URL. */
export function infoUrl(base: URL): string {
  return `${base.origin}${base.pathname.replace(/\/+$/, "")}/info`;
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.length > 0 ? i.path.join(".") : "(root)"}: ${i.message}`).join("; ");
}

/**
 * A check that GETs `{toml[field]}/info` and validates the JSON body against
 * `schema`. Skipped when the toml does not declare the endpoint.
 */
export function infoCheck<T>({ id, field, schema, detail }: InfoCheckOptions<T>): Check {
  return {
    id,
    dependsOn: ["sep1.parse"],
    async run(ctx) {
      const toml = ctx.toml;
      if (!toml) throw new Error("stellar.toml was not parsed");

      const endpoint = toml[field];
      if (endpoint === undefined) return { checkId: id, status: "skipped", error: `${field} is not declared` };
      const fail = (error: string, extra: Partial<CheckResult> = {}): CheckResult => ({
        checkId: id,
        status: "fail",
        error,
        ...extra,
      });

      let base: URL;
      try {
        base = new URL(String(endpoint));
      } catch {
        return fail(`${field} is not a valid URL: ${JSON.stringify(endpoint)}`);
      }
      if (base.protocol !== "https:") return fail(`${field} is not HTTPS: ${base}`);
      const url = infoUrl(base);

      const res = await fetchText(ctx, url, { Accept: "application/json" });
      const { latencyMs } = res;
      if (!res.ok) return fail(res.error, { latencyMs });
      const { status, body: text } = res;

      if (status !== 200) return fail(`Expected HTTP 200 from ${url}, got ${status}`, { latencyMs });
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return fail(`Response from ${url} is not valid JSON`, { latencyMs });
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success) return fail(`Invalid /info response: ${describeIssues(parsed.error)}`, { latencyMs });

      return { checkId: id, status: "pass", latencyMs, detail: detail(parsed.data) };
    },
  };
}

/** Asset codes whose entry is enabled, in the order the anchor lists them. */
export function enabledAssets(assets: Record<string, { enabled: boolean }>): string[] {
  return Object.entries(assets)
    .filter(([, asset]) => asset.enabled)
    .map(([code]) => code);
}
