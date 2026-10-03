import { describe, expect, it } from "vitest";
import { calculateJournalMetrics, calculateTradePnl, deriveTradeOutcome, repairLegacyLotOutcome } from "@/lib/calculations/journal";

describe("journal analytics", () => {
  it("calculates long and short pnl", () => {
    expect(
      calculateTradePnl({ side: "long", entryPrice: 100, exitPrice: 110, stopLoss: 95, quantity: 2, fees: 1, status: "closed" })
    ).toBe(19);
    expect(
      calculateTradePnl({ side: "short", entryPrice: 100, exitPrice: 90, stopLoss: 105, quantity: 2, fees: 1, status: "closed" })
    ).toBe(19);
  });

  it("calculates journal metrics", () => {
    const metrics = calculateJournalMetrics([
      { side: "long", entryPrice: 100, exitPrice: 110, stopLoss: 95, quantity: 1, fees: 0, status: "closed" },
      { side: "long", entryPrice: 100, exitPrice: 95, stopLoss: 95, quantity: 1, fees: 0, status: "closed" }
    ]);

    expect(metrics.totalTrades).toBe(2);
    expect(metrics.winRate).toBe(0.5);
    expect(metrics.netPnl).toBe(5);
    expect(metrics.profitFactor).toBe(2);
  });
});

describe("deriveTradeOutcome", () => {
  // EURUSD 0.5 lots: quantity is lots, so price x quantity is not money.
  const eurusd = {
    market: "forex" as const,
    side: "long" as const,
    status: "closed" as const,
    entryPrice: 1.1,
    stopLoss: 1.098,
    exitPrice: 1.104,
    quantity: 0.5,
    fees: 3.5
  };

  it("uses price-geometry R for a lot-based trade with no money values", () => {
    const outcome = deriveTradeOutcome(eurusd);

    expect(outcome.rMultiple).toBeCloseTo(2, 10);
    expect(outcome.riskAmount).toBeUndefined();
    expect(outcome.realizedPnl).toBeUndefined();
  });

  it("uses price-geometry R for a short lot-based trade", () => {
    const outcome = deriveTradeOutcome({ ...eurusd, side: "short", stopLoss: 1.102, exitPrice: 1.099 });

    expect(outcome.rMultiple).toBeCloseTo(0.5, 10);
  });

  it("derives P&L and fee-adjusted R from a known money risk", () => {
    const outcome = deriveTradeOutcome({ ...eurusd, riskAmount: 100 });

    expect(outcome.riskAmount).toBe(100);
    expect(outcome.realizedPnl).toBeCloseTo(196.5, 8);
    expect(outcome.rMultiple).toBeCloseTo(1.965, 10);
  });

  it("derives the money risk from a known net P&L", () => {
    const outcome = deriveTradeOutcome({ ...eurusd, realizedPnl: 196.5 });

    expect(outcome.riskAmount).toBeCloseTo(100, 8);
    expect(outcome.realizedPnl).toBe(196.5);
    expect(outcome.rMultiple).toBeCloseTo(1.965, 10);
  });

  it("takes R from P&L over risk when both money values are known", () => {
    const outcome = deriveTradeOutcome({ ...eurusd, riskAmount: 100, realizedPnl: 150 });

    expect(outcome.rMultiple).toBe(1.5);
  });

  it("leaves R empty for a lot-based trade that is open or has no stop", () => {
    expect(deriveTradeOutcome({ ...eurusd, status: "open", exitPrice: null }).rMultiple).toBeUndefined();
    expect(deriveTradeOutcome({ ...eurusd, stopLoss: null }).rMultiple).toBeUndefined();
  });

  it.each(["crypto", "stocks"] as const)("keeps unit-based %s trades on price x quantity", (market) => {
    const outcome = deriveTradeOutcome({
      market,
      side: "long",
      status: "closed",
      entryPrice: 100,
      stopLoss: 95,
      exitPrice: 110,
      quantity: 2,
      fees: 1,
      riskAmount: 40,
      realizedPnl: 50
    });

    expect(outcome).toEqual({ realizedPnl: 19, riskAmount: 10, rMultiple: 1.9 });
  });

  it("treats a forex quantity of 1,000 or more as units, where price x quantity is money", () => {
    // 0.01 lot = 1,000 units is the smallest standard forex size, so 100,000 here is one lot entered as units.
    const outcome = deriveTradeOutcome({ ...eurusd, side: "short", entryPrice: 1.082, stopLoss: 1.086, exitPrice: 1.086, quantity: 100_000, fees: 7 });

    expect(outcome.realizedPnl).toBeCloseTo(-407, 6);
    expect(outcome.riskAmount).toBeCloseTo(400, 6);
    expect(outcome.rMultiple).toBeCloseTo(-1.0175, 6);
  });

  it("estimates the money risk of a lot-based trade from the symbol preset", () => {
    // EURUSD: 200 ticks to the stop x $1 per tick per lot = $200 a lot, x 0.5 lots = $100.
    const outcome = deriveTradeOutcome({ ...eurusd, symbol: "EURUSD" });

    expect(outcome.riskAmount).toBeCloseTo(100, 6);
    expect(outcome.realizedPnl).toBeCloseTo(196.5, 6);
    expect(outcome.rMultiple).toBeCloseTo(1.965, 8);
  });

  it("matches a broker-suffixed symbol to its preset", () => {
    // XAUUSD: $5 to the stop / 0.01 tick x $1 per tick per lot = $500 a lot, x 0.1 lots = $50; a $10 move is 2R.
    const outcome = deriveTradeOutcome({
      ...eurusd,
      symbol: "XAUUSD.m",
      side: "short",
      entryPrice: 2650.5,
      stopLoss: 2655.5,
      exitPrice: 2640.5,
      quantity: 0.1,
      fees: 0
    });

    expect(outcome.riskAmount).toBeCloseTo(50, 6);
    expect(outcome.realizedPnl).toBeCloseTo(100, 6);
  });

  it("gives an open lot-based trade its preset money risk", () => {
    const outcome = deriveTradeOutcome({ ...eurusd, symbol: "EURUSD", status: "open", exitPrice: null });

    expect(outcome.riskAmount).toBeCloseTo(100, 6);
    expect(outcome.rMultiple).toBeUndefined();
  });

  it("prefers a known money risk over the preset estimate", () => {
    expect(deriveTradeOutcome({ ...eurusd, symbol: "EURUSD", riskAmount: 80 }).riskAmount).toBe(80);
  });

  it("leaves money empty for a lot-based symbol without a preset", () => {
    const outcome = deriveTradeOutcome({ ...eurusd, symbol: "EURGBP" });

    expect(outcome.riskAmount).toBeUndefined();
    expect(outcome.rMultiple).toBeCloseTo(2, 10);
  });
});

describe("calculateJournalMetrics with stored values", () => {
  const closedForex = {
    market: "forex" as const,
    side: "long" as const,
    status: "closed" as const,
    entryPrice: 1.1,
    stopLoss: 1.098,
    quantity: 0.5,
    fees: 3.5
  };

  it("uses stored P&L and R instead of price x lots", () => {
    const metrics = calculateJournalMetrics([
      { ...closedForex, exitPrice: 1.104, realizedPnl: 196.5, rMultiple: 1.965 },
      { ...closedForex, exitPrice: 1.098, realizedPnl: -100, rMultiple: -1 }
    ]);

    expect(metrics.netPnl).toBeCloseTo(96.5, 8);
    expect(metrics.grossProfit).toBeCloseTo(196.5, 8);
    expect(metrics.averageR).toBeCloseTo(0.4825, 8);
    expect(metrics.winRate).toBe(0.5);
    expect(metrics.equityCurve).toEqual([196.5, 96.5]);
  });

  it("counts a trade with no money value in the win rate and R, but not in money totals", () => {
    const metrics = calculateJournalMetrics([
      { ...closedForex, exitPrice: 1.104 },
      { market: "crypto", side: "long", status: "closed", entryPrice: 100, exitPrice: 110, stopLoss: 95, quantity: 2, fees: 1 }
    ]);

    expect(metrics.totalTrades).toBe(2);
    expect(metrics.wins).toBe(2);
    expect(metrics.netPnl).toBe(19);
    expect(metrics.expectancy).toBe(19);
    expect(metrics.equityCurve).toEqual([19]);
    expect(metrics.averageR).toBeCloseTo((2 + 1.9) / 2, 8);
  });

  it("averages R only over trades that have one", () => {
    const crypto = { market: "crypto" as const, side: "long" as const, status: "closed" as const, entryPrice: 100, exitPrice: 110, quantity: 2, fees: 1 };
    const metrics = calculateJournalMetrics([
      { ...crypto, stopLoss: null },
      { ...crypto, stopLoss: 95 }
    ]);

    expect(metrics.averageR).toBeCloseTo(1.9, 8);
  });
});

describe("repairLegacyLotOutcome", () => {
  // A forex row saved before lots were understood: P&L, risk and R were price x lots.
  const legacy = {
    market: "forex" as const,
    symbol: "EURUSD",
    side: "long" as const,
    status: "closed" as const,
    entryPrice: 1.1,
    stopLoss: 1.098,
    exitPrice: 1.104,
    quantity: 0.5,
    fees: 3.5,
    realizedPnl: -3.498,
    riskAmount: 0.001,
    rMultiple: -3498
  };

  it("recomputes every value that the old formula produced", () => {
    const repaired = repairLegacyLotOutcome(legacy);

    expect(repaired?.riskAmount).toBeCloseTo(100, 6);
    expect(repaired?.realizedPnl).toBeCloseTo(196.5, 6);
    expect(repaired?.rMultiple).toBeCloseTo(1.965, 8);
  });

  it("clears money it cannot know for a symbol without a preset", () => {
    const repaired = repairLegacyLotOutcome({ ...legacy, symbol: "EURGBP" });

    expect(repaired).toMatchObject({ riskAmount: null, realizedPnl: null });
    expect(repaired?.rMultiple).toBeCloseTo(2, 10);
  });

  it("keeps a value the trader typed and derives the rest from it", () => {
    const repaired = repairLegacyLotOutcome({ ...legacy, symbol: "EURGBP", riskAmount: 100 });

    expect(repaired?.riskAmount).toBe(100);
    expect(repaired?.realizedPnl).toBeCloseTo(196.5, 6);
    expect(repaired?.rMultiple).toBeCloseTo(1.965, 8);
  });

  it("matches values rounded by the database columns", () => {
    // realizedPnl is Decimal(18,6) and rMultiple Decimal(12,4); a stored -1.2345678 R would read back as -1.2346.
    const repaired = repairLegacyLotOutcome({ ...legacy, exitPrice: 1.1000123, realizedPnl: -3.499994, riskAmount: 0.001, rMultiple: -3499.9939 });

    expect(repaired).not.toBeNull();
  });

  it("keeps a break-even P&L, which the old formula got right", () => {
    // Exit at entry: price x lots - fees is just -fees, the real result (an MT5 import stores the same).
    const repaired = repairLegacyLotOutcome({ ...legacy, symbol: "EURGBP", exitPrice: 1.1, realizedPnl: -3.5, riskAmount: 0.001, rMultiple: -3500 });

    expect(repaired?.realizedPnl).toBe(-3.5);
    expect(repaired?.riskAmount).toBeNull();
    expect(repaired?.rMultiple).toBe(0);
  });

  it("leaves rows alone when nothing came from the old formula", () => {
    expect(repairLegacyLotOutcome({ ...legacy, realizedPnl: 196.5, riskAmount: 100, rMultiple: 1.965 })).toBeNull();
    expect(repairLegacyLotOutcome({ ...legacy, realizedPnl: null, riskAmount: null, rMultiple: null })).toBeNull();
  });

  it("leaves unit-quantity forex rows and other markets alone", () => {
    expect(
      repairLegacyLotOutcome({ ...legacy, side: "short", entryPrice: 1.082, stopLoss: 1.086, exitPrice: 1.086, quantity: 100_000, fees: 7, realizedPnl: -407, riskAmount: 400, rMultiple: -1.0175 })
    ).toBeNull();
    expect(repairLegacyLotOutcome({ ...legacy, market: "crypto" })).toBeNull();
  });
});


describe("setup metrics (ladder legs counted as one entry)", () => {
  const opened = (seconds: number) => new Date(Date.UTC(2026, 7, 29, 20, 4, 44) + seconds * 1000);
  const leg = (ladderKey: string | undefined, realizedPnl: number, riskAmount: number, quantity = 0.05, seconds = 0) => ({
    market: "crypto" as const,
    side: "long" as const,
    status: "closed" as const,
    entryPrice: 100,
    exitPrice: 101,
    stopLoss: 99,
    quantity,
    fees: 0,
    ladderKey,
    openedAt: opened(seconds),
    realizedPnl,
    riskAmount,
    rMultiple: realizedPnl / riskAmount
  });

  it("sums a ladder's legs into one setup and keeps single trades as their own setups", () => {
    const metrics = calculateJournalMetrics([leg("K", 10, 20), leg("K", -5, 20, 0.05, 1), leg("K", -20, 20, 0.05, 1), leg(undefined, 8, 10)]);

    expect(metrics.totalTrades).toBe(4);
    expect(metrics.setups.count).toBe(2);
    expect(metrics.setups.combined).toBe(1);
    expect(metrics.setups.wins).toBe(1);
    expect(metrics.setups.losses).toBe(1);
    expect(metrics.setups.winRate).toBe(0.5);
    // Ladder: -15 on 60 risk = -0.25R; single: 8 on 10 = 0.8R.
    expect(metrics.setups.averageR).toBeCloseTo((-0.25 + 0.8) / 2, 10);
    expect(metrics.setups.expectancy).toBeCloseTo((-15 + 8) / 2, 10);
  });

  it("joins legs stored by separate imports into one entry", () => {
    // Legs 2 and 3 came from a report that missed leg 1; leg 1 arrived with a later report.
    const metrics = calculateJournalMetrics([
      { ...leg("K", -5, 20, 0.05, 1), ladderLeg: 2, ladderSize: 3 },
      { ...leg("K", -20, 20, 0.05, 1), ladderLeg: 3, ladderSize: 3 },
      { ...leg("K", 10, 20), ladderLeg: 1, ladderSize: 3 }
    ]);

    expect(metrics.setups).toMatchObject({ count: 1, combined: 1, pendingLegs: 0, expectancy: -15 });
  });

  it("leaves a ladder out until every leg is closed, and says how many closed legs wait", () => {
    const open = { ...leg("K", 0, 20, 0.05, 1), status: "open" as const, exitPrice: null, realizedPnl: null, rMultiple: null };
    const metrics = calculateJournalMetrics([leg("K", 10, 20), open, leg(undefined, 8, 10)]);

    expect(metrics.setups).toMatchObject({ count: 1, combined: 0, pendingLegs: 1, expectancy: 8 });
  });

  it("leaves a ladder out while fewer legs than its declared size are recorded", () => {
    const metrics = calculateJournalMetrics([
      { ...leg("K", 10, 20), ladderLeg: 1, ladderSize: 3 },
      { ...leg("K", -5, 20, 0.05, 1), ladderLeg: 2, ladderSize: 3 },
      leg(undefined, 8, 10)
    ]);

    expect(metrics.setups).toMatchObject({ count: 1, pendingLegs: 2, expectancy: 8 });
  });

  it("estimates a leg's unknown risk from its siblings, which share the stop", () => {
    // Leg 2 exited at the entry (after the stop moved to break-even), so no risk follows from its P&L.
    const breakEven = { ...leg("K", -1, 1, 0.05, 1), market: "forex" as const, exitPrice: 100, riskAmount: null, rMultiple: null };
    const metrics = calculateJournalMetrics([leg("K", 30, 25), breakEven]);

    expect(metrics.setups.count).toBe(1);
    // Risk per unit 25 / 0.05, times the entry size 0.1 = 50; P&L 29.
    expect(metrics.setups.averageR).toBeCloseTo(29 / 50, 10);
  });

  it("weights leg R by size when the money risk is unknown", () => {
    // Lot-based legs without a preset symbol: R is known, money is not.
    const noRisk = (quantity: number, rMultiple: number) => ({ ...leg("K", 0, 1, quantity), market: "forex" as const, realizedPnl: null, riskAmount: null, rMultiple });
    const metrics = calculateJournalMetrics([noRisk(0.3, 1), noRisk(0.1, -1)]);

    expect(metrics.setups.count).toBe(1);
    expect(metrics.setups.averageR).toBeCloseTo(0.5, 10);
    expect(metrics.setups.wins).toBe(1);
  });
});

describe("drawdown", () => {
  const closed = (realizedPnl: number, rMultiple: number | null = null) => ({
    market: "crypto" as const,
    side: "long" as const,
    status: "closed" as const,
    entryPrice: 100,
    exitPrice: 101,
    stopLoss: null,
    quantity: 1,
    fees: 0,
    realizedPnl,
    rMultiple
  });

  it("measures the deepest fall of cumulative P&L from its best point, starting from zero", () => {
    // A journal that never went above zero still has a drawdown: 0 to the -276.51 low.
    const metrics = calculateJournalMetrics([closed(-2.54), closed(-100), closed(20), closed(-193.97)]);

    expect(metrics.maxDrawdownAmount).toBeCloseTo(276.51, 8);
  });

  it("measures a fall after a profitable run from that run's peak", () => {
    const metrics = calculateJournalMetrics([closed(100), closed(-30), closed(-50), closed(200), closed(-10)]);

    expect(metrics.maxDrawdownAmount).toBeCloseTo(80, 8);
  });

  it("has no drawdown while the curve only rises", () => {
    expect(calculateJournalMetrics([closed(10), closed(20), closed(5)]).maxDrawdownAmount).toBe(0);
  });

  it("measures drawdown in R on the cumulative R of trades that have one", () => {
    const metrics = calculateJournalMetrics([closed(20, 2), closed(-10, -1), closed(5, null), closed(-10, -1), closed(-10, -1), closed(10, 1)]);

    // Cumulative R: 2, 1, 0, -1, 0 -> 3R from the peak.
    expect(metrics.maxDrawdownR).toBeCloseTo(3, 10);
  });

  it("does not report a percentage it has no balance for", () => {
    // Journal trades carry no account balance, so a drawdown % would be relative to nothing.
    const metrics = calculateJournalMetrics([closed(-10)]);

    expect(metrics).not.toHaveProperty("maxDrawdown");
    expect(metrics.maxDrawdownPct).toBeNull();
  });

  it("gives the drawdown as a share of the account when the starting balance is known", () => {
    // 10,000 deposit; the balance falls to 9,723.49 at the low: 276.51 / 10,000.
    const metrics = calculateJournalMetrics([closed(-2.54), closed(-100), closed(20), closed(-193.97)], { startingBalance: 10_000 });

    expect(metrics.maxDrawdownPct).toBeCloseTo(0.027651, 8);
  });

  it("measures the share from the account's highest balance", () => {
    // 1,000 start, up to 1,500, down to 1,200: 300 / 1,500.
    const metrics = calculateJournalMetrics([closed(500), closed(-300)], { startingBalance: 1_000 });

    expect(metrics.maxDrawdownPct).toBeCloseTo(0.2, 10);
  });
});
