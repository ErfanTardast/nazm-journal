import { prisma } from "@/lib/db/prisma";
import { calculateReadiness } from "@/lib/calculations/readiness";
import { getTradeMetrics } from "./trades";
import { listPortfolios } from "./portfolios";
import { getReviewFocus } from "./reviews";
import { getActiveSession } from "./sessions";
import type { Locale } from "@/lib/i18n/locales";
import { formatGeneratedNumber } from "./locale";

/** `locale` is the language of the coaching summary sentence; English when a caller gives none. */
export async function getDashboardOverview(userId: string, locale: Locale = "en") {
  const disciplineWindowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [
    metrics,
    portfolios,
    watchlists,
    openTrades,
    activeAlerts,
    strategies,
    plannedTrades,
    openIdeas,
    recentJournal,
    news,
    reviewFocus,
    user,
    missingJournalCount,
    incompleteJournalCount,
    ruleViolations,
    activeSession
  ] = await Promise.all([
    getTradeMetrics(userId),
    listPortfolios(userId),
    prisma.watchlist.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { updatedAt: "desc" },
      take: 3
    }),
    prisma.trade.count({ where: { userId, status: "open" } }),
    prisma.alert.count({ where: { userId, status: "active" } }),
    prisma.strategy.count({ where: { userId, isActive: true } })
    ,
    prisma.tradePlan.findMany({
      where: { userId, status: { in: ["planned", "active"] } },
      orderBy: { plannedFor: "asc" },
      take: 5
    }),
    prisma.idea.findMany({ where: { userId, status: { in: ["draft", "watching"] } }, orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.tradeJournalEntry.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 5, include: { trade: true } }),
    prisma.newsItem.findMany({ orderBy: { publishedAt: "desc" }, take: 5 }),
    getReviewFocus(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { riskPerTradePct: true, maxDailyLossPct: true, maxWeeklyLossPct: true }
    }),
    prisma.trade.count({
      where: { userId, status: "closed", journalEntry: { is: null } }
    }),
    prisma.tradeJournalEntry.count({
      where: {
        userId,
        trade: { status: "closed" },
        OR: [{ lessonsLearned: null }, { lessonsLearned: "" }]
      }
    }),
    // Rule breaks of trades opened in the window: reviewing an old trade today is not a recent break.
    prisma.tradeJournalEntry.count({
      where: { userId, ruleFollowed: "broken", trade: { openedAt: { gte: disciplineWindowStart } } }
    }),
    getActiveSession(userId)
  ]);

  const cashBalance = portfolios.reduce((sum, portfolio) => sum + Number(portfolio.cashBalance ?? 0), 0);
  const realizedPnl = portfolios.reduce(
    (sum, portfolio) => sum + portfolio.holdings.reduce((holdingSum, holding) => holdingSum + Number(holding.realizedPnl ?? 0), 0),
    0
  );
  const riskPerTradePct = Number(user?.riskPerTradePct ?? 0);
  const maxDailyLossPct = Number(user?.maxDailyLossPct ?? 0);
  const maxWeeklyLossPct = Number(user?.maxWeeklyLossPct ?? 0);
  const riskDefaultsValid =
    riskPerTradePct > 0 &&
    maxDailyLossPct >= riskPerTradePct &&
    maxWeeklyLossPct >= maxDailyLossPct;
  const completePlans = plannedTrades.filter(isCompletePlan);
  const journalFollowUps = missingJournalCount + incompleteJournalCount;
  const readiness = calculateReadiness({
    hasCompletePlan: completePlans.length > 0,
    riskDefaultsValid,
    overdueReviews: reviewFocus.overdueCount,
    ruleViolations,
    journalFollowUps
  });
  const repeatedMistakes = topValues(recentJournal.flatMap((entry) => entry.mistakes), 5);

  return {
    metrics,
    portfolioSummary: {
      count: portfolios.length,
      cashBalance,
      realizedPnl
    },
    watchlists,
    openTrades,
    activeAlerts,
    activeStrategies: strategies,
    plannedTrades,
    openIdeas,
    recentJournal,
    repeatedMistakes,
    ruleViolations,
    journalFollowUps,
    completePlanCount: completePlans.length,
    riskDefaults: {
      riskPerTradePct,
      maxDailyLossPct,
      maxWeeklyLossPct,
      valid: riskDefaultsValid
    },
    readiness,
    reviewFocus,
    activeSession,
    marketContext: news,
    coachingSummary: buildCoachingSummary(metrics.totalTrades, locale)
  };
}

function buildCoachingSummary(closedTrades: number, locale: Locale) {
  if (locale === "fa") {
    return closedTrades === 0
      ? "با افزودن معامله‌های برنامه‌ریزی‌شده و یادداشت‌های ژورنال شروع کنید. روی کیفیت فرایند تمرکز کنید، نه نتیجه."
      : `پیش از برنامه‌ریزی جلسه بعد، ${formatGeneratedNumber(closedTrades, 0, locale)} معامله بسته‌شده، اشتباه‌های تکراری و ثبات ریسک را مرور کنید.`;
  }
  return closedTrades === 0
    ? "Start by adding planned trades and journal entries. Focus on process quality before outcome."
    : `Review ${closedTrades} closed trades, repeated mistakes, and risk consistency before planning the next session.`;
}

function isCompletePlan(plan: {
  riskAmount: unknown;
  riskPercent: unknown;
  invalidationRule: string | null;
  checklist: unknown;
}) {
  const checklist =
    typeof plan.checklist === "object" && plan.checklist !== null
      ? Object.values(plan.checklist as Record<string, unknown>)
      : [];

  return (
    Boolean(plan.invalidationRule?.trim()) &&
    (Number(plan.riskAmount ?? 0) > 0 || Number(plan.riskPercent ?? 0) > 0) &&
    checklist.length > 0 &&
    checklist.every(Boolean)
  );
}

function topValues(values: string[], limit: number) {
  const counts = values.reduce<Map<string, number>>((map, rawValue) => {
    const value = rawValue.trim();
    if (value) map.set(value, (map.get(value) ?? 0) + 1);
    return map;
  }, new Map());

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => value);
}
