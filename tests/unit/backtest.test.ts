import { describe, expect, it } from "vitest";
import { calculateBacktestMetrics } from "@/lib/calculations/backtest";

describe("backtest metrics", () => {
  it("calculates backtest summary", () => {
    const result = calculateBacktestMetrics(1000, [
      { side: "long", entryPrice: 100, exitPrice: 110, quantity: 1 },
      { side: "short", entryPrice: 100, exitPrice: 105, quantity: 1 }
    ]);

    expect(result.totalTrades).toBe(2);
    expect(result.winRate).toBe(0.5);
    expect(result.netPnl).toBe(5);
    expect(result.endingBalance).toBe(1005);
  });
});

