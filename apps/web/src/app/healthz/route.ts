/**
 * Liveness only: the dashboard stays up, showing an error page, while the API
 * is down, so this deliberately does not call the API.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ status: "ok" });
}
