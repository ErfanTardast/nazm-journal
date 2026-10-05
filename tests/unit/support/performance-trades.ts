import { buildSampleWorkspace } from "@/lib/sample/build";
import type { PerformanceTrade } from "@/lib/calculations/performance/types";

let sequence = 0;

/**
 * A closed crypto long (entry 100, exit 101, stop 99, one unit: +1 money, 1R) that a test bends to its case. The
 * ids count up, so two trades from one test never share one.
 */
export function perfTrade(overrides: Partial<PerformanceTrade> = {}): PerformanceTrade {
  sequence += 1;
  return {
    id: `t${sequence}`,
    symbol: "BTCUSDT",
    market: "crypto",
    side: "long",
    status: "closed",
    entryPrice: 100,
    exitPrice: 101,
    stopLoss: 99,
    takeProfit: null,
    quantity: 1,
    fees: 0,
    riskAmount: null,
    riskPercent: null,
    rMultiple: null,
    realizedPnl: null,
    openedAt: "2026-10-01T10:00:00.000Z",
    closedAt: "2026-10-01T11:00:00.000Z",
    ladderKey: null,
    ladderLeg: null,
    ladderSize: null,
    strategyId: null,
    strategyName: null,
    session: null,
    setupType: null,
    ruleFollowed: "unknown",
    mistakes: [],
    emotionalState: null,
    isSample: false,
    ...overrides
  };
}

/** The sample month as analytics reads it: every row a closed sample trade, with its strategy name and journal words. */
export function sampleTrades(now: Date, locale: "en" | "fa" = "en"): PerformanceTrade[] {
  const sample = buildSampleWorkspace(now, locale);
  const names = new Map(sample.strategies.map((strategy) => [strategy.key, strategy.name]));
  return sample.trades.map((trade) => ({
    id: trade.key,
    symbol: trade.symbol,
    market: trade.market,
    side: trade.side,
    status: trade.status,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    stopLoss: trade.stopLoss,
    takeProfit: trade.takeProfit,
    quantity: trade.quantity,
    fees: trade.fees,
    riskAmount: trade.riskAmount,
    riskPercent: trade.riskPercent,
    rMultiple: trade.rMultiple,
    realizedPnl: trade.realizedPnl,
    openedAt: trade.openedAt.toISOString(),
    closedAt: trade.closedAt.toISOString(),
    ladderKey: null,
    ladderLeg: null,
    ladderSize: null,
    strategyId: trade.strategyKey,
    strategyName: names.get(trade.strategyKey) ?? null,
    session: trade.session,
    setupType: trade.setupType,
    ruleFollowed: trade.ruleFollowed,
    mistakes: trade.journal.mistakes,
    emotionalState: trade.journal.emotionalState,
    isSample: true
  }));
}
