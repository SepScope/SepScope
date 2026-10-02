import { Keypair, StrKey, WebAuth } from "@stellar/stellar-sdk";
import { errorMessage, fetchText } from "../http.js";
import type { Check, CheckResult } from "../types.js";

/**
 * Requests a SEP-10 challenge for a throwaway, unfunded key and validates it.
 * The challenge is never signed or submitted.
 */
export const sep10Challenge: Check = {
  id: "sep10.challenge",
  dependsOn: ["sep1.parse"],
  async run(ctx) {
    const id = this.id;
    const toml = ctx.toml;
    if (!toml) throw new Error("stellar.toml was not parsed");

    const endpoint = toml.WEB_AUTH_ENDPOINT;
    if (endpoint === undefined) {
      return { checkId: id, status: "skipped", error: "WEB_AUTH_ENDPOINT is not declared" };
    }
    const fail = (error: string, extra: Partial<CheckResult> = {}): CheckResult => ({
      checkId: id,
      status: "fail",
      error,
      ...extra,
    });

    let url: URL;
    try {
      url = new URL(String(endpoint));
    } catch {
      return fail(`WEB_AUTH_ENDPOINT is not a valid URL: ${JSON.stringify(endpoint)}`);
    }
    if (url.protocol !== "https:") return fail(`WEB_AUTH_ENDPOINT is not HTTPS: ${url}`);

    const signingKey = toml.SIGNING_KEY;
    if (typeof signingKey !== "string" || !StrKey.isValidEd25519PublicKey(signingKey)) {
      return fail(`SIGNING_KEY is missing or not a valid Stellar public key: ${JSON.stringify(signingKey)}`);
    }
    const passphrase = toml.NETWORK_PASSPHRASE;
    if (typeof passphrase !== "string" || passphrase === "") {
      return fail("NETWORK_PASSPHRASE is missing");
    }

    const client = Keypair.random().publicKey();
    url.searchParams.set("account", client);
    url.searchParams.set("home_domain", ctx.domain);

    const res = await fetchText(ctx, url.toString(), { Accept: "application/json" });
    const { latencyMs } = res;
    if (!res.ok) return fail(res.error, { latencyMs });
    const { status, body: text } = res;
    const detail = { endpoint: String(endpoint), account: client };

    if (status !== 200) return fail(`Expected HTTP 200, got ${status}`, { latencyMs, detail });

    let body: { transaction?: unknown; network_passphrase?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      return fail("Response is not valid JSON", { latencyMs, detail });
    }
    if (typeof body?.transaction !== "string") {
      return fail('Response has no "transaction" string', { latencyMs, detail });
    }
    if (body.network_passphrase !== undefined && body.network_passphrase !== passphrase) {
      return fail(
        `Response network_passphrase ${JSON.stringify(body.network_passphrase)} does not match stellar.toml NETWORK_PASSPHRASE`,
        { latencyMs, detail },
      );
    }

    let clientAccountID: string;
    try {
      // Checks sequence 0, server source account, manage_data ops, the
      // "<home_domain> auth" key, the nonce, web_auth_domain, time bounds,
      // and the server signature under this network passphrase.
      ({ clientAccountID } = WebAuth.readChallengeTx(body.transaction, signingKey, passphrase, ctx.domain, url.host));
    } catch (err) {
      return fail(errorMessage(err), { latencyMs, detail });
    }
    if (clientAccountID !== client) {
      return fail(`Challenge is for account ${clientAccountID}, not the requested ${client}`, { latencyMs, detail });
    }

    return { checkId: id, status: "pass", latencyMs, detail };
  },
};

export const sep10Checks: Check[] = [sep10Challenge];
