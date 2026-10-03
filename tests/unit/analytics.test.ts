import { describe, expect, it } from "vitest";
import { summarizeBy } from "@/lib/calculations/analytics";

describe("analytics breakdown", () => {
  const trades = [
    { setup: "Breakout", realizedPnl: 100, rMultiple: 2 },
    { setup: "Breakout", realizedPnl: -50, rMultiple: -1 },
    { setup: "Breakout", realizedPnl: 0, rMultiple: 0 },
    { setup: "Reversal", realizedPnl: 200, rMultiple: 3 },
    { setup: null, realizedPnl: -25, rMultiple: null }
  ];

  it("groups trades and aggregates pnl per dimension", () => {
    const rows = summarizeBy(trades, (trade) => trade.setup);
    const breakout = rows.find((row) => row.key === "Breakout");

    expect(breakout).toBeDefined();
    expect(breakout?.count).toBe(3);
    expect(breakout?.netPnl).toBe(50);
    expect(breakout?.wins).toBe(1);
    expect(breakout?.losses).toBe(1);
    expect(breakout?.breakeven).toBe(1);
  });

  it("measures win rate over decided trades only, excluding breakeven", () => {
    const rows = summarizeBy(trades, (trade) => trade.setup);
    const breakout = rows.find((row) => row.key === "Breakout");
    // 1 win, 1 loss, 1 breakeven -> decided = 2 -> 50%
    expect(breakout?.decided).toBe(2);
    expect(breakout?.winRate).toBe(0.5);
  });

  it("averages R only across trades that have an R multiple", () => {
    const rows = summarizeBy(trades, (trade) => trade.setup);
    const reversal = rows.find((row) => row.key === "Reversal");
    expect(reversal?.hasR).toBe(true);
    expect(reversal?.avgR).toBe(3);

    const unspecified = rows.find((row) => row.key === "Unspecified");
    expect(unspecified?.hasR).toBe(false);
    expect(unspecified?.avgR).toBe(0);
  });

  it("buckets missing keys under the fallback label", () => {
    const rows = summarizeBy(trades, (trade) => trade.setup);
    const unspecified = rows.find((row) => row.key === "Unspecified");
    expect(unspecified?.count).toBe(1);
    expect(unspecified?.netPnl).toBe(-25);
  });

  it("sorts groups by net pnl descending", () => {
    const rows = summarizeBy(trades, (trade) => trade.setup);
    expect(rows.map((row) => row.key)).toEqual(["Reversal", "Breakout", "Unspecified"]);
  });

  it("handles an empty set without throwing", () => {
    expect(summarizeBy([], (trade: { setup?: string }) => trade.setup)).toEqual([]);
  });
});
