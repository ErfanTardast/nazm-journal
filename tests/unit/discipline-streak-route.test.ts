import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/discipline-streak", () => ({ getDisciplineStreak: vi.fn() }));

import { requireUser } from "@/lib/auth/session";
import { getDisciplineStreak } from "@/lib/services/discipline-streak";
import { GET } from "@/app/api/discipline/streak/route";

beforeEach(() => {
  vi.mocked(requireUser).mockResolvedValue({ id: "u1" } as never);
});

describe("GET /api/discipline/streak", () => {
  it("returns the user's streak", async () => {
    vi.mocked(getDisciplineStreak).mockResolvedValue({
      currentStreak: 3, bestStreak: 5, totalActiveDays: 10, totalDisciplinedDays: 8,
      lastActiveDate: "2026-06-27", brokeStreakOnLastDay: false, unreviewedDays: 2,
    });
    const res = await GET(new Request("http://localhost/api/discipline/streak"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.currentStreak).toBe(3);
    expect(body.data.bestStreak).toBe(5);
    expect(body.data.unreviewedDays).toBe(2);
    expect(getDisciplineStreak).toHaveBeenCalledWith("u1");
  });

  it("only exports GET (no mutation methods)", async () => {
    const mod = (await import("@/app/api/discipline/streak/route")) as Record<string, unknown>;
    for (const m of ["POST", "PUT", "DELETE", "PATCH"]) expect(mod[m]).toBeUndefined();
    expect(typeof mod.GET).toBe("function");
  });
});
