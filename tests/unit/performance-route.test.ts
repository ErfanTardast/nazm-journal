import { beforeEach, describe, expect, it, vi } from "vitest";
import { unauthorized } from "@/lib/api/errors";

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/performance", () => ({ getPerformanceReport: vi.fn() }));

import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getPerformanceReport } from "@/lib/services/performance";
import { GET } from "@/app/api/performance/route";

const user = { id: "u1", timezone: "Asia/Tehran" };
const report = { context: { period: "all" }, summary: {}, equity: [] };

beforeEach(() => {
  vi.mocked(requireUser).mockReset().mockResolvedValue(user as never);
  vi.mocked(enforceRateLimit).mockClear();
  vi.mocked(getPerformanceReport).mockReset().mockResolvedValue(report as never);
});

describe("GET /api/performance", () => {
  it("answers 401 when signed out, without reading anything", async () => {
    vi.mocked(requireUser).mockRejectedValue(unauthorized());
    const res = await GET(new Request("http://localhost/api/performance"));
    expect(res.status).toBe(401);
    expect(getPerformanceReport).not.toHaveBeenCalled();
  });

  it("answers 422 for a period it does not know", async () => {
    for (const period of ["1y", "", "ALL", "7"]) {
      const res = await GET(new Request(`http://localhost/api/performance?period=${period}`));
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    }
    expect(getPerformanceReport).not.toHaveBeenCalled();
  });

  it("is all time by default", async () => {
    const res = await GET(new Request("http://localhost/api/performance"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { report } });
    expect(getPerformanceReport).toHaveBeenCalledWith(user, { period: "all" });
  });

  it("passes the period to the service", async () => {
    for (const period of ["7d", "30d", "90d", "all"]) {
      await GET(new Request(`http://localhost/api/performance?period=${period}`));
      expect(getPerformanceReport).toHaveBeenLastCalledWith(user, { period });
    }
  });

  it("is rate limited", async () => {
    const request = new Request("http://localhost/api/performance?period=7d");
    await GET(request);
    expect(enforceRateLimit).toHaveBeenCalledWith(request, "performance:report", 60, 60);
  });

  it("only exports GET (no mutation methods)", async () => {
    const mod = (await import("@/app/api/performance/route")) as Record<string, unknown>;
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) expect(mod[method]).toBeUndefined();
    expect(typeof mod.GET).toBe("function");
  });
});
