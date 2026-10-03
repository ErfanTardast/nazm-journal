import { describe, expect, it } from "vitest";
import {
  allocateVolumes,
  calculateTargets,
  calculateTargetsRaw,
  lossPerLot,
  normalizePriceAdverse,
  normalizePriceNearest,
  normalizeVolumeDown,
  planPosition,
  SYMBOL_PRESETS,
  specFromPreset,
  validateGeometry,
  volumeDigits,
  type SymbolSpec
} from "@/lib/calculations/position-plan";

// Fixtures ported from the MQL5 RiskMath tests (same inputs, same expectations).
const spec01: SymbolSpec = { digits: 2, tickSize: 0.01, tickValue: 1, volumeMin: 0.1, volumeMax: 100, volumeStep: 0.1 };
const collisionSpec: SymbolSpec = { digits: 0, tickSize: 1, tickValue: 1, volumeMin: 0.1, volumeMax: 100, volumeStep: 0.1 };
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

describe("RiskMath parity: targets", () => {
  it.each([
    ["CASE 1 BUY 3R", "buy", 100, 95, 115, 3, [105, 110, 115]],
    ["CASE 2 SELL 3R", "sell", 100, 105, 85, 3, [95, 90, 85]],
    ["CASE 3 BUY 2.6R", "buy", 100, 95, 113, 3, [104.333333333333, 108.666666666667, 113]],
    ["CASE 4 BUY two positions", "buy", 100, 95, 110, 2, [105, 110]]
  ] as const)("%s", (_name, direction, entry, sl, tp, positions, expected) => {
    const result = calculateTargetsRaw(direction, entry, sl, tp, positions);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets).toHaveLength(expected.length);
    result.targets.forEach((target, i) => expect(near(target, expected[i])).toBe(true));
    expect(result.targets[positions - 1]).toBe(tp);
  });

  it("CASE 5 and 6 reject inverted geometry", () => {
    expect(validateGeometry("buy", 100, 105, 115)).toMatchObject({ ok: false, code: "buy_geometry" });
    expect(validateGeometry("sell", 100, 95, 85)).toMatchObject({ ok: false, code: "sell_geometry" });
  });

  it("rejects TP levels that collapse to the same broker tick and keeps the final TP", () => {
    const result = calculateTargets("buy", 100, 95, 102, 3, collisionSpec);
    expect(result).toMatchObject({ ok: false, code: "tp_collapse" });
    expect(result.ok ? null : result.message).toMatch(/collapse to the same broker tick/);
  });
});

describe("RiskMath parity: volume allocation", () => {
  it("CASE 7 distributes 0.8 as 0.3/0.3/0.2 without exceeding the safe total", () => {
    const result = allocateVolumes(0.8, 3, spec01);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.volumes).toEqual([0.3, 0.3, 0.2]);
    expect(result.allocatedTotal).toBeLessThanOrEqual(0.8 + 1e-10);
  });

  it("redistributes 0.4 as 0.2/0.1/0.1", () => {
    const result = allocateVolumes(0.4, 3, spec01);
    expect(result.ok && result.volumes).toEqual([0.2, 0.1, 0.1]);
  });

  it("rejects a total too small for the broker minimum on every leg", () => {
    expect(allocateVolumes(0.2, 3, spec01)).toMatchObject({ ok: false, code: "volume_below_min" });
  });
});

describe("normalization helpers", () => {
  const eurusd = specFromPreset("EURUSD", 1.1);

  it("counts volume digits from the step", () => {
    expect(volumeDigits(0.01)).toBe(2);
    expect(volumeDigits(0.1)).toBe(1);
    expect(volumeDigits(1)).toBe(0);
  });

  it("rounds prices to the nearest tick", () => {
    expect(normalizePriceNearest(1.100004, eurusd)).toBe(1.1);
    expect(normalizePriceNearest(1.100006, eurusd)).toBe(1.10001);
  });

  it("rounds a sizing entry against the trader: BUY up, SELL down, on-grid prices unchanged", () => {
    expect(normalizePriceAdverse(1.100004, "buy", eurusd)).toBe(1.10001);
    expect(normalizePriceAdverse(1.100006, "sell", eurusd)).toBe(1.1);
    expect(normalizePriceAdverse(1.1, "buy", eurusd)).toBe(1.1);
  });

  it("floors volume to the broker step", () => {
    expect(normalizeVolumeDown(0.4999, eurusd)).toBe(0.49);
    expect(normalizeVolumeDown(0.5, eurusd)).toBe(0.5);
  });
});

describe("lossPerLot", () => {
  it("prices a USD-quoted pair at a fixed tick value", () => {
    expect(near(lossPerLot(1.1, 1.098, specFromPreset("EURUSD", 1.1)), 200)).toBe(true);
  });

  it("converts a USD-based pair through the price", () => {
    const usdjpy = specFromPreset("USDJPY", 150);
    expect(near(lossPerLot(150, 149.5, usdjpy), 333.333333, 1e-4)).toBe(true);
  });
});

describe("planPosition", () => {
  const base = {
    direction: "buy" as const,
    balance: 10_000,
    riskPercent: 1,
    entry: 1.1,
    stopLoss: 1.098,
    finalTp: 1.106,
    positions: 3,
    spec: specFromPreset("EURUSD", 1.1)
  };

  it("sizes, splits and ladders a EURUSD plan", () => {
    const result = planPosition(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.riskMoney).toBe(100);
    expect(near(result.plan.lossPerLot, 200)).toBe(true);
    expect(result.plan.totalVolume).toBe(0.5);
    expect(result.plan.legs.map((leg) => leg.volume)).toEqual([0.17, 0.17, 0.16]);
    expect(result.plan.legs.map((leg) => leg.takeProfit)).toEqual([1.102, 1.104, 1.106]);
    expect(near(result.plan.finalRr, 3)).toBe(true);
    expect(near(result.plan.allocatedSlLoss, 100)).toBe(true);
  });

  it("adds commission to the loss per lot, so the size shrinks", () => {
    const result = planPosition({ ...base, commissionPerLot: 7 });
    expect(result.ok && result.plan.totalVolume).toBe(0.48);
    expect(result.ok && near(result.plan.allocatedSlLoss, 0.48 * 207)).toBe(true);
  });

  it("sizes from the entry after assumed slippage against the trader", () => {
    const result = planPosition({ ...base, slippagePoints: 10 });
    expect(result.ok && near(result.plan.lossPerLot, 210)).toBe(true);
  });

  it("refuses a plan whose size is below the broker minimum", () => {
    expect(planPosition({ ...base, balance: 50 })).toMatchObject({ ok: false, code: "volume_below_min" });
  });

  it("refuses inverted geometry and invalid inputs", () => {
    expect(planPosition({ ...base, stopLoss: 1.101 })).toMatchObject({ ok: false, code: "buy_geometry" });
    expect(planPosition({ ...base, riskPercent: 0 })).toMatchObject({ ok: false, code: "risk_invalid" });
    expect(planPosition({ ...base, positions: 0 })).toMatchObject({ ok: false, code: "positions" });
  });

  it("offers the common presets", () => {
    expect(Object.keys(SYMBOL_PRESETS)).toEqual(expect.arrayContaining(["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"]));
  });
});
