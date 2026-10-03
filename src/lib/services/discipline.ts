import { prisma } from "@/lib/db/prisma";
import { calculateDisciplineScore } from "@/lib/calculations/discipline";
import { checkPropGuard } from "@/lib/calculations/prop-guard";
import { getMistakeMemory } from "./mistake-memory";
import { getReviewFocus } from "./reviews";
import type { Locale } from "@/lib/i18n/locales";

/** `locale` is the language of the alert and check sentences; English when a caller gives none. */
export async function getDisciplineOverview(userId: string, locale: Locale = "en") {
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [
    plansThisWeek,
    tradesThisWeek,
    todayTrades,
    closedTotal,
    closedWithJournal,
    recentJournal,
    user,
    reviewFocus,
    mistakePatterns,
    recentClosed
  ] = await Promise.all([
    prisma.tradePlan.findMany({
      where: { userId, createdAt: { gte: weekStart } },
      select: { riskAmount: true, riskPercent: true, invalidationRule: true, checklist: true }
    }),
    // Trades opened this week, not journal rows created this week (an import creates old trades' rows today).
    prisma.tradeJournalEntry.findMany({
      where: { userId, trade: { openedAt: { gte: weekStart } } },
      select: { ruleFollowed: true }
    }),
    prisma.trade.findMany({
      where: { userId, openedAt: { gte: dayStart } },
      select: { riskPercent: true, realizedPnl: true, strategyId: true }
    }),
    prisma.trade.count({ where: { userId, status: "closed" } }),
    // Journaled means the lesson is written (as the dashboard's journal follow-up counts it), not that an
    // entry row exists: every trade, imported ones included, gets an entry when it is created.
    prisma.tradeJournalEntry.count({
      where: { userId, trade: { status: "closed" }, lessonsLearned: { not: null }, NOT: { lessonsLearned: "" } }
    }),
    prisma.tradeJournalEntry.findMany({
      where: { userId, trade: { openedAt: { gte: weekStart } } },
      select: { mistakes: true },
      orderBy: { trade: { openedAt: "desc" } },
      take: 20
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { riskPerTradePct: true, maxDailyLossPct: true }
    }),
    getReviewFocus(userId),
    getMistakeMemory(userId, 7),
    prisma.trade.findMany({
      where: { userId, status: "closed", closedAt: { gte: weekStart } },
      orderBy: { closedAt: "desc" },
      take: 5,
      select: { realizedPnl: true }
    })
  ]);

  // Discipline score inputs
  const followedRulesCount = tradesThisWeek.filter((e) => e.ruleFollowed === "followed").length;
  const brokenRulesCount = tradesThisWeek.filter((e) => e.ruleFollowed === "broken").length;
  const mixedRulesCount = tradesThisWeek.filter((e) => e.ruleFollowed === "mixed").length;
  const unreviewedRulesCount = tradesThisWeek.filter((e) => e.ruleFollowed === "unknown").length;

  const allMistakes = recentJournal.flatMap((e) => e.mistakes);
  const mistakeFrequency = allMistakes.reduce<Map<string, number>>((m, v) => {
    const key = v.trim();
    if (key) m.set(key, (m.get(key) ?? 0) + 1);
    return m;
  }, new Map());
  const repeatedMistakeCount = [...mistakeFrequency.values()].filter((n) => n >= 2).length;

  const completePlans = plansThisWeek.filter((p) => {
    const checks = Object.values((p.checklist as Record<string, unknown>) ?? {});
    return (
      Boolean(p.invalidationRule?.trim()) &&
      (Number(p.riskAmount ?? 0) > 0 || Number(p.riskPercent ?? 0) > 0) &&
      checks.length > 0 &&
      checks.every(Boolean)
    );
  });

  const disciplineScore = calculateDisciplineScore(
    {
      totalPlansThisWeek: plansThisWeek.length,
      completePlansThisWeek: completePlans.length,
      totalTradesThisWeek: tradesThisWeek.length,
      followedRulesCount,
      brokenRulesCount,
      mixedRulesCount,
      unreviewedRulesCount,
      closedTradesTotal: closedTotal,
      closedTradesWithJournal: closedWithJournal,
      repeatedMistakeCount,
      overdueReviews: reviewFocus.overdueCount
    },
    locale
  );

  // Prop guard inputs
  const maxDailyLossPct = Number(user?.maxDailyLossPct ?? 0);
  const riskPerTradePct = Number(user?.riskPerTradePct ?? 0);
  const todayLossTotal = todayTrades
    .filter((t) => Number(t.realizedPnl ?? 0) < 0)
    .reduce((sum, t) => sum + Number(t.riskPercent ?? riskPerTradePct ?? 0), 0);
  const todayUnplanned = todayTrades.filter((t) => !t.strategyId).length;
  // The guard's consecutive-loss check needs results (true = not a loss), oldest first.
  const recentResults = recentClosed
    .filter((t) => t.realizedPnl !== null)
    .reverse()
    .map((t) => Number(t.realizedPnl) >= 0);

  const propGuard = checkPropGuard(
    {
      maxDailyLossPct,
      riskPerTradePct,
      todayLossPct: todayLossTotal,
      todayTradeCount: todayTrades.length,
      maxDailyTrades: null,
      recentResults: recentResults.slice(-5),
      todayUnplannedCount: todayUnplanned
    },
    locale
  );

  return {
    disciplineScore,
    propGuard,
    mistakePatterns,
    weekSummary: {
      totalPlans: plansThisWeek.length,
      completePlans: completePlans.length,
      totalTrades: tradesThisWeek.length,
      followedRules: followedRulesCount,
      brokenRules: brokenRulesCount,
      mixedRules: mixedRulesCount,
      unreviewedRules: unreviewedRulesCount
    }
  };
}
