import { describe, expect, it } from "vitest";
import {
  buildCarryForwardReviewChecklist,
  buildCarryForwardReviewInsights,
  buildReviewInsights,
  buildReviewMetrics,
  buildReviewNextActions,
  buildReviewReminderPayload,
  buildReviewRisks,
  generateDefaultReviewChecklist,
  getCarryForwardPeriod,
  getUtcWeekPeriod
} from "@/lib/services/reviews";

const context: Parameters<typeof buildReviewInsights>[1] = {
  metrics: {
    totalTrades: 8,
    wins: 4,
    losses: 4,
    winRate: 0.5,
    grossProfit: 900,
    grossLoss: 500,
    netPnl: 400,
    averageR: 0.45,
    profitFactor: 1.8,
    expectancy: 50,
    maxDrawdownAmount: 120,
    maxDrawdownR: 3.4,
    maxDrawdownPct: null,
    equityCurve: [100, 80, 140],
    setups: { count: 8, combined: 0, pendingLegs: 0, wins: 4, losses: 4, winRate: 0.5, averageR: 0.45, expectancy: 50 }
  },
  tradeCount: 3,
  closedTradeCount: 2,
  openTradeCount: 1,
  plannedTradeCount: 2,
  ruleBreaks: 2,
  mixedRules: 1,
  topMistakes: ["late entry", "oversizing"],
  topEmotions: ["impatient"],
  symbols: ["EURUSD", "BTCUSDT"],
  linkedTradeIds: ["trade_1", "trade_2"],
  linkedStrategyIds: ["strategy_1"],
  activeStrategyNames: ["London session checklist"],
  riskDefaults: {
    riskPerTradePct: 1,
    maxDailyLossPct: 3,
    maxWeeklyLossPct: 6
  }
};

describe("review engine calculations", () => {
  it("generates checklist templates by type", () => {
    expect(generateDefaultReviewChecklist("daily")).toHaveLength(5);
    expect(generateDefaultReviewChecklist("weekly").map((item) => item.key)).toContain("review_rule_breaks");
    expect(generateDefaultReviewChecklist("risk").every((item) => item.completed === false)).toBe(true);
  });

  it("calculates a Monday-based UTC weekly period", () => {
    const period = getUtcWeekPeriod(new Date("2026-06-14T12:00:00.000Z"));
    expect(period.periodStart.toISOString()).toBe("2026-06-08T00:00:00.000Z");
    expect(period.periodEnd.toISOString()).toBe("2026-06-14T23:59:59.999Z");
  });

  it("summarizes mistake and risk context deterministically", () => {
    expect(buildReviewInsights("mistake", context).join(" ")).toContain("late entry");
    expect(buildReviewRisks("risk", context).join(" ")).toContain("2 records show broken rules");
    expect(buildReviewNextActions("risk", context)).toContain('Write one prevention rule for "late entry".');
  });

  it("builds reminder alert payloads for review alerts", () => {
    const payload = buildReviewReminderPayload({
      id: "review_123",
      type: "weekly",
      title: "Weekly review - 2026-06-08 to 2026-06-14",
      periodEnd: new Date("2026-06-14T23:59:59.999Z")
    });

    expect(payload).toMatchObject({
      type: "weekly_review",
      status: "active",
      channels: ["in_app"],
      condition: {
        reviewId: "review_123",
        reviewType: "weekly",
        dueAt: "2026-06-14T23:59:59.999Z"
      }
    });
  });

  it("builds carry-forward daily review context from completed review output", () => {
    const source = {
      title: "Weekly review - 2026-06-08 to 2026-06-14",
      lessons: ["Late entries need a written trigger check."],
      nextActions: ["Review London session plan before adding records."],
      risks: ["2 records show broken rules."]
    };

    const checklist = buildCarryForwardReviewChecklist(source);
    expect(checklist.find((item) => item.key === "review_plans")?.note).toContain("Review London session plan");
    expect(checklist.find((item) => item.key === "write_one_lesson")?.note).toContain("Late entries");

    const insights = buildCarryForwardReviewInsights(source);
    expect(insights[0]).toContain(source.title);
    expect(insights.join(" ")).toContain("Next actions carried forward");
  });

  it("moves carry-forward reviews to the next UTC day", () => {
    const period = getCarryForwardPeriod(new Date("2026-06-14T23:59:59.999Z"));
    expect(period.periodStart.toISOString()).toBe("2026-06-15T00:00:00.000Z");
    expect(period.periodEnd.toISOString()).toBe("2026-06-15T23:59:59.999Z");
  });
});

describe("drawdown in reviews", () => {
  it("records the drawdown in money and R, not a percentage", () => {
    const metrics = buildReviewMetrics(context);

    expect(metrics).toMatchObject({ maxDrawdownAmount: 120, maxDrawdownR: 3.4 });
    expect(metrics).not.toHaveProperty("maxDrawdown");
  });

  it("names the drawdown among the risks", () => {
    expect(buildReviewRisks("weekly", context)).toContain("Largest drawdown in closed journal records: 120.00 in account currency (3.4R).");
  });

  it("adds the share of the starting balance to the drawdown risk when known", () => {
    const withBalance = { ...context, metrics: { ...context.metrics, maxDrawdownPct: 0.012 } };

    expect(buildReviewMetrics(withBalance)).toMatchObject({ maxDrawdownPct: 0.012 });
    expect(buildReviewRisks("weekly", withBalance)).toContain(
      "Largest drawdown in closed journal records: 120.00 in account currency (3.4R, 1.2% of the starting balance)."
    );
  });

  it("names a drawdown known only in R (lot-based trades without money values)", () => {
    const rOnly = { ...context, metrics: { ...context.metrics, maxDrawdownAmount: 0, maxDrawdownR: 7.5 } };

    expect(buildReviewRisks("weekly", rOnly)).toContain("Largest drawdown in closed journal records: 7.5R (no money values recorded).");
  });
});
