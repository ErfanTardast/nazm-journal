import { describe, expect, it } from "vitest";
import { applyPortfolioTransaction } from "@/lib/calculations/portfolio";

describe("portfolio calculations", () => {
  it("updates weighted average entry after a buy", () => {
    const result = applyPortfolioTransaction(
      { quantity: 1, averageEntry: 100, realizedPnl: 0, cashBalance: 1000 },
      { side: "long", quantity: 1, price: 120, fees: 2 }
    );

    expect(result.quantity).toBe(2);
    expect(result.averageEntry).toBe(110);
    expect(result.cashBalance).toBe(878);
  });

  it("realizes pnl after a sell", () => {
    const result = applyPortfolioTransaction(
      { quantity: 2, averageEntry: 100, realizedPnl: 0, cashBalance: 0 },
      { side: "short", quantity: 1, price: 130, fees: 3 }
    );

    expect(result.quantity).toBe(1);
    expect(result.realizedPnl).toBe(27);
    expect(result.cashBalance).toBe(127);
  });
});

