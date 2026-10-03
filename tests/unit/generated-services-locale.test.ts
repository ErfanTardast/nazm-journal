import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/services/reviews", () => ({ getReviewFocus: vi.fn(async () => ({ overdueCount: 2 })) }));
vi.mock("@/lib/services/mistake-memory", () => ({ getMistakeMemory: vi.fn(async () => []) }));
vi.mock("@/lib/services/trades", () => ({
  getTradeMetrics: vi.fn(async () => ({ totalTrades: 5, winRate: 0.6, averageR: 0.2, profitFactor: 1.2, netPnl: 40 }))
}));
vi.mock("@/lib/services/playbook-adherence", () => ({
  getPlaybookAdherence: vi.fn(async () => [{ name: "پولبک", adherenceRate: 0.8, avgRMultiple: 0.5, tradeCount: 3 }])
}));
vi.mock("@/lib/services/portfolios", () => ({ listPortfolios: vi.fn(async () => []) }));
vi.mock("@/lib/services/sessions", () => ({ getActiveSession: vi.fn(async () => null) }));

import { prisma } from "@/lib/db/prisma";
import { getTradeMetrics } from "@/lib/services/trades";
import { getDashboardOverview } from "@/lib/services/dashboard";
import { getDisciplineOverview } from "@/lib/services/discipline";
import { getMentorReport } from "@/lib/services/mentor-report";

const PERSIAN_LETTER = /[؀-ۿ]/;

/** A week with a breached daily loss limit, two unplanned losing trades today and two losses in a row. */
function mockBadDay() {
  const tradeFindMany = vi.fn(async (args: { where: { status?: string } }) =>
    args.where.status === "closed"
      ? [{ realizedPnl: "-3" }, { realizedPnl: "-5" }, { realizedPnl: "12" }]
      : [
          { riskPercent: 2, realizedPnl: "-5", strategyId: null },
          { riskPercent: 1.5, realizedPnl: "-2", strategyId: null }
        ]
  );
  Object.assign(prisma, {
    tradePlan: { findMany: vi.fn(async () => []) },
    tradeJournalEntry: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    trade: { findMany: tradeFindMany, count: vi.fn(async () => 8) },
    user: { findUnique: vi.fn(async () => ({ riskPerTradePct: 1, maxDailyLossPct: 3 })) }
  });
}

describe("getDisciplineOverview in the language asked for", () => {
  beforeEach(mockBadDay);

  it("returns the prop-guard alerts and the discipline details in Persian for fa", async () => {
    const overview = await getDisciplineOverview("u1", "fa");

    expect(overview.propGuard.alerts.map((alert) => alert.key)).toEqual(["daily_loss_limit", "revenge_pattern", "unplanned_trades"]);
    for (const alert of overview.propGuard.alerts) expect(alert.message).toMatch(PERSIAN_LETTER);
    expect(overview.propGuard.alerts[0].message).toBe("به سقف ضرر روزانه رسیده‌اید: ۳٫۵٪ از حداکثر ۳٫۰٪.");
    expect(overview.propGuard.alerts[2].message).toBe("۲ معامله امروز بدون پلن مکتوب یا پلی‌بوک ثبت شده است.");
    const reviewCheck = overview.disciplineScore?.checks.find((check) => check.key === "review_consistency");
    expect(reviewCheck?.detail).toBe("۲ مرور عقب‌افتاده.");
  });

  it("keeps the English text for en and when no language is given", async () => {
    const english = await getDisciplineOverview("u1");

    expect(english.propGuard.alerts[0].message).toBe("Daily loss limit reached: 3.5% of 3.0% max.");
    expect(english.disciplineScore?.checks.find((check) => check.key === "review_consistency")?.detail).toBe("2 overdue reviews.");
    expect(await getDisciplineOverview("u1", "en")).toEqual(english);
  });
});

describe("getMentorReport in the language asked for", () => {
  beforeEach(mockBadDay);

  it("writes the report in Persian and labels the default period as the whole history", async () => {
    const report = await getMentorReport("u1", { locale: "fa" });

    expect(report.period).toBe("کل دوره");
    expect(report.headline).toContain("مرور فرایند برای کل دوره");
    expect(report.pnl).toMatch(/^سود و زیان خالص/);
    expect(report.playbookHighlight).toContain("«پولبک»");
    expect(report.disciplineNote).toMatch(/^درجه انضباط/);
    expect(report.disclaimer).toMatch(PERSIAN_LETTER);
  });

  it("keeps a period the caller gives, and the English report for en and no language", async () => {
    expect((await getMentorReport("u1", { locale: "fa", period: "weekly" })).period).toBe("weekly");

    const english = await getMentorReport("u1");
    expect(english.period).toBe("all time");
    expect(english.headline).toBe("Process review for all time: 5 trades, win rate 60.0%, average 0.20R.");
    expect(await getMentorReport("u1", { locale: "en" })).toEqual(english);
  });
});

describe("getDashboardOverview coaching summary in the language asked for", () => {
  beforeEach(() => {
    Object.assign(prisma, {
      watchlist: { findMany: vi.fn(async () => []) },
      trade: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
      alert: { count: vi.fn(async () => 0) },
      strategy: { count: vi.fn(async () => 0) },
      tradePlan: { findMany: vi.fn(async () => []) },
      idea: { findMany: vi.fn(async () => []) },
      tradeJournalEntry: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
      newsItem: { findMany: vi.fn(async () => []) },
      user: { findUnique: vi.fn(async () => null) }
    });
  });

  it("writes it in Persian for fa, with and without closed trades", async () => {
    vi.mocked(getTradeMetrics).mockResolvedValueOnce({ totalTrades: 0 } as never);
    expect((await getDashboardOverview("u1", "fa")).coachingSummary).toBe(
      "با افزودن معامله‌های برنامه‌ریزی‌شده و یادداشت‌های ژورنال شروع کنید. روی کیفیت فرایند تمرکز کنید، نه نتیجه."
    );

    vi.mocked(getTradeMetrics).mockResolvedValueOnce({ totalTrades: 12 } as never);
    expect((await getDashboardOverview("u1", "fa")).coachingSummary).toBe(
      "پیش از برنامه‌ریزی جلسه بعد، ۱۲ معامله بسته‌شده، اشتباه‌های تکراری و ثبات ریسک را مرور کنید."
    );
  });

  it("keeps the English summary for en and when no language is given", async () => {
    vi.mocked(getTradeMetrics).mockResolvedValueOnce({ totalTrades: 0 } as never);
    expect((await getDashboardOverview("u1")).coachingSummary).toBe(
      "Start by adding planned trades and journal entries. Focus on process quality before outcome."
    );

    vi.mocked(getTradeMetrics).mockResolvedValueOnce({ totalTrades: 12 } as never);
    expect((await getDashboardOverview("u1", "en")).coachingSummary).toBe(
      "Review 12 closed trades, repeated mistakes, and risk consistency before planning the next session."
    );
  });
});
