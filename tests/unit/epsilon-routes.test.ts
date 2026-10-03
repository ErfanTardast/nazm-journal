import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/playbook-adherence", () => ({ getPlaybookAdherence: vi.fn() }));
vi.mock("@/lib/services/mentor-report", () => ({ getMentorReport: vi.fn() }));

import { requireUser } from "@/lib/auth/session";
import { getPlaybookAdherence } from "@/lib/services/playbook-adherence";
import { getMentorReport } from "@/lib/services/mentor-report";
import { GET as adherenceGET } from "@/app/api/playbooks/adherence/route";
import { GET as mentorGET } from "@/app/api/mentor-report/route";

beforeEach(() => {
  vi.mocked(requireUser).mockResolvedValue({ id: "u1" } as never);
});

describe("GET /api/playbooks/adherence", () => {
  it("returns the per-playbook adherence (read-only)", async () => {
    vi.mocked(getPlaybookAdherence).mockResolvedValue([{ strategyId: "s1", name: "Breakout" }] as never);
    const res = await adherenceGET(new Request("http://localhost/api/playbooks/adherence"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.playbooks[0].name).toBe("Breakout");
  });

  it("only exports GET (no mutation methods)", async () => {
    const mod = (await import("@/app/api/playbooks/adherence/route")) as Record<string, unknown>;
    for (const m of ["POST", "PUT", "DELETE", "PATCH"]) expect(mod[m]).toBeUndefined();
    expect(typeof mod.GET).toBe("function");
  });
});

describe("GET /api/mentor-report (entitlement-gated)", () => {
  it("locks the report for free tier (no User.tier)", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "u1" } as never); // free
    const res = await mentorGET(new Request("http://localhost/api/mentor-report"));
    const body = await res.json();
    expect(body.data.available).toBe(false);
    expect(body.data.requiredTier).toBe("elite");
    expect(body.data.report).toBeNull();
    expect(getMentorReport).not.toHaveBeenCalled();
  });

  it("returns the report for elite tier and honors hidePnl", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "u1", tier: "elite" } as never);
    vi.mocked(getMentorReport).mockResolvedValue({ shareSafe: true, pnlHidden: true } as never);
    const res = await mentorGET(new Request("http://localhost/api/mentor-report?hidePnl=true"));
    const body = await res.json();
    expect(body.data.available).toBe(true);
    expect(body.data.report.shareSafe).toBe(true);
    // No language in the request or the user's settings: the report is written in Persian.
    expect(getMentorReport).toHaveBeenCalledWith("u1", { hidePnl: true, locale: "fa" });
  });

  it("locks the report once an elite tier has expired", async () => {
    vi.mocked(getMentorReport).mockClear();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      tier: "elite",
      tierExpiresAt: new Date(Date.now() - 60_000)
    } as never);
    const res = await mentorGET(new Request("http://localhost/api/mentor-report"));
    const body = await res.json();
    expect(body.data.available).toBe(false);
    expect(getMentorReport).not.toHaveBeenCalled();
  });
});

describe("GET /api/mentor-report during the trial (payments off)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is free for every signed-in user and names no plan", async () => {
    vi.stubEnv("NODE_ENV", "production"); // payments off: NEXT_PUBLIC_PAYMENTS_ENABLED unset
    vi.mocked(requireUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(getMentorReport).mockResolvedValue({ shareSafe: true } as never);

    const body = await (await mentorGET(new Request("http://localhost/api/mentor-report"))).json();

    expect(body.data.available).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/elite/i);
  });
});
