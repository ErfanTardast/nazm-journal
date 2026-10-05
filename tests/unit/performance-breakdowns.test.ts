import { describe, expect, it } from "vitest";
import { allBreakdowns } from "@/lib/calculations/performance/breakdowns";
import { toEntries } from "@/lib/calculations/performance/entries";
import { summarize } from "@/lib/calculations/performance/summary";
import { LOW_SAMPLE_ROW, type BreakdownRow, type Dimension, type PerformanceTrade } from "@/lib/calculations/performance/types";
import { perfTrade, sampleTrades } from "./support/performance-trades";

const NOW = new Date("2026-10-04T10:00:00Z");
const UTC = { timeZone: "UTC" };
const none = { openTrades: 0, startingBalance: null, withBalancePct: false };

/** A trade that closes with the given money result (R = pnl / 100), at its own minute of 1 October. */
let minute = 0;
function trade(pnl: number, overrides: Partial<PerformanceTrade> = {}) {
  minute += 1;
  return perfTrade({
    realizedPnl: pnl,
    rMultiple: pnl / 100,
    riskAmount: 100,
    openedAt: new Date(Date.UTC(2026, 9, 1, 8, minute)).toISOString(),
    closedAt: new Date(Date.UTC(2026, 9, 1, 12, minute)).toISOString(),
    ...overrides
  });
}

const breakdownsOf = (trades: PerformanceTrade[]) => allBreakdowns(toEntries(trades).entries, UTC);
const labelsOf = (rows: BreakdownRow[]) => rows.map((row) => (row.label.kind === "key" ? row.label.key : row.label.text));

describe("the sample month", () => {
  const trades = sampleTrades(NOW);
  const { entries } = toEntries(trades);
  const summary = summarize(trades, none);
  const breakdowns = allBreakdowns(entries, UTC);
  const entriesIn = (rows: BreakdownRow[]) => rows.reduce((total, row) => total + row.entries, 0);
  const pnlIn = (rows: BreakdownRow[]) => rows.reduce((total, row) => total + row.netPnl, 0);

  it.each<Dimension>(["strategy", "symbol", "market", "side", "setup"])("%s rows add up to the headline's entries and net P&L", (dimension) => {
    expect(entriesIn(breakdowns[dimension])).toBe(summary.entries.count);
    expect(pnlIn(breakdowns[dimension])).toBeCloseTo(summary.entries.netPnl, 9);
  });

  it("has 22 long and 8 short entries", () => {
    const sides = Object.fromEntries(breakdowns.side.map((row) => [row.label.kind === "key" ? row.label.key : "", row.entries]));
    expect(sides).toEqual({ "side.long": 22, "side.short": 8 });
  });

  it("has one forex row, with market as a key", () => {
    expect(breakdowns.market).toHaveLength(1);
    expect(breakdowns.market[0]).toMatchObject({ label: { kind: "key", key: "market.forex" }, entries: 30, derived: false, unpriced: 0, lowSample: false });
  });

  it("gives the two strategies by name, the trader's words", () => {
    const strategies = Object.fromEntries(breakdowns.strategy.map((row) => [labelsOf([row])[0], row.entries]));
    expect(strategies).toEqual({ "London range breakout (sample)": 20, "Gold trend pullback (sample)": 10 });
    expect(breakdowns.strategy.every((row) => row.label.kind === "text")).toBe(true);
  });

  it("counts the three mistakes once per entry", () => {
    const mistakes = Object.fromEntries(breakdowns.mistake.map((row) => [labelsOf([row])[0], row.entries]));
    expect(mistakes).toEqual({ "Late entry": 4, "Moved stop": 1, "Revenge trade": 1 });
  });

  it("is the same in Persian, with the same counts", () => {
    const fa = allBreakdowns(toEntries(sampleTrades(NOW, "fa")).entries, UTC);
    for (const dimension of ["market", "side", "strategy", "symbol"] as const) {
      expect(fa[dimension].map((row) => row.entries).sort()).toEqual(breakdowns[dimension].map((row) => row.entries).sort());
    }
  });
});

describe("rows", () => {
  it("are a result group over entries, with the unpriced ones counted", () => {
    const unpriced = trade(0, { market: "forex", symbol: "EURUSD", quantity: 0.1, stopLoss: null, entryPrice: 1.1, exitPrice: 1.105, realizedPnl: null, rMultiple: null, riskAmount: null });
    const [win, loss] = [trade(300, { symbol: "EURUSD" }), trade(-100, { symbol: "EURUSD" })];
    const [row] = breakdownsOf([win, loss, unpriced]).symbol;
    expect(row).toMatchObject({ entries: 3, wins: 2, losses: 1, netPnl: 200, unpriced: 1, derived: false, lowSample: true });
    expect(row.winRate).toBeCloseTo(2 / 3, 12);
    expect(row.averageR).toBeCloseTo(1, 12);
    expect(typeof row.id).toBe("string");
  });

  it("are marked few trades below the row threshold and not at it", () => {
    const few = Array.from({ length: LOW_SAMPLE_ROW - 1 }, () => trade(10, { symbol: "AAA" }));
    const enough = Array.from({ length: LOW_SAMPLE_ROW }, () => trade(10, { symbol: "BBB" }));
    const rows = Object.fromEntries(breakdownsOf([...few, ...enough]).symbol.map((row) => [row.label.kind === "text" ? row.label.text : "", row.lowSample]));
    expect(rows).toEqual({ AAA: true, BBB: false });
  });

  it("come with every row, with no cap", () => {
    const trades = Array.from({ length: 40 }, (_, index) => trade(index, { symbol: `SYM${index}` }));
    expect(breakdownsOf(trades).symbol).toHaveLength(40);
  });

  it("are sorted by net P&L, then entries, then label, and the same for any input order", () => {
    const trades = [
      trade(50, { symbol: "BBB" }),
      trade(50, { symbol: "AAA" }),
      trade(20, { symbol: "CCC" }),
      trade(30, { symbol: "CCC" }),
      trade(-10, { symbol: "DDD" }),
      trade(60, { symbol: "EEE" })
    ];
    const expected = ["EEE", "CCC", "AAA", "BBB", "DDD"];
    expect(labelsOf(breakdownsOf(trades).symbol)).toEqual(expected);
    // CCC has 2 entries at 50, so it goes before the two single entries at 50; AAA before BBB by label.
    expect(labelsOf(allBreakdowns([...toEntries(trades).entries].reverse(), UTC).symbol)).toEqual(expected);
  });

  it("do not change the entries they were given", () => {
    const { entries } = toEntries([trade(5, { symbol: "ZZZ" }), trade(7, { symbol: "AAA" })]);
    const before = JSON.stringify(entries);
    allBreakdowns(entries, UTC);
    expect(JSON.stringify(entries)).toBe(before);
  });
});

describe("free text", () => {
  it("is trimmed and grouped ignoring case, showing the most frequent spelling", () => {
    const rows = breakdownsOf([
      trade(10, { mistakes: ["Late entry"] }),
      trade(10, { mistakes: ["late entry "] }),
      trade(-10, { mistakes: ["LATE ENTRY"] }),
      trade(10, { mistakes: ["Late entry"] })
    ]).mistake;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: { kind: "text", text: "Late entry" }, entries: 4, wins: 3, losses: 1, netPnl: 20 });
  });

  it("settles a tie of spellings the same way for any input order", () => {
    const [a, b] = [trade(1, { symbol: "btcusdt" }), trade(1, { symbol: "BTCUSDT" })];
    const forward = breakdownsOf([a, b]).symbol[0].label;
    const backward = allBreakdowns([...toEntries([a, b]).entries].reverse(), UTC).symbol[0].label;
    expect(forward).toEqual(backward);
  });

  it("gives a blank value the key none, for the trimmed and the missing alike", () => {
    const rows = breakdownsOf([trade(10, { strategyName: null }), trade(10, { strategyName: "  " }), trade(10, { strategyName: "" }), trade(5, { strategyName: "Mine" })]).strategy;
    expect(rows.map((row) => [row.label, row.entries])).toEqual([
      [{ kind: "key", key: "none" }, 3],
      [{ kind: "text", text: "Mine" }, 1]
    ]);
    expect(rows[0].id).not.toBe(rows[1].id);
  });

  it("keeps the trader's own words for setup and emotion, with none for the blank", () => {
    const breakdowns = breakdownsOf([trade(10, { setupType: "Range breakout", emotionalState: "Calm" }), trade(5, { setupType: null, emotionalState: " " })]);
    expect(breakdowns.setup.map((row) => row.label)).toEqual([{ kind: "text", text: "Range breakout" }, { kind: "key", key: "none" }]);
    expect(breakdowns.emotion.map((row) => row.label)).toEqual([{ kind: "text", text: "Calm" }, { kind: "key", key: "none" }]);
  });

  it("turns the plan-conversion setup into a key the client translates", () => {
    const rows = breakdownsOf([trade(10, { setupType: "planned-trade-conversion" }), trade(10, { setupType: "Planned-Trade-Conversion " })]).setup;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: { kind: "key", key: "setup.from_plan" }, entries: 2 });
  });

  it("uses the market and the side as keys", () => {
    const breakdowns = breakdownsOf([trade(1, { market: "stocks", side: "short" }), trade(2, { market: "crypto", side: "long" })]);
    expect(breakdowns.market.map((row) => row.label)).toEqual([{ kind: "key", key: "market.crypto" }, { kind: "key", key: "market.stocks" }]);
    expect(breakdowns.side.map((row) => row.label)).toEqual([{ kind: "key", key: "side.long" }, { kind: "key", key: "side.short" }]);
  });
});

describe("ladders", () => {
  // The legs of one entry open within seconds of each other.
  const legs = [1, 2, 3].map((leg) => trade(leg === 3 ? -20 : 60, { symbol: "XAUUSD", ladderKey: "gold", ladderLeg: leg, ladderSize: 3, mistakes: ["Late entry"], strategyName: "Gold", openedAt: `2026-10-01T07:00:0${leg}.000Z` }));

  it("count as one entry in the symbol row, and the mistake counts once", () => {
    const breakdowns = breakdownsOf(legs);
    expect(breakdowns.symbol).toHaveLength(1);
    expect(breakdowns.symbol[0]).toMatchObject({ entries: 1, netPnl: 100, wins: 1 });
    expect(breakdowns.mistake).toHaveLength(1);
    expect(breakdowns.mistake[0]).toMatchObject({ entries: 1, netPnl: 100 });
    expect(breakdowns.strategy[0].entries).toBe(1);
  });

  it("add up to the headline with single trades next to them", () => {
    const trades = [...legs, trade(-30, { symbol: "EURUSD" })];
    const { entries } = toEntries(trades);
    const symbol = allBreakdowns(entries, UTC).symbol;
    expect(symbol.reduce((total, row) => total + row.entries, 0)).toBe(summarize(trades, none).entries.count);
  });
});

describe("mistakes", () => {
  it("leave out the entries that have none, and give one entry a row for each tag it has", () => {
    const rows = breakdownsOf([trade(10, { mistakes: ["Late entry", "Moved stop"] }), trade(10), trade(-5, { mistakes: ["Moved stop"] })]).mistake;
    expect(rows.map((row) => [row.label, row.entries, row.netPnl])).toEqual([
      [{ kind: "text", text: "Late entry" }, 1, 10],
      [{ kind: "text", text: "Moved stop" }, 2, 5]
    ]);
  });
});

describe("no entries", () => {
  it("gives every dimension an empty list", () => {
    const breakdowns = allBreakdowns([], UTC);
    expect(Object.keys(breakdowns).sort()).toEqual(["emotion", "market", "mistake", "session", "setup", "side", "strategy", "symbol", "weekday"]);
    for (const rows of Object.values(breakdowns)) expect(rows).toEqual([]);
  });
});
