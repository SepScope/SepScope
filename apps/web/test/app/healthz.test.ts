import { describe, expect, it } from "vitest";
import { GET, dynamic } from "@/app/healthz/route";

describe("GET /healthz", () => {
  it("is ok without depending on the API, and never cached", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(dynamic).toBe("force-dynamic");
  });
});
