import net from "node:net";

/**
 * How long Node's Happy Eyeballs gives each of a host's addresses to connect
 * before trying the next. Node's default of 250ms is a hard per-attempt limit:
 * when the event loop is busy or an anchor is far away, every address can miss
 * it and the request fails in under a second with ETIMEDOUT, falsely reporting
 * a healthy anchor as unreachable. Two seconds still falls back from broken
 * IPv6 to IPv4 well within the 10-second check timeout.
 */
export const CONNECT_ATTEMPT_TIMEOUT_MS = 2000;

/**
 * Applies process-wide network settings for checking anchors. Call it once at
 * startup in any process that runs checks; it is not applied on import.
 */
export function configureNetwork(): void {
  net.setDefaultAutoSelectFamilyAttemptTimeout(CONNECT_ATTEMPT_TIMEOUT_MS);
}
