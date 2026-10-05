import { closedOutcome, isClosed } from "../journal";
import type { EquityPoint, PerformanceEntry, PerformanceTrade, RBucketKey, RHistogram } from "./types";

const closeTime = (trade: PerformanceTrade) => Date.parse(trade.closedAt ?? trade.openedAt);

/**
 * One point per closed trade with a money result, in close order (the order inPeriod gives, and the one
 * calculateJournalMetrics folds in, so the deepest drawdown here is the headline's maximum drawdown).
 * `equity` is the running total of the money results and `drawdown` is how far it sits below the highest
 * total so far, counting the starting zero as a total. `n` is the trade's number among every closed trade of
 * the input, so an unpriced trade keeps its number and has no point: a jump in `n` shows the gap.
 */
export function equitySeries(closed: PerformanceTrade[]): EquityPoint[] {
  const ordered = closed
    .filter(isClosed)
    .sort((a, b) => closeTime(a) - closeTime(b) || Date.parse(a.openedAt) - Date.parse(b.openedAt));
  const points: EquityPoint[] = [];
  let equity = 0;
  let peak = 0;
  ordered.forEach((trade, index) => {
    const { pnl } = closedOutcome(trade);
    if (pnl === undefined) return;
    equity += pnl;
    peak = Math.max(peak, equity);
    points.push({ n: index + 1, tradeId: trade.id, at: trade.closedAt ?? trade.openedAt, pnl, equity, drawdown: peak - equity });
  });
  return points;
}

const R_BUCKETS: { key: RBucketKey; from: number | null; to: number | null }[] = [
  { key: "lt_-2", from: null, to: -2 },
  { key: "-2_-1", from: -2, to: -1 },
  { key: "-1_0", from: -1, to: 0 },
  { key: "0_1", from: 0, to: 1 },
  { key: "1_2", from: 1, to: 2 },
  { key: "2_3", from: 2, to: 3 },
  { key: "ge_3", from: 3, to: null }
];

/**
 * Entries by their R in the seven buckets of RBucketKey, the lower bound included (a plain stop-out at -1R is in
 * "-1 to 0"; a loss bigger than planned shows in "-2 to -1"). R is rounded to 4 decimals first, so float noise
 * cannot push an entry across a bound. Entries with no R are counted apart, in `withoutR`.
 */
export function rHistogram(entries: PerformanceEntry[]): RHistogram {
  const counts = R_BUCKETS.map(() => 0);
  let withoutR = 0;
  for (const entry of entries) {
    if (entry.r === null) {
      withoutR += 1;
      continue;
    }
    const r = Math.round(entry.r * 10_000) / 10_000;
    const index = R_BUCKETS.findIndex((bucket) => (bucket.from === null || r >= bucket.from) && (bucket.to === null || r < bucket.to));
    counts[index] += 1;
  }
  return { buckets: R_BUCKETS.map((bucket, index) => ({ ...bucket, count: counts[index] })), withoutR };
}
