import { calculateJournalMetrics, closedOutcome, isClosed } from "../journal";
import { toEntries } from "./entries";
import { LOW_SAMPLE_ENTRIES, type DataSource, type PerformanceEntry, type PerformanceSummary, type PerformanceTrade, type ResultGroup } from "./types";

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/**
 * Which rows analytics read. A trader's own rows win: as soon as one exists, every sample row is dropped (the
 * sample workspace and real trades can exist together for a moment). Only sample rows: they are used, and the
 * screens say so. No rows at all: "none".
 */
export function ownOrSample(trades: PerformanceTrade[]): { trades: PerformanceTrade[]; source: DataSource } {
  if (trades.some((trade) => !trade.isSample)) return { trades: trades.filter((trade) => !trade.isSample), source: "own" };
  return trades.length ? { trades, source: "sample" } : { trades: [], source: "none" };
}

const closeTime = (trade: PerformanceTrade) => Date.parse(trade.closedAt ?? trade.openedAt);

/**
 * The closed trades whose close time is in the window, in close order. A trade with no close time (a CSV can
 * leave it out) is placed by its open time. A window without a start ("all") keeps every closed trade, so it
 * counts what calculateJournalMetrics counts.
 */
export function inPeriod(trades: PerformanceTrade[], range: { from: Date | null; to: Date }): PerformanceTrade[] {
  const from = range.from?.getTime();
  const to = range.to.getTime();
  return trades
    .filter((trade) => isClosed(trade) && (from === undefined || (closeTime(trade) >= from && closeTime(trade) <= to)))
    .sort((a, b) => closeTime(a) - closeTime(b) || Date.parse(a.openedAt) - Date.parse(b.openedAt));
}

/** Wins, losses and money for a set of entries: wins over all of them, money and R over the ones that have them. */
export function resultGroup(entries: PerformanceEntry[]): ResultGroup {
  const wins = entries.filter((entry) => entry.sign > 0).length;
  const pnls = entries.flatMap((entry) => (entry.pnl === null ? [] : [entry.pnl]));
  const rs = entries.flatMap((entry) => (entry.r === null ? [] : [entry.r]));
  return {
    entries: entries.length,
    wins,
    losses: entries.filter((entry) => entry.sign < 0).length,
    winRate: entries.length ? wins / entries.length : null,
    netPnl: sum(pnls),
    averageR: rs.length ? sum(rs) / rs.length : null
  };
}

/**
 * The headline of a period. The money, win rate, R and drawdown come from calculateJournalMetrics, per closed
 * trade, so they match GET /api/trades/metrics to the cent; what that function folds into 0 (no money, no R, no
 * trades) is null here, with the counts that say why. `outside` is every other trade that can hold a ladder
 * entry back (see toEntries).
 */
export function summarize(
  closed: PerformanceTrade[],
  options: { openTrades: number; startingBalance: number | null; withBalancePct: boolean; outside?: PerformanceTrade[] }
): PerformanceSummary {
  const metrics = calculateJournalMetrics(closed, { startingBalance: options.withBalancePct ? options.startingBalance : null });
  const outcomes = closed.filter(isClosed).map(closedOutcome);
  const withMoney = outcomes.filter((outcome) => outcome.pnl !== undefined).length;
  const withR = outcomes.filter((outcome) => outcome.r !== undefined).length;

  const { entries, combined, pendingLegs } = toEntries(closed, options.outside);
  const group = resultGroup(entries);
  const entryPnls = entries.flatMap((entry) => (entry.pnl === null ? [] : [entry.pnl]));
  const count = (verdict: PerformanceEntry["ruleFollowed"]) => entries.filter((entry) => entry.ruleFollowed === verdict).length;
  const [followed, mixed, broken] = [count("followed"), count("mixed"), count("broken")];

  return {
    closedTrades: metrics.totalTrades,
    openTrades: options.openTrades,
    unpricedClosed: metrics.totalTrades - withMoney,
    withoutR: metrics.totalTrades - withR,
    wins: metrics.wins,
    losses: metrics.losses,
    breakeven: metrics.totalTrades - metrics.wins - metrics.losses,
    winRate: metrics.totalTrades ? metrics.winRate : null,
    grossProfit: metrics.grossProfit,
    grossLoss: metrics.grossLoss,
    netPnl: metrics.netPnl,
    profitFactor: metrics.grossLoss > 0 ? metrics.profitFactor : null,
    profitFactorState: metrics.grossLoss > 0 ? "value" : metrics.grossProfit > 0 ? "no_losses" : "no_results",
    expectancy: withMoney ? metrics.expectancy : null,
    averageR: withR ? metrics.averageR : null,
    maxDrawdownAmount: metrics.maxDrawdownAmount,
    maxDrawdownR: metrics.maxDrawdownR,
    maxDrawdownPct: metrics.maxDrawdownPct,
    entries: {
      count: group.entries,
      combined,
      pendingLegs,
      wins: group.wins,
      losses: group.losses,
      winRate: group.winRate,
      netPnl: group.netPnl,
      averageR: group.averageR,
      expectancy: entryPnls.length ? sum(entryPnls) / entryPnls.length : null
    },
    adherence: { followed, mixed, broken, unknown: entries.length - followed - mixed - broken, rate: followed + mixed + broken ? followed / (followed + mixed + broken) : null },
    lowSample: entries.length < LOW_SAMPLE_ENTRIES
  };
}
