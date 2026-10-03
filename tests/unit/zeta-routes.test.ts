import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/security/audit", () => ({ auditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/onboarding", () => ({
  getOnboardingProfile: vi.fn(),
  saveOnboardingProfile: vi.fn()
}));

import { requireUser } from "@/lib/auth/session";
import { getOnboardingProfile, saveOnboardingProfile } from "@/lib/services/onboarding";
import { GET as demoGET } from "@/app/api/demo/story/route";
import { GET as onboardingGET } from "@/app/api/onboarding/plan/route";
import { GET as sprintGET, POST as sprintPOST } from "@/app/api/onboarding/sprint/route";
import { GET as privacyGET } from "@/app/api/privacy/inventory/route";

beforeEach(() => {
  vi.mocked(requireUser).mockResolvedValue({ id: "u1" } as never);
});

describe("GET /api/demo/story", () => {
  it("returns the deterministic 14-day demo story", async () => {
    const res = await demoGET(new Request("http://localhost/api/demo/story"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.days).toHaveLength(14);
    expect(body.data.aiRefusalExample.refused).toBe(true);
  });
});

describe("GET /api/onboarding/plan", () => {
  it("builds a plan from query params and coerces unknowns", async () => {
    const res = await onboardingGET(
      new Request("http://localhost/api/onboarding/plan?experience=advanced&market=forex&disciplineIssue=overtrading&language=fa")
    );
    const body = await res.json();
    expect(body.data.segment).toBe("advanced-forex-overtrading");
    expect(body.data.language).toBe("fa");
    expect(body.data.defaultRiskPercent).toBe(1);
  });

  it("defaults safely with no params", async () => {
    const res = await onboardingGET(new Request("http://localhost/api/onboarding/plan"));
    const body = await res.json();
    expect(body.data.segment).toBe("beginner-crypto-no_plan");
  });
});

describe("/api/onboarding/sprint", () => {
  const profile = {
    id: "profile-1",
    segment: "beginner-crypto-no_plan",
    starterStrategyId: "strategy-1",
    firstReviewId: "review-1",
    sprint: { days: [{ day: 1, targetScore: 65 }] }
  };

  it("returns the existing persisted sprint", async () => {
    vi.mocked(getOnboardingProfile).mockResolvedValue(profile as never);
    const res = await sprintGET(new Request("http://localhost/api/onboarding/sprint"));
    const body = await res.json();
    expect(body.data.profile.id).toBe("profile-1");
    expect(getOnboardingProfile).toHaveBeenCalledWith("u1");
  });

  it("saves a sprint from onboarding answers", async () => {
    vi.mocked(saveOnboardingProfile).mockResolvedValue(profile as never);
    const res = await sprintPOST(
      new Request("http://localhost/api/onboarding/sprint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ experience: "beginner", market: "crypto", disciplineIssue: "no_plan", language: "en" })
      })
    );
    const body = await res.json();
    expect(body.data.profile.starterStrategyId).toBe("strategy-1");
    expect(saveOnboardingProfile).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ market: "crypto", disciplineIssue: "no_plan" })
    );
  });
});

describe("GET /api/privacy/inventory", () => {
  it("leaves out payment records while payments are off (the trial stores none)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const body = await (await privacyGET(new Request("http://localhost/api/privacy/inventory"))).json();
      expect(body.data.categories.map((c: { key: string }) => c.key)).not.toContain("payments");
      expect(body.data.exportable).not.toContain("payments");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("returns data categories + exportable keys (read-only)", async () => {
    const res = await privacyGET(new Request("http://localhost/api/privacy/inventory"));
    const body = await res.json();
    expect(Array.isArray(body.data.categories)).toBe(true);
    expect(body.data.exportable).not.toContain("aiAudits"); // AI audit log is not exported
  });

  it("only exports GET (no mutation methods)", async () => {
    const mod = (await import("@/app/api/privacy/inventory/route")) as Record<string, unknown>;
    for (const m of ["POST", "PUT", "DELETE", "PATCH"]) expect(mod[m]).toBeUndefined();
    expect(typeof mod.GET).toBe("function");
  });
});
