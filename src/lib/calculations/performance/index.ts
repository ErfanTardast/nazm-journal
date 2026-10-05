import { allBreakdowns, rowTradeIds } from "./breakdowns";
import { behaviour } from "./behaviour";
import { toEntries } from "./entries";
import { equitySeries, rHistogram } from "./series";
import { inPeriod, ownOrSample, summarize } from "./summary";
import { periodRange } from "./time";
import type { Dimension, PerformanceContext, PerformanceReport, PerformanceSnapshot, PerformanceTrade, PeriodKey } from "./types";

export type PerformanceInput = { period: PeriodKey; now: Date; timeZone: string; startingBalance: number | null };

/** The rows of the period and the headline over them, which both the report and the snapshot start from. */
function base(trades: PerformanceTrade[], input: PerformanceInput) {
  const { trades: own, source } = ownOrSample(trades);
  const range = periodRange(input.period, input.now, input.timeZone);
  const closed = inPeriod(own, range);
  const inside = new Set(closed.map((trade) => trade.id));
  // Trades that can hold a ladder entry back: still open, or closed outside the window.
  const outside = own.filter((trade) => (trade.status === "open" || trade.status === "closed") && !inside.has(trade.id));
  const context: PerformanceContext = {
    period: input.period,
    from: range.from?.toISOString() ?? null,
    to: input.now.toISOString(),
    timeZone: input.timeZone,
    source
  };
  const summary = summarize(closed, {
    openTrades: own.filter((trade) => trade.status === "open").length,
    startingBalance: input.startingBalance,
    // The starting balance belongs to the start of the history, so a share of it only makes sense for all time.
    withBalancePct: input.period === "all",
    outside
  });
  return { context, summary, closed, outside };
}

/** Everything the Performance page shows, for one period, from the trader's trades in any order. */
export function buildPerformanceReport(trades: PerformanceTrade[], input: PerformanceInput): PerformanceReport {
  const { context, summary, closed, outside } = base(trades, input);
  const { entries } = toEntries(closed, outside);
  return {
    context,
    summary,
    equity: equitySeries(closed),
    rHistogram: rHistogram(entries),
    breakdowns: allBreakdowns(entries, { timeZone: input.timeZone }),
    behaviour: behaviour(entries, { timeZone: input.timeZone })
  };
}

/**
 * The ids of the trades behind one breakdown row of the report for the same period: the same window, own-or-sample
 * rule, entries and time zone, so the count of entries in the row is the count the report shows.
 */
export function buildRowTradeIds(trades: PerformanceTrade[], input: PerformanceInput, dimension: Dimension, rowId: string): string[] {
  const { closed, outside } = base(trades, input);
  return rowTradeIds(toEntries(closed, outside).entries, dimension, rowId, { timeZone: input.timeZone });
}

/** The headline and the equity curve only, for the dashboard. */
export function buildPerformanceSnapshot(trades: PerformanceTrade[], input: PerformanceInput): PerformanceSnapshot {
  const { context, summary, closed } = base(trades, input);
  return { context, summary, equity: equitySeries(closed) };
}
