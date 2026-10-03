import { describe, expect, it } from "vitest";
import { checkPropGuard } from "@/lib/calculations/prop-guard";
import type { PropGuardInput } from "@/lib/calculations/prop-guard";

const BASE: PropGuardInput = {
  maxDailyLossPct: 3,
  riskPerTradePct: 1,
  todayLossPct: 0,
  todayTradeCount: 0,
  maxDailyTrades: null,
  recentResults: [],
  todayUnplannedCount: 0
};

describe("checkPropGuard", () => {
  it("returns no alerts and isBlocked=false for a clean session", () => {
    const result = checkPropGuard(BASE);
    expect(result.alerts).toHaveLength(0);
    expect(result.isBlocked).toBe(false);
  });

  it("raises danger alert when daily loss equals the limit", () => {
    const result = checkPropGuard({ ...BASE, todayLossPct: 3 });
    const alert = result.alerts.find((a) => a.key === "daily_loss_limit");
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe("danger");
    expect(result.isBlocked).toBe(true);
  });

  it("raises warning at 70% of the daily loss limit", () => {
    const result = checkPropGuard({ ...BASE, todayLossPct: 2.1 });
    const alert = result.alerts.find((a) => a.key === "daily_loss_warning");
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe("warning");
    expect(result.isBlocked).toBe(false);
  });

  it("does not trigger daily loss alerts when maxDailyLossPct is 0", () => {
    const result = checkPropGuard({ ...BASE, maxDailyLossPct: 0, todayLossPct: 5 });
    const lossAlerts = result.alerts.filter((a) => a.key.startsWith("daily_loss"));
    expect(lossAlerts).toHaveLength(0);
  });

  it("raises warning when trade count reaches maxDailyTrades", () => {
    const result = checkPropGuard({ ...BASE, maxDailyTrades: 3, todayTradeCount: 3 });
    const alert = result.alerts.find((a) => a.key === "overtrading");
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe("warning");
  });

  it("does not raise overtrading when maxDailyTrades is null", () => {
    const result = checkPropGuard({ ...BASE, maxDailyTrades: null, todayTradeCount: 20 });
    expect(result.alerts.find((a) => a.key === "overtrading")).toBeUndefined();
  });

  it("raises revenge_pattern warning after two consecutive losses", () => {
    const result = checkPropGuard({ ...BASE, recentResults: [true, true, false, false] });
    const alert = result.alerts.find((a) => a.key === "revenge_pattern");
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe("warning");
  });

  it("does not raise revenge_pattern with only one loss", () => {
    const result = checkPropGuard({ ...BASE, recentResults: [true, false] });
    expect(result.alerts.find((a) => a.key === "revenge_pattern")).toBeUndefined();
  });

  it("raises unplanned_trades warning when today has trades without plan", () => {
    const result = checkPropGuard({ ...BASE, todayUnplannedCount: 2 });
    const alert = result.alerts.find((a) => a.key === "unplanned_trades");
    expect(alert).toBeDefined();
    expect(alert?.message).toMatch(/2/);
  });

  it("passes todayLossPct and maxDailyLossPct through on the result", () => {
    const result = checkPropGuard({ ...BASE, todayLossPct: 1.5, maxDailyLossPct: 3 });
    expect(result.todayLossPct).toBe(1.5);
    expect(result.maxDailyLossPct).toBe(3);
  });
});
