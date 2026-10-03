import { describe, expect, it } from "vitest";
import { calculateForexLotSize, calculatePositionSize, estimateLiquidation } from "@/lib/calculations/risk";

describe("risk calculations", () => {
  it("calculates position size from account risk and stop distance", () => {
    const result = calculatePositionSize({
      accountBalance: 10_000,
      riskPercent: 1,
      entryPrice: 100,
      stopLoss: 95
    });

    expect(result.riskAmount).toBe(100);
    expect(result.quantity).toBe(20);
    expect(result.notionalValue).toBe(2000);
  });

  it("calculates forex standard lots", () => {
    const result = calculateForexLotSize({
      accountBalance: 25_000,
      riskPercent: 1,
      stopLossPips: 25,
      pipValuePerStandardLot: 10
    });

    expect(result.standardLots).toBe(1);
    expect(result.microLots).toBe(100);
  });

  it("estimates long liquidation below entry", () => {
    const result = estimateLiquidation({ side: "long", entryPrice: 100, leverage: 10, maintenanceMarginPercent: 0.5 });
    expect(result.liquidationPrice).toBeCloseTo(90.5);
  });
});

