import { describe, expect, it } from "vitest";
import { checkPlanRisk, resolveRiskLimits } from "@/lib/calculations/plan-risk-check";

const ACCOUNT = { riskPerTradePct: 1, maxDailyLossPct: 3 };

describe("resolveRiskLimits", () => {
  it("uses the account defaults when the plan has no strategy", () => {
    expect(resolveRiskLimits(null, ACCOUNT)).toEqual({
      riskPerTradePct: { value: 1, source: "account" },
      maxDailyLossPct: { value: 3, source: "account" },
      maxOpenPositions: null
    });
  });

  it("lets each limit the strategy sets win over the account, one by one", () => {
    const limits = resolveRiskLimits({ riskPerTradePct: 0.5, maxDailyLossPct: null, maxOpenPositions: 2 }, ACCOUNT);
    expect(limits).toEqual({
      riskPerTradePct: { value: 0.5, source: "strategy" },
      maxDailyLossPct: { value: 3, source: "account" },
      maxOpenPositions: { value: 2, source: "strategy" }
    });
  });

  it("reads the decimal strings the API sends", () => {
    const limits = resolveRiskLimits({ riskPerTradePct: "0.7500", maxDailyLossPct: "2", maxOpenPositions: 3 }, { riskPerTradePct: "1.0000", maxDailyLossPct: "3.0000" });
    expect(limits.riskPerTradePct).toEqual({ value: 0.75, source: "strategy" });
    expect(limits.maxDailyLossPct).toEqual({ value: 2, source: "strategy" });
  });

  it("treats a missing, zero or broken number as no limit", () => {
    const limits = resolveRiskLimits({ riskPerTradePct: 0, maxDailyLossPct: "abc", maxOpenPositions: 0 }, { riskPerTradePct: null, maxDailyLossPct: undefined });
    expect(limits).toEqual({ riskPerTradePct: null, maxDailyLossPct: null, maxOpenPositions: null });
  });

  it("has no limits at all without a strategy and without account defaults", () => {
    expect(resolveRiskLimits(null, null)).toEqual({ riskPerTradePct: null, maxDailyLossPct: null, maxOpenPositions: null });
  });
});

describe("checkPlanRisk", () => {
  const limits = resolveRiskLimits({ riskPerTradePct: 0.5, maxDailyLossPct: 2, maxOpenPositions: 2 }, ACCOUNT);

  it("finds nothing when the plan stays inside every limit", () => {
    expect(checkPlanRisk({ riskPercent: 0.5, openPositions: 1 }, limits)).toEqual([]);
  });

  it("reports risk above the per-trade limit, with both numbers and where the limit came from", () => {
    expect(checkPlanRisk({ riskPercent: 0.8 }, limits)).toEqual([{ code: "risk_per_trade", limit: 0.5, actual: 0.8, source: "strategy" }]);
  });

  it("reports a single plan that risks more than the whole daily loss limit", () => {
    const found = checkPlanRisk({ riskPercent: 2.5 }, limits);
    expect(found.map((violation) => violation.code)).toEqual(["risk_per_trade", "daily_loss"]);
    expect(found[1]).toEqual({ code: "daily_loss", limit: 2, actual: 2.5, source: "strategy" });
  });

  it("reports one more position than the strategy allows open at once", () => {
    expect(checkPlanRisk({ riskPercent: 0.5, openPositions: 2 }, limits)).toEqual([{ code: "open_positions", limit: 2, actual: 3, source: "strategy" }]);
  });

  it("does not guess when the plan has no risk percent yet", () => {
    expect(checkPlanRisk({ riskPercent: null }, limits)).toEqual([]);
    expect(checkPlanRisk({ riskPercent: Number.NaN }, limits)).toEqual([]);
  });

  it("is not thrown off by floating-point noise at the limit", () => {
    expect(checkPlanRisk({ riskPercent: 0.1 + 0.2 }, resolveRiskLimits({ riskPerTradePct: 0.3 }, null))).toEqual([]);
  });

  it("says where an account-level limit came from", () => {
    expect(checkPlanRisk({ riskPercent: 1.5 }, resolveRiskLimits(null, ACCOUNT))).toEqual([{ code: "risk_per_trade", limit: 1, actual: 1.5, source: "account" }]);
  });
});
