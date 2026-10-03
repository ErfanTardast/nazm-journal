import { describe, expect, it } from "vitest";
import {
  TIERS,
  UNLIMITED,
  checkLimit,
  effectiveTier,
  hasFeature,
  resolveEntitlements,
  resolveTier
} from "@/lib/entitlements";

describe("resolveTier", () => {
  it("accepts known tiers", () => {
    for (const t of TIERS) expect(resolveTier(t)).toBe(t);
  });
  it("degrades unknown/missing to free", () => {
    expect(resolveTier(undefined)).toBe("free");
    expect(resolveTier(null)).toBe("free");
    expect(resolveTier("platinum")).toBe("free");
    expect(resolveTier(42)).toBe("free");
  });
});

describe("resolveEntitlements + hasFeature", () => {
  it("free has the coach but not paid features", () => {
    expect(hasFeature("free", "aiCoach")).toBe(true);
    expect(hasFeature("free", "dataExport")).toBe(false);
    expect(hasFeature("free", "advancedAnalytics")).toBe(false);
    expect(hasFeature("free", "weeklyMentorReport")).toBe(false);
  });
  it("pro unlocks export + analytics, elite unlocks mentor report", () => {
    expect(hasFeature("pro", "dataExport")).toBe(true);
    expect(hasFeature("pro", "advancedAnalytics")).toBe(true);
    expect(hasFeature("pro", "weeklyMentorReport")).toBe(false);
    expect(hasFeature("elite", "weeklyMentorReport")).toBe(true);
  });
  it("limits are non-decreasing across tiers (elite = unlimited)", () => {
    const free = resolveEntitlements("free").limits;
    const pro = resolveEntitlements("pro").limits;
    expect(pro.maxActivePlans).toBeGreaterThan(free.maxActivePlans);
    expect(resolveEntitlements("elite").limits.maxActivePlans).toBe(UNLIMITED);
  });
});

describe("checkLimit", () => {
  it("enforces a finite limit", () => {
    expect(checkLimit("free", "maxActivePlans", 2)).toMatchObject({ allowed: true, remaining: 1, unlimited: false });
    expect(checkLimit("free", "maxActivePlans", 3)).toMatchObject({ allowed: false, remaining: 0 });
    expect(checkLimit("free", "maxActivePlans", 5).remaining).toBe(0); // clamped, never negative
  });
  it("treats UNLIMITED as always allowed", () => {
    const r = checkLimit("elite", "aiReviewsPerDay", 9999);
    expect(r).toMatchObject({ allowed: true, unlimited: true, limit: UNLIMITED });
  });
  it("unknown tier falls back to free limits", () => {
    expect(checkLimit("bogus", "maxWatchlists", 1).allowed).toBe(false); // free maxWatchlists = 1
  });
});

describe("effectiveTier", () => {
  const now = new Date("2026-10-01T12:00:00Z");

  it("keeps a paid tier while it has not expired", () => {
    expect(effectiveTier({ tier: "pro", tierExpiresAt: new Date("2026-10-15T00:00:00Z") }, now)).toBe("pro");
  });
  it("drops an expired paid tier to free", () => {
    expect(effectiveTier({ tier: "elite", tierExpiresAt: new Date("2026-09-30T23:59:59Z") }, now)).toBe("free");
  });
  it("treats a paid tier with no expiry as open-ended", () => {
    expect(effectiveTier({ tier: "elite", tierExpiresAt: null }, now)).toBe("elite");
  });
  it("degrades a missing or unknown tier to free", () => {
    expect(effectiveTier({}, now)).toBe("free");
    expect(effectiveTier({ tier: "platinum", tierExpiresAt: null }, now)).toBe("free");
  });
});
