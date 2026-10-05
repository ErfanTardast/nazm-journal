import { beforeEach, describe, expect, it, vi } from "vitest";
import { unauthorized } from "@/lib/api/errors";

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/performance", () => ({ getPerformanceRowTradeIds: vi.fn() }));

import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getPerformanceRowTradeIds } from "@/lib/services/performance";
import { GET } from "@/app/api/performance/trades/route";

const user = { id: "u1", timezone: "Asia/Tehran" };
const get = (query: string) => GET(new Request(`http://localhost/api/performance/trades${query}`));

beforeEach(() => {
  vi.mocked(requireUser).mockReset().mockResolvedValue(user as never);
  vi.mocked(enforceRateLimit).mockClear();
  vi.mocked(getPerformanceRowTradeIds).mockReset().mockResolvedValue(["t1", "t2"]);
});

describe("GET /api/performance/trades", () => {
  it("answers 401 when signed out, without reading anything", async () => {
    vi.mocked(requireUser).mockRejectedValue(unauthorized());
    const res = await get("?period=30d&dimension=weekday&row=key%3Aweekday.3");
    expect(res.status).toBe(401);
    expect(getPerformanceRowTradeIds).not.toHaveBeenCalled();
  });

  it("answers the trade ids of the row, for the user's period, dimension and row", async () => {
    const res = await get(`?period=30d&dimension=weekday&row=${encodeURIComponent("key:weekday.3")}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { tradeIds: ["t1", "t2"] } });
    expect(getPerformanceRowTradeIds).toHaveBeenCalledWith(user, { period: "30d", dimension: "weekday", row: "key:weekday.3" });
  });

  it("takes every period and every dimension the report has", async () => {
    for (const period of ["7d", "30d", "90d", "all"]) expect((await get(`?period=${period}&dimension=symbol&row=x`)).status).toBe(200);
    for (const dimension of ["strategy", "symbol", "market", "side", "session", "weekday", "setup", "mistake", "emotion"]) {
      expect((await get(`?period=all&dimension=${dimension}&row=x`)).status).toBe(200);
    }
  });

  it("answers 422 for a missing or unknown period, dimension or row, and for a long row", async () => {
    const bad = [
      "",
      "?dimension=symbol&row=x",
      "?period=all&row=x",
      "?period=all&dimension=symbol",
      "?period=1y&dimension=symbol&row=x",
      "?period=all&dimension=color&row=x",
      "?period=all&dimension=&row=x",
      "?period=all&dimension=symbol&row=",
      `?period=all&dimension=symbol&row=${"a".repeat(201)}`
    ];
    for (const query of bad) {
      const res = await get(query);
      expect(res.status, query).toBe(422);
      expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    }
    expect(getPerformanceRowTradeIds).not.toHaveBeenCalled();
  });

  it("takes a row of exactly 200 characters", async () => {
    expect((await get(`?period=all&dimension=symbol&row=${"a".repeat(200)}`)).status).toBe(200);
  });

  it("is rate limited, before the session is read", async () => {
    const request = new Request("http://localhost/api/performance/trades?period=7d&dimension=side&row=key%3Aside.long");
    await GET(request);
    expect(enforceRateLimit).toHaveBeenCalledWith(request, "performance:trades", 60, 60);
    expect(vi.mocked(enforceRateLimit).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(requireUser).mock.invocationCallOrder[0]);
  });

  it("only exports GET (no mutation methods)", async () => {
    const mod = (await import("@/app/api/performance/trades/route")) as Record<string, unknown>;
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) expect(mod[method]).toBeUndefined();
    expect(typeof mod.GET).toBe("function");
  });
});
