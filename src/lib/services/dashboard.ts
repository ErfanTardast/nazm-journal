import { prisma } from "@/lib/db/prisma";
import { calculateReadiness } from "@/lib/calculations/readiness";
import { toEntries } from "@/lib/calculations/performance/entries";
import { buildPerformanceSnapshot } from "@/lib/calculations/performance";
import { inPeriod, ownOrSample } from "@/lib/calculations/performance/summary";
import { dayKey, periodRange, startOfDay } from "@/lib/calculations/performance/time";
import type { PerformanceTrade } from "@/lib/calculations/performance/types";
import { todayRisk, traderZone } from "@/lib/calculations/today-risk";
import { weekFocus, weekFocusInput } from "@/lib/calculations/week-focus";
import type { Locale } from "@/lib/i18n/locales";
import { loadPerformanceTrades } from "./performance";
import { getReviewFocus } from "./reviews";
import { toNumber } from "./serializers";
import { getActiveSession } from "./sessions";

/** How many of the latest trades the dashboard lists. */
const RECENT_TRADES = 5;

/**
 * Everything the dashboard shows, in one payload (the screen makes no other request for its blocks). Today and the
 * 7 and 30 day windows are the trader's own: midnight in the zone saved in Settings (`timeZone`; UTC when it is
 * missing or unknown here). The language only matters for the readiness sentences, which come from the calculation.
 */
export async function getDashboardOverview(userId: string, _locale: Locale = "en", options: { timeZone?: string; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { riskPerTradePct: true, maxDailyLossPct: true, maxWeeklyLossPct: true, startingBalance: true, timezone: true }
  });
  const timeZone = traderZone(options.timeZone ?? user?.timezone);
  const today = dayKey(now, timeZone);
  const dayStart = startOfDay(today, timeZone);
  const weekStart = periodRange("7d", now, timeZone).from ?? dayStart;

  const [trades, openReviews, plannedTrades, reviewFocus, missingJournalCount, incompleteJournalCount, ruleViolations, activeSession] = await Promise.all([
    loadPerformanceTrades(userId),
    prisma.review.count({ where: { userId, status: "open" } }),
    // Every active plan: the counts cover all of them, and the dashboard names the next one.
    prisma.tradePlan.findMany({
      where: { userId, status: { in: ["planned", "active"] } },
      orderBy: { plannedFor: "asc" },
      select: { id: true, symbol: true, market: true, bias: true, status: true, plannedFor: true, invalidationRule: true, riskAmount: true, riskPercent: true, checklist: true }
    }),
    getReviewFocus(userId),
    prisma.trade.count({ where: { userId, status: "closed", journalEntry: { is: null } } }),
    prisma.tradeJournalEntry.count({
      where: {
        userId,
        trade: { status: "closed" },
        OR: [{ lessonsLearned: null }, { lessonsLearned: "" }]
      }
    }),
    // Rule breaks of trades opened in the window, read from Trade.ruleFollowed like every other count of them:
    // reviewing an old trade today is not a recent break.
    prisma.trade.count({ where: { userId, ruleFollowed: "broken", openedAt: { gte: weekStart } } }),
    getActiveSession(userId)
  ]);

  const riskPerTradePct = Number(user?.riskPerTradePct ?? 0);
  const maxDailyLossPct = Number(user?.maxDailyLossPct ?? 0);
  const maxWeeklyLossPct = Number(user?.maxWeeklyLossPct ?? 0);
  const startingBalance = toNumber(user?.startingBalance);
  const riskDefaultsValid = riskPerTradePct > 0 && maxDailyLossPct >= riskPerTradePct && maxWeeklyLossPct >= maxDailyLossPct;

  const plans = summarizePlans(plannedTrades, { today, dayStart, timeZone });
  const journalFollowUps = missingJournalCount + incompleteJournalCount;
  const readiness = calculateReadiness({
    hasCompletePlan: plans.completeCount > 0,
    riskDefaultsValid,
    overdueReviews: reviewFocus.overdueCount,
    ruleViolations,
    journalFollowUps
  });

  const { trades: own } = ownOrSample(trades);
  const input = { now, timeZone, startingBalance };

  return {
    /** Every trade the trader has, in any status: with none and no plan the account is new. */
    tradeCount: trades.length,
    openTrades: trades.filter((trade) => trade.status === "open").length,
    ruleViolations,
    journalFollowUps,
    riskDefaults: { riskPerTradePct, maxDailyLossPct, maxWeeklyLossPct, valid: riskDefaultsValid },
    readiness,
    reviewFocus,
    activeSession,
    /** Today's result against the daily limit: the same figure the trading guard raises its alert from. */
    today: todayRisk(trades, { timeZone, now, maxDailyLossPct, riskPerTradePct, startingBalance }),
    performance: buildPerformanceSnapshot(trades, { ...input, period: "30d" }),
    recentTrades: recentTrades(own),
    reviewTasks: {
      openCount: openReviews,
      overdueCount: reviewFocus.overdueCount,
      next: reviewFocus.review
        ? { id: reviewFocus.review.id, title: reviewFocus.review.title, type: reviewFocus.review.type, periodEnd: reviewFocus.review.periodEnd.toISOString() }
        : null
    },
    plans,
    focus: weekFocus(weekFocusInput(weekEntries(own, now, timeZone), { timeZone }))
  };
}

/** The closed entries of the last 7 days (today and the six days before), as the Performance page reads them. */
function weekEntries(own: PerformanceTrade[], now: Date, timeZone: string) {
  const closed = inPeriod(own, periodRange("7d", now, timeZone));
  const inside = new Set(closed.map((trade) => trade.id));
  // Trades that can hold a ladder entry back: still open, or closed outside the window.
  const outside = own.filter((trade) => (trade.status === "open" || trade.status === "closed") && !inside.has(trade.id));
  return toEntries(closed, outside).entries;
}

/** The latest trades by close time (an open trade by its open time), newest first. `reviewed` is the review editor's own rule. */
function recentTrades(own: PerformanceTrade[]) {
  const at = (trade: PerformanceTrade) => Date.parse(trade.closedAt ?? trade.openedAt);
  return own
    .filter((trade) => trade.status === "open" || trade.status === "closed")
    .sort((a, b) => at(b) - at(a) || (a.id < b.id ? 1 : -1))
    .slice(0, RECENT_TRADES)
    .map((trade) => ({
      id: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      status: trade.status,
      closedAt: trade.closedAt,
      realizedPnl: trade.realizedPnl,
      rMultiple: trade.rMultiple,
      reviewed: trade.ruleFollowed !== "unknown"
    }));
}

type PlanRow = {
  id: string;
  symbol: string;
  market: string;
  bias: string;
  status: string;
  plannedFor: Date | null;
  invalidationRule: string | null;
  riskAmount: unknown;
  riskPercent: unknown;
  checklist: unknown;
};

/**
 * The active plans in numbers: how many there are, how many are complete (all of them, not a first page), how many
 * are for today in the trader's zone, and the one to look at next: the soonest from today on, else one with no date,
 * else the most recent older one.
 */
function summarizePlans(rows: PlanRow[], when: { today: string; dayStart: Date; timeZone: string }) {
  const rank = (plan: PlanRow) => (plan.plannedFor === null ? 1 : plan.plannedFor >= when.dayStart ? 0 : 2);
  const next = [...rows].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    if (ra !== rb) return ra - rb;
    if (ra === 2) return (b.plannedFor?.getTime() ?? 0) - (a.plannedFor?.getTime() ?? 0);
    return (a.plannedFor?.getTime() ?? 0) - (b.plannedFor?.getTime() ?? 0);
  })[0];
  return {
    todayCount: rows.filter((plan) => plan.plannedFor !== null && dayKey(plan.plannedFor, when.timeZone) === when.today).length,
    activeCount: rows.length,
    completeCount: rows.filter(isCompletePlan).length,
    next: next
      ? {
          id: next.id,
          symbol: next.symbol,
          market: next.market,
          bias: next.bias,
          status: next.status,
          plannedFor: next.plannedFor?.toISOString() ?? null,
          invalidationRule: next.invalidationRule,
          riskPercent: toNumber(next.riskPercent)
        }
      : null
  };
}

function isCompletePlan(plan: Pick<PlanRow, "riskAmount" | "riskPercent" | "invalidationRule" | "checklist">) {
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
