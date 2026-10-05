import { describe, expect, it } from "vitest";
import { toEntries } from "@/lib/calculations/performance/entries";
import { equitySeries, rHistogram } from "@/lib/calculations/performance/series";
import { summarize } from "@/lib/calculations/performance/summary";
import { perfTrade, sampleTrades } from "./support/performance-trades";

const NOW = new Date("2026-10-04T10:00:00Z");
const none = { openTrades: 0, startingBalance: null, withBalancePct: false };

/** A priced trade closing at the given minute of 1 October, with the money and R it is told to have. */
function closing(minute: number, pnl: number, overrides: Parameters<typeof perfTrade>[0] = {}) {
  return perfTrade({
    realizedPnl: pnl,
    rMultiple: pnl / 100,
    riskAmount: 100,
    openedAt: "2026-10-01T09:00:00.000Z",
    closedAt: new Date(Date.UTC(2026, 9, 1, 10, minute)).toISOString(),
    ...overrides
  });
}

describe("equitySeries", () => {
  it("runs the money total and the distance below the highest total so far, from zero", () => {
    const series = equitySeries([closing(0, -50), closing(1, 30), closing(2, 100), closing(3, -40), closing(4, -20)]);
    expect(series.map((point) => point.pnl)).toEqual([-50, 30, 100, -40, -20]);
    expect(series.map((point) => point.equity)).toEqual([-50, -20, 80, 40, 20]);
    // The first loss is below the starting zero; the later ones are below the peak of 80.
    expect(series.map((point) => point.drawdown)).toEqual([50, 20, 0, 40, 60]);
    expect(series.map((point) => point.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it("carries the trade and its close time on each point", () => {
    const trade = closing(7, 12);
    expect(equitySeries([trade])).toEqual([{ n: 1, tradeId: trade.id, at: trade.closedAt, pnl: 12, equity: 12, drawdown: 0 }]);
  });

  it("is empty with no closed trades", () => {
    expect(equitySeries([])).toEqual([]);
    expect(equitySeries([perfTrade({ status: "open", exitPrice: null, closedAt: null })])).toEqual([]);
  });

  it("keeps an unpriced trade's number but gives it no point, so n shows the gap", () => {
    const unpriced = closing(1, 0, { market: "forex", symbol: "EURUSD", quantity: 0.1, stopLoss: null, entryPrice: 1.1, exitPrice: 1.105, realizedPnl: null, rMultiple: null, riskAmount: null });
    const [a, b, c] = [closing(0, 40), closing(2, -10), closing(3, 5)];
    const series = equitySeries([a, unpriced, b, c]);
    expect(series.map((point) => [point.n, point.tradeId])).toEqual([[1, a.id], [3, b.id], [4, c.id]]);
    expect(series.map((point) => point.equity)).toEqual([40, 30, 35]);
  });

  it("puts the trades in close order and does not touch the list it was given", () => {
    const [late, early] = [closing(30, 10), closing(5, 20)];
    const input = [late, early];
    expect(equitySeries(input).map((point) => [point.n, point.tradeId, point.equity])).toEqual([[1, early.id, 20], [2, late.id, 30]]);
    expect(input).toEqual([late, early]);
  });

  it("places a trade with no close time by its open time", () => {
    const noClose = closing(0, 5, { closedAt: null, openedAt: "2026-10-01T10:15:00.000Z", exitPrice: 101 });
    const after = closing(30, 7);
    const series = equitySeries([after, noClose]);
    expect(series.map((point) => point.tradeId)).toEqual([noClose.id, after.id]);
    expect(series[0].at).toBe("2026-10-01T10:15:00.000Z");
  });

  it("counts every leg of a ladder as its own trade, as the headline does", () => {
    const legs = [1, 2, 3].map((leg) => closing(leg, 10, { ladderKey: "k", ladderLeg: leg, ladderSize: 3 }));
    expect(equitySeries(legs).map((point) => point.equity)).toEqual([10, 20, 30]);
  });

  describe("on the sample month", () => {
    const trades = sampleTrades(NOW);
    const series = equitySeries(trades);
    const summary = summarize(trades, none);

    it("has a point for every trade", () => {
      expect(series).toHaveLength(30);
      expect(series.map((point) => point.n)).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
    });

    it("ends at the net P&L", () => {
      expect(series[series.length - 1].equity).toBeCloseTo(summary.netPnl, 9);
    });

    it("has its deepest drawdown at the headline's maximum drawdown", () => {
      expect(Math.max(...series.map((point) => point.drawdown))).toBe(summary.maxDrawdownAmount);
      expect(summary.maxDrawdownAmount).toBeGreaterThan(0);
    });

    it("never has a negative drawdown", () => {
      expect(series.every((point) => point.drawdown >= 0)).toBe(true);
    });
  });
});

describe("rHistogram", () => {
  const entriesOf = (rs: (number | null)[]) =>
    toEntries(rs.map((r, index) => closing(index, r === null ? 0 : r * 100, r === null ? { stopLoss: null, rMultiple: null, riskAmount: null, market: "forex", symbol: "EURUSD", quantity: 0.1, entryPrice: 1.1, exitPrice: 1.105, realizedPnl: null } : {}))).entries;
  const counts = (rs: (number | null)[]) => rHistogram(entriesOf(rs)).buckets.map((bucket) => bucket.count);

  it("has the seven buckets, with the bounds each one covers", () => {
    expect(rHistogram([]).buckets.map((bucket) => [bucket.key, bucket.from, bucket.to])).toEqual([
      ["lt_-2", null, -2],
      ["-2_-1", -2, -1],
      ["-1_0", -1, 0],
      ["0_1", 0, 1],
      ["1_2", 1, 2],
      ["2_3", 2, 3],
      ["ge_3", 3, null]
    ]);
    expect(rHistogram([]).withoutR).toBe(0);
  });

  it("includes the lower bound of every bucket", () => {
    // -3 < -2; -2 and -1.5 in [-2,-1); -1 and -0.5 in [-1,0); 0 and 0.5 in [0,1); 1 in [1,2); 2 in [2,3); 3 and 7 are 3 or more.
    expect(counts([-3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 2, 3, 7])).toEqual([1, 2, 2, 2, 1, 1, 2]);
  });

  it("puts a plain stop-out in -1 to 0 and a loss bigger than planned in -2 to -1", () => {
    expect(counts([-1])).toEqual([0, 0, 1, 0, 0, 0, 0]);
    expect(counts([-1.2])).toEqual([0, 1, 0, 0, 0, 0, 0]);
  });

  it("rounds to four decimals first, so float noise cannot move a trade across a bound", () => {
    // -1.99999999999 is -2, -1.00000000001 is -1, 0.99999999999 is 1 and 2.99999999999 is 3.
    expect(counts([-1.99999999999, -1.00000000001, 0.99999999999, 2.99999999999])).toEqual([0, 1, 1, 0, 1, 0, 1]);
  });

  it("counts entries without an R apart", () => {
    const histogram = rHistogram(entriesOf([1.5, null, -1, null]));
    expect(histogram.withoutR).toBe(2);
    expect(histogram.buckets.map((bucket) => bucket.count)).toEqual([0, 0, 1, 0, 1, 0, 0]);
  });

  it("counts a three-leg ladder once, by its combined R", () => {
    const legs = [1, 2, 3].map((leg) => closing(leg, leg === 3 ? -50 : 150, { ladderKey: "k", ladderLeg: leg, ladderSize: 3, riskAmount: 100 }));
    const { entries } = toEntries(legs);
    expect(entries).toHaveLength(1);
    const histogram = rHistogram(entries);
    expect(histogram.buckets.reduce((total, bucket) => total + bucket.count, 0)).toBe(1);
  });

  describe("on the sample month", () => {
    const { entries } = toEntries(sampleTrades(NOW));
    const histogram = rHistogram(entries);

    it("fills the buckets 0, 2, 11, 5, 9, 3, 0", () => {
      expect(histogram.buckets.map((bucket) => bucket.count)).toEqual([0, 2, 11, 5, 9, 3, 0]);
      expect(histogram.withoutR).toBe(0);
    });

    it("counts every entry exactly once", () => {
      const total = histogram.buckets.reduce((sum, bucket) => sum + bucket.count, 0) + histogram.withoutR;
      expect(total).toBe(entries.length);
    });
  });
});
