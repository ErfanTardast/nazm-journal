import { describe, expect, it } from "vitest";
import { calculateJournalMetrics } from "@/lib/calculations/journal";
import { buildPerformanceReport, buildPerformanceSnapshot } from "@/lib/calculations/performance";
import { inPeriod, ownOrSample, resultGroup, summarize } from "@/lib/calculations/performance/summary";
import { toEntries } from "@/lib/calculations/performance/entries";
import { periodRange } from "@/lib/calculations/performance/time";
import { LOW_SAMPLE_ENTRIES, type Dimension } from "@/lib/calculations/performance/types";
import { perfTrade, sampleTrades } from "./support/performance-trades";

const NOW = new Date("2026-10-04T10:00:00Z");
const ctx = { period: "all" as const, now: NOW, timeZone: "UTC", startingBalance: null };
const none = { openTrades: 0, startingBalance: null, withBalancePct: false };

describe("the sample month, all time", () => {
  const trades = sampleTrades(NOW);
  const report = buildPerformanceReport(trades, ctx);

  it("counts 30 closed trades: 17 wins, 13 losses", () => {
    expect(report.context).toMatchObject({ period: "all", from: null, to: NOW.toISOString(), timeZone: "UTC", source: "sample" });
    expect(report.summary).toMatchObject({ closedTrades: 30, openTrades: 0, wins: 17, losses: 13, breakeven: 0, unpricedClosed: 0, withoutR: 0 });
    expect(report.summary.winRate).toBeCloseTo(17 / 30, 12);
    expect(report.summary.entries).toMatchObject({ count: 30, combined: 0, pendingLegs: 0, wins: 17, losses: 13 });
    expect(report.summary.lowSample).toBe(false);
  });

  it("reads rule adherence from the trades: 24 followed, 4 mixed, 2 broken", () => {
    expect(report.summary.adherence).toEqual({ followed: 24, mixed: 4, broken: 2, unknown: 0, rate: 0.8 });
  });

  it("agrees with the journal metrics to the cent", () => {
    // The service loads trades in close order; so does the summary.
    const metrics = calculateJournalMetrics([...trades].sort((a, b) => Date.parse(a.closedAt ?? "") - Date.parse(b.closedAt ?? "")));
    const { summary } = report;
    expect(summary.netPnl).toBe(metrics.netPnl);
    expect(summary.grossProfit).toBe(metrics.grossProfit);
    expect(summary.grossLoss).toBe(metrics.grossLoss);
    expect(summary.maxDrawdownAmount).toBe(metrics.maxDrawdownAmount);
    expect(summary.maxDrawdownR).toBe(metrics.maxDrawdownR);
    expect(summary.averageR).toBe(metrics.averageR);
    expect(summary.expectancy).toBe(metrics.expectancy);
    expect(summary.profitFactor).toBe(metrics.profitFactor);
    expect(summary.profitFactorState).toBe("value");
    expect(summary.entries.winRate).toBe(metrics.setups.winRate);
    expect(summary.entries.averageR).toBe(metrics.setups.averageR);
    expect(summary.entries.expectancy).toBe(metrics.setups.expectancy);
  });

  it("has the final shape of the report from day one", () => {
    const dimensions: Dimension[] = ["strategy", "symbol", "market", "side", "session", "weekday", "setup", "mistake", "emotion"];
    expect(Object.keys(report.breakdowns).sort()).toEqual([...dimensions].sort());
    expect(report.rHistogram.buckets.map((bucket) => bucket.key)).toEqual(["lt_-2", "-2_-1", "-1_0", "0_1", "1_2", "2_3", "ge_3"]);
    expect(Object.keys(report.behaviour).sort()).toEqual(["adherence", "exits", "orderInDay", "reentry"]);
    expect(Object.keys(report.behaviour.adherence).sort()).toEqual(["broken", "followed", "mixed", "unknown"]);
    expect(Array.isArray(report.equity)).toBe(true);
  });
});

describe("sample or own", () => {
  it("drops every sample row as soon as the trader has one of their own", () => {
    const mixed = [...sampleTrades(NOW), perfTrade({ id: "mine", isSample: false })];
    const report = buildPerformanceReport(mixed, ctx);
    expect(report.context.source).toBe("own");
    expect(report.summary.closedTrades).toBe(1);
    expect(ownOrSample(mixed).trades.map((trade) => trade.id)).toEqual(["mine"]);
  });

  it("counts an own planned or open trade as the trader's own data", () => {
    const own = perfTrade({ status: "planned", exitPrice: null, closedAt: null });
    expect(ownOrSample([...sampleTrades(NOW), own])).toEqual({ trades: [own], source: "own" });
  });

  it("uses the sample rows when they are all there is, and says none when nothing is", () => {
    expect(ownOrSample(sampleTrades(NOW)).source).toBe("sample");
    expect(ownOrSample([])).toEqual({ trades: [], source: "none" });
    const empty = buildPerformanceReport([], ctx);
    expect(empty.context.source).toBe("none");
    expect(empty.summary).toMatchObject({ closedTrades: 0, winRate: null, expectancy: null, averageR: null, netPnl: 0, lowSample: true });
    expect(empty.summary.entries).toMatchObject({ count: 0, winRate: null, averageR: null, expectancy: null });
    expect(empty.summary.adherence.rate).toBeNull();
  });
});

describe("profit factor", () => {
  it("is null with the reason when there is nothing to divide", () => {
    const wins = summarize([perfTrade({ exitPrice: 102 }), perfTrade({ exitPrice: 103 })], none);
    expect(wins).toMatchObject({ profitFactor: null, profitFactorState: "no_losses", grossProfit: 5, grossLoss: 0 });
    expect(summarize([], none)).toMatchObject({ profitFactor: null, profitFactorState: "no_results", closedTrades: 0 });
    // Only breakeven trades: no profit and no loss.
    expect(summarize([perfTrade({ exitPrice: 100 })], none)).toMatchObject({ profitFactor: null, profitFactorState: "no_results", breakeven: 1 });
  });

  it("is gross profit over gross loss when there are both", () => {
    const summary = summarize([perfTrade({ exitPrice: 103 }), perfTrade({ exitPrice: 98 }), perfTrade({ exitPrice: 99 })], none);
    expect(summary).toMatchObject({ profitFactorState: "value", grossProfit: 3, grossLoss: 3 });
    expect(summary.profitFactor).toBe(1);
  });
});

describe("windows", () => {
  const tehran = { ...ctx, period: "7d" as const, timeZone: "Asia/Tehran" };

  it("starts the 7-day window at the start of the day six days back, in the trader's zone", () => {
    const inside = perfTrade({ id: "in", closedAt: "2026-09-27T21:00:00Z", openedAt: "2026-09-27T20:45:00Z" });
    const outside = perfTrade({ id: "out", closedAt: "2026-09-27T20:00:00Z", openedAt: "2026-09-27T19:00:00Z" });
    const report = buildPerformanceReport([outside, inside], tehran);
    expect(report.context).toMatchObject({ period: "7d", from: "2026-09-27T20:30:00.000Z", timeZone: "Asia/Tehran" });
    expect(report.summary.closedTrades).toBe(1);
    expect(inPeriod([outside, inside], periodRange("7d", NOW, "Asia/Tehran")).map((trade) => trade.id)).toEqual(["in"]);
    // The same two trades in UTC: the window starts at midnight UTC on the 28th, so both are before it.
    expect(buildPerformanceReport([outside, inside], { ...tehran, timeZone: "UTC" })).toMatchObject({
      context: { from: "2026-09-28T00:00:00.000Z" },
      summary: { closedTrades: 0 }
    });
  });

  it("returns the period's trades in close order", () => {
    const second = perfTrade({ id: "b", closedAt: "2026-10-03T12:00:00Z" });
    const first = perfTrade({ id: "a", closedAt: "2026-10-02T12:00:00Z" });
    expect(inPeriod([second, first], periodRange("30d", NOW, "UTC")).map((trade) => trade.id)).toEqual(["a", "b"]);
  });

  it("places a trade with no close time by its open time", () => {
    const trade = perfTrade({ closedAt: null, openedAt: "2026-10-02T08:00:00Z" });
    expect(inPeriod([trade], periodRange("7d", NOW, "UTC"))).toEqual([trade]);
    expect(inPeriod([{ ...trade, openedAt: "2026-08-01T08:00:00Z" }], periodRange("7d", NOW, "UTC"))).toEqual([]);
  });

  it("counts open trades as they are now, never windowed, and leaves out planned and canceled ones", () => {
    const old = perfTrade({ status: "open", exitPrice: null, closedAt: null, openedAt: "2026-01-01T00:00:00Z" });
    const planned = perfTrade({ status: "planned", exitPrice: null, closedAt: null });
    const canceled = perfTrade({ status: "canceled", exitPrice: null, closedAt: null });
    const report = buildPerformanceReport([old, planned, canceled, perfTrade()], tehran);
    expect(report.summary).toMatchObject({ openTrades: 1, closedTrades: 1 });
  });

  it("starts a window's drawdown from zero at the window's start", () => {
    const september = perfTrade({ closedAt: "2026-09-10T12:00:00Z", exitPrice: 90 });
    const october = perfTrade({ closedAt: "2026-10-02T12:00:00Z", exitPrice: 102 });
    expect(buildPerformanceReport([september, october], { ...ctx, period: "7d" }).summary.maxDrawdownAmount).toBe(0);
    expect(buildPerformanceReport([september, october], ctx).summary.maxDrawdownAmount).toBe(10);
  });

  it("gives the drawdown share only for all time with a starting balance", () => {
    const trades = [perfTrade({ closedAt: "2026-10-02T09:00:00Z", exitPrice: 102 }), perfTrade({ closedAt: "2026-10-02T10:00:00Z", exitPrice: 98 })];
    const all = buildPerformanceReport(trades, { ...ctx, startingBalance: 1000 }).summary.maxDrawdownPct;
    expect(all).toBeCloseTo(2 / 1002, 12);
    expect(buildPerformanceReport(trades, { ...ctx, period: "30d", startingBalance: 1000 }).summary.maxDrawdownPct).toBeNull();
    expect(buildPerformanceReport(trades, ctx).summary.maxDrawdownPct).toBeNull();
  });
});

describe("trades without a money result or an R", () => {
  it("counts them as closed, and in no money figure", () => {
    // A lot-based forex trade with no stop and no stored money: it moved up, so it is a win, but it has no value.
    const unpriced = perfTrade({ market: "forex", symbol: "EURUSD", quantity: 0.1, stopLoss: null, entryPrice: 1.1, exitPrice: 1.105 });
    const priced = perfTrade({ exitPrice: 102 });
    const summary = buildPerformanceReport([unpriced, priced], ctx).summary;
    expect(summary).toMatchObject({ closedTrades: 2, unpricedClosed: 1, withoutR: 1, wins: 2, netPnl: 2, grossProfit: 2 });
    expect(summary.expectancy).toBe(2);
    expect(summary.averageR).toBe(2);
    expect(summary.entries).toMatchObject({ count: 2, netPnl: 2, expectancy: 2, averageR: 2 });

    const alone = buildPerformanceReport([unpriced], ctx).summary;
    expect(alone).toMatchObject({ closedTrades: 1, unpricedClosed: 1, withoutR: 1, netPnl: 0, expectancy: null, averageR: null, profitFactorState: "no_results" });
  });
});

describe("ladders", () => {
  const legs = [1, 2, 3].map((leg) =>
    perfTrade({ ladderKey: "K", ladderLeg: leg, ladderSize: 3, exitPrice: 100 + leg, mistakes: ["Late entry"], openedAt: `2026-10-01T10:00:0${leg}.000Z` })
  );

  it("counts three legs as three trades in the headline and one entry everywhere else", () => {
    const report = buildPerformanceReport(legs, ctx);
    expect(report.summary).toMatchObject({ closedTrades: 3, wins: 3 });
    expect(report.summary.entries).toMatchObject({ count: 1, combined: 1, pendingLegs: 0, wins: 1 });
    expect(toEntries(legs).entries[0].mistakes).toEqual(["Late entry"]);
  });

  it("holds an entry back while one of its legs is open or outside the window", () => {
    const open = perfTrade({ ladderKey: "K", ladderLeg: 4, ladderSize: null, status: "open", exitPrice: null, closedAt: null, openedAt: "2026-10-01T10:00:04.000Z" });
    const unsized = legs.map((leg) => ({ ...leg, ladderSize: null }));
    expect(buildPerformanceReport([...unsized, open], ctx).summary.entries).toMatchObject({ count: 0, pendingLegs: 3 });
    const early = { ...unsized[0], closedAt: "2026-08-01T10:00:00.000Z" };
    const windowed = buildPerformanceReport([early, ...unsized.slice(1)], { ...ctx, period: "30d" }).summary;
    expect(windowed).toMatchObject({ closedTrades: 2 });
    expect(windowed.entries).toMatchObject({ count: 0, pendingLegs: 2 });
  });
});

describe("low sample", () => {
  it("is set below the entry threshold", () => {
    const some = (count: number) => Array.from({ length: count }, () => perfTrade());
    expect(summarize(some(LOW_SAMPLE_ENTRIES - 1), none).lowSample).toBe(true);
    expect(summarize(some(LOW_SAMPLE_ENTRIES), none).lowSample).toBe(false);
  });
});

describe("resultGroup", () => {
  it("counts wins over all entries, and money and R over the entries that have them", () => {
    const [win, loss, unpriced] = toEntries([
      perfTrade({ exitPrice: 102 }),
      perfTrade({ exitPrice: 99 }),
      perfTrade({ market: "forex", quantity: 0.1, stopLoss: null, entryPrice: 1.1, exitPrice: 1.2 })
    ]).entries;
    expect(resultGroup([win, loss, unpriced])).toEqual({ entries: 3, wins: 2, losses: 1, winRate: 2 / 3, netPnl: 1, averageR: 0.5 });
    expect(resultGroup([])).toEqual({ entries: 0, wins: 0, losses: 0, winRate: null, netPnl: 0, averageR: null });
  });
});

describe("snapshot", () => {
  it("is the context, the summary and the equity of the report", () => {
    const trades = sampleTrades(NOW);
    const report = buildPerformanceReport(trades, { ...ctx, period: "30d" });
    expect(buildPerformanceSnapshot(trades, { ...ctx, period: "30d" })).toEqual({ context: report.context, summary: report.summary, equity: report.equity });
  });
});
