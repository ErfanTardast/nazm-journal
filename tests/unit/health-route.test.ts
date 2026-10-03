import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: vi.fn() } }));
import { prisma } from "@/lib/db/prisma";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("reports ok when the database answers", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }] as never);
    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", database: "ok" });
  });

  it("reports 503 without details when the database is unreachable", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432 user=trademaster"));
    const res = await GET();

    expect(res.status).toBe(503);
    // No connection details leak to the public endpoint.
    expect(await res.json()).toEqual({ status: "degraded", database: "unreachable" });
  });
});
