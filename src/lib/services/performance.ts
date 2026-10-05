import { buildPerformanceReport, buildPerformanceSnapshot, buildRowTradeIds } from "@/lib/calculations/performance";
import type { Dimension, PerformanceReport, PerformanceSnapshot, PerformanceTrade, PeriodKey } from "@/lib/calculations/performance/types";
import { prisma } from "@/lib/db/prisma";
import { isSupportedTimeZone } from "@/lib/time/zones";
import { toNumber } from "./serializers";

type PerformanceUser = { id: string; timezone: string };

/**
 * Every trade of the user as analytics reads it, in close order: the numbers, the times, the strategy's name and
 * the journal entry's tags and emotion. It selects no notes and no screenshots (the report never shows them).
 */
export async function loadPerformanceTrades(userId: string): Promise<PerformanceTrade[]> {
  const rows = await prisma.trade.findMany({
    where: { userId },
    orderBy: [{ closedAt: "asc" }, { openedAt: "asc" }],
    select: {
      id: true,
      symbol: true,
      market: true,
      side: true,
      status: true,
      entryPrice: true,
      exitPrice: true,
      stopLoss: true,
      takeProfit: true,
      quantity: true,
      fees: true,
      riskAmount: true,
      riskPercent: true,
      rMultiple: true,
      realizedPnl: true,
      openedAt: true,
      closedAt: true,
      ladderKey: true,
      ladderLeg: true,
      ladderSize: true,
      strategyId: true,
      session: true,
      setupType: true,
      ruleFollowed: true,
      isSample: true,
      strategy: { select: { name: true } },
      journalEntry: { select: { mistakes: true, emotionalState: true } }
    }
  });
  return rows.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    market: row.market,
    side: row.side,
    status: row.status,
    entryPrice: Number(row.entryPrice),
    exitPrice: toNumber(row.exitPrice),
    stopLoss: toNumber(row.stopLoss),
    takeProfit: toNumber(row.takeProfit),
    quantity: Number(row.quantity),
    fees: Number(row.fees),
    riskAmount: toNumber(row.riskAmount),
    riskPercent: toNumber(row.riskPercent),
    rMultiple: toNumber(row.rMultiple),
    realizedPnl: toNumber(row.realizedPnl),
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    ladderKey: row.ladderKey,
    ladderLeg: row.ladderLeg,
    ladderSize: row.ladderSize,
    strategyId: row.strategyId,
    strategyName: row.strategy?.name ?? null,
    session: row.session,
    setupType: row.setupType,
    ruleFollowed: row.ruleFollowed,
    mistakes: row.journalEntry?.mistakes ?? [],
    emotionalState: row.journalEntry?.emotionalState ?? null,
    isSample: row.isSample
  }));
}

/** The trades, the starting balance and the zone the pure functions need; a zone the runtime does not know reads as UTC. */
async function load(user: PerformanceUser, now: Date) {
  const [trades, account] = await Promise.all([
    loadPerformanceTrades(user.id),
    prisma.user.findUnique({ where: { id: user.id }, select: { startingBalance: true } })
  ]);
  return {
    trades,
    input: {
      now,
      timeZone: isSupportedTimeZone(user.timezone) ? user.timezone : "UTC",
      startingBalance: toNumber(account?.startingBalance)
    }
  };
}

/** The full report for the Performance page. */
export async function getPerformanceReport(user: PerformanceUser, options: { period: PeriodKey; now?: Date }): Promise<PerformanceReport> {
  const { trades, input } = await load(user, options.now ?? new Date());
  return buildPerformanceReport(trades, { ...input, period: options.period });
}

/** The ids of the trades behind one breakdown row of the report for the same period, for the journal to show them. */
export async function getPerformanceRowTradeIds(
  user: PerformanceUser,
  options: { period: PeriodKey; dimension: Dimension; row: string; now?: Date }
): Promise<string[]> {
  const { trades, input } = await load(user, options.now ?? new Date());
  return buildRowTradeIds(trades, { ...input, period: options.period }, options.dimension, options.row);
}

/** The headline and equity curve for the dashboard (the last 30 days unless told otherwise). */
export async function getPerformanceSnapshot(user: PerformanceUser, options: { period?: PeriodKey; now?: Date } = {}): Promise<PerformanceSnapshot> {
  const { trades, input } = await load(user, options.now ?? new Date());
  return buildPerformanceSnapshot(trades, { ...input, period: options.period ?? "30d" });
}
