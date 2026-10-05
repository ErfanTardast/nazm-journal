import { describe, expect, it } from "vitest";
import { allBreakdowns, rowTradeIds } from "@/lib/calculations/performance/breakdowns";
import { toEntries } from "@/lib/calculations/performance/entries";
import { buildPerformanceReport, buildRowTradeIds } from "@/lib/calculations/performance";
import { DIMENSIONS, PERIODS, type PerformanceTrade, type PeriodKey } from "@/lib/calculations/performance/types";
import { perfTrade, sampleTrades } from "./support/performance-trades";

const NOW = new Date("2026-10-04T10:00:00Z");
const UTC = { timeZone: "UTC" };

describe("rowTradeIds on the sample month", () => {
  const trades = sampleTrades(NOW);
  const { entries } = toEntries(trades);
  const breakdowns = allBreakdowns(entries, UTC);

  it("returns, for every row of every dimension, as many trades as the row has entries", () => {
    let checked = 0;
    for (const dimension of DIMENSIONS) {
      for (const row of breakdowns[dimension]) {
        const ids = rowTradeIds(entries, dimension, row.id, UTC);
        expect(ids, `${dimension} ${row.id}`).toHaveLength(row.entries);
        expect(new Set(ids).size).toBe(ids.length);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("returns only ids of the month's trades, and the rows of one exclusive dimension cover every trade once", () => {
    const all = new Set(trades.map((trade) => trade.id));
    for (const dimension of ["strategy", "symbol", "side", "weekday"] as const) {
      const ids = breakdowns[dimension].flatMap((row) => rowTradeIds(entries, dimension, row.id, UTC));
      expect(ids.every((id) => all.has(id))).toBe(true);
      expect(new Set(ids)).toEqual(all);
      expect(ids).toHaveLength(all.size);
    }
  });

  it("reads the weekday in the time zone it is given, as the rows do", () => {
    const zone = { timeZone: "Asia/Tehran" };
    const rows = allBreakdowns(entries, zone).weekday;
    for (const row of rows) expect(rowTradeIds(entries, "weekday", row.id, zone)).toHaveLength(row.entries);
  });

  it("is empty for a row that does not exist", () => {
    expect(rowTradeIds(entries, "weekday", "key:weekday.9", UTC)).toEqual([]);
    expect(rowTradeIds(entries, "symbol", "text:nothing", UTC)).toEqual([]);
    expect(rowTradeIds([], "symbol", "text:eurusd", UTC)).toEqual([]);
  });
});

describe("rowTradeIds", () => {
  let minute = 0;
  const trade = (overrides: Partial<PerformanceTrade> = {}) => {
    minute += 1;
    return perfTrade({
      realizedPnl: 10,
      openedAt: new Date(Date.UTC(2026, 9, 1, 8, minute)).toISOString(),
      closedAt: new Date(Date.UTC(2026, 9, 1, 12, minute)).toISOString(),
      ...overrides
    });
  };
  const entriesOf = (trades: PerformanceTrade[]) => toEntries(trades).entries;

  it("returns every leg of a ladder entry", () => {
    const legs = [1, 2, 3].map((leg) => trade({ symbol: "XAUUSD", ladderKey: "gold", ladderLeg: leg, ladderSize: 3, openedAt: `2026-10-01T07:00:0${leg}.000Z` }));
    const single = trade({ symbol: "EURUSD" });
    const entries = entriesOf([...legs, single]);
    expect(rowTradeIds(entries, "symbol", "text:xauusd", UTC).sort()).toEqual(legs.map((leg) => leg.id).sort());
    expect(rowTradeIds(entries, "symbol", "text:eurusd", UTC)).toEqual([single.id]);
  });

  it("groups free text ignoring case and spaces, like the rows", () => {
    const a = trade({ setupType: "Breakout" });
    const b = trade({ setupType: "  breakout " });
    const c = trade({ setupType: "Pullback" });
    const entries = entriesOf([a, b, c]);
    expect(rowTradeIds(entries, "setup", "text:breakout", UTC).sort()).toEqual([a.id, b.id].sort());
  });

  it("finds the blank under the key none and the plan conversion under its key", () => {
    const blank = trade({ emotionalState: " " });
    const planned = trade({ setupType: "planned-trade-conversion" });
    const entries = entriesOf([blank, planned]);
    expect(rowTradeIds(entries, "emotion", "key:none", UTC)).toEqual([blank.id, planned.id]);
    expect(rowTradeIds(entries, "setup", "key:setup.from_plan", UTC)).toEqual([planned.id]);
  });

  it("puts an entry with two tags under both of them, and one with none under neither", () => {
    const both = trade({ mistakes: ["Late entry", "Moved stop"] });
    const one = trade({ mistakes: ["Moved stop"] });
    const none = trade();
    const entries = entriesOf([both, one, none]);
    expect(rowTradeIds(entries, "mistake", "text:late entry", UTC)).toEqual([both.id]);
    expect(rowTradeIds(entries, "mistake", "text:moved stop", UTC).sort()).toEqual([both.id, one.id].sort());
  });

  it("uses the open day in the zone for the weekday: 00:30 in Tehran is the next day", () => {
    // 2026-10-01 21:00 UTC is Friday 2 October 00:30 in Tehran (UTC+3:30, no summer time since 2022); in UTC it is Thursday.
    const late = trade({ openedAt: "2026-10-01T21:00:00.000Z", closedAt: "2026-10-01T22:00:00.000Z" });
    const entries = entriesOf([late]);
    expect(rowTradeIds(entries, "weekday", "key:weekday.4", UTC)).toEqual([late.id]);
    expect(rowTradeIds(entries, "weekday", "key:weekday.5", { timeZone: "Asia/Tehran" })).toEqual([late.id]);
    expect(rowTradeIds(entries, "weekday", "key:weekday.4", { timeZone: "Asia/Tehran" })).toEqual([]);
  });

  it("knows the nine dimensions the report has", () => {
    expect(Object.keys(allBreakdowns([], UTC)).sort()).toEqual([...DIMENSIONS].sort());
  });
});

describe("buildRowTradeIds", () => {
  const input = (period: PeriodKey, timeZone = "UTC") => ({ period, now: NOW, timeZone, startingBalance: null });

  it("matches every row of the report, for every period, on the sample month", () => {
    const trades = sampleTrades(NOW);
    for (const period of PERIODS) {
      const { breakdowns } = buildPerformanceReport(trades, input(period));
      for (const dimension of DIMENSIONS) {
        for (const row of breakdowns[dimension]) {
          const ids = buildRowTradeIds(trades, input(period), dimension, row.id);
          expect(ids, `${period} ${dimension} ${row.id}`).toHaveLength(row.entries);
        }
      }
    }
  });

  it("matches the report in the trader's zone too", () => {
    const trades = sampleTrades(NOW);
    const { breakdowns } = buildPerformanceReport(trades, input("30d", "Asia/Tehran"));
    for (const row of breakdowns.weekday) expect(buildRowTradeIds(trades, input("30d", "Asia/Tehran"), "weekday", row.id)).toHaveLength(row.entries);
  });

  it("only holds trades closed in the window", () => {
    const inside = perfTrade({ closedAt: "2026-10-03T10:00:00.000Z", openedAt: "2026-10-03T09:00:00.000Z" });
    const outside = perfTrade({ closedAt: "2026-08-01T10:00:00.000Z", openedAt: "2026-08-01T09:00:00.000Z" });
    expect(buildRowTradeIds([inside, outside], input("7d"), "symbol", "text:btcusdt")).toEqual([inside.id]);
    expect(buildRowTradeIds([inside, outside], input("all"), "symbol", "text:btcusdt").sort()).toEqual([inside.id, outside.id].sort());
  });

  it("leaves open and planned trades out", () => {
    const closed = perfTrade();
    const open = perfTrade({ status: "open", closedAt: null, exitPrice: null });
    expect(buildRowTradeIds([closed, open], input("all"), "side", "key:side.long")).toEqual([closed.id]);
  });

  it("reads a trader's own trades only, as soon as there is one (the sample is dropped)", () => {
    const sample = perfTrade({ isSample: true });
    const own = perfTrade();
    expect(buildRowTradeIds([sample, own], input("all"), "side", "key:side.long")).toEqual([own.id]);
    expect(buildRowTradeIds([sample], input("all"), "side", "key:side.long")).toEqual([sample.id]);
  });
});
