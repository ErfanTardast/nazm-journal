import { describe, expect, it } from "vitest";
import { planPosition, specFromPreset, type Direction, type PositionPlan } from "@/lib/calculations/position-plan";
import { resolveRiskLimits } from "@/lib/calculations/plan-risk-check";
import { formatMoney } from "@/lib/i18n/format";
import { planSizingSchema, tradePlanUpdateSchema } from "@/lib/validation/trading";
import {
  buildPlanSizing,
  buildPlanUpdate,
  openPlans,
  plannerPrefill,
  sizingViolations,
  symbolPresetFor,
  tickAdjustedPrices,
  type DeskPlan,
  type PlannerSnapshot
} from "@/features/risk/plan-sizing";

function plan(overrides: Partial<DeskPlan> = {}): DeskPlan {
  return {
    id: "plan_12345",
    symbol: "EURUSD",
    bias: "Constructive above support",
    entryZone: "1.0850 - 1.0870",
    status: "planned",
    stopLoss: "1.08000000",
    takeProfit: "1.09500000",
    riskAmount: null,
    riskPercent: "0.5000",
    checklist: { newsChecked: true, direction: "long" },
    sizing: null,
    strategy: { id: "strat_12345", name: "Breakout", riskPerTradePct: "0.7500", maxDailyLossPct: null, maxOpenPositions: 2 },
    ...overrides
  };
}

const settings = { riskPerTradePct: 1, maxDailyLossPct: 3, startingBalance: 25000 };

function snapshot(overrides: Partial<{ symbol: string; direction: Direction; balance: number; risk: number; entry: number; stopLoss: number; finalTp: number; positions: number }> = {}): PlannerSnapshot {
  const input = { symbol: "EURUSD", direction: "buy" as Direction, balance: 10000, risk: 1, entry: 1.1, stopLoss: 1.098, finalTp: 1.106, positions: 3, ...overrides };
  const spec = specFromPreset(input.symbol, input.entry);
  return {
    symbol: input.symbol,
    direction: input.direction,
    balance: input.balance,
    riskPercent: input.risk,
    entry: input.entry,
    stopLoss: input.stopLoss,
    finalTp: input.finalTp,
    positions: input.positions,
    lotDigits: 2,
    result: planPosition({
      direction: input.direction,
      balance: input.balance,
      riskPercent: input.risk,
      entry: input.entry,
      stopLoss: input.stopLoss,
      finalTp: input.finalTp,
      positions: input.positions,
      spec
    })
  };
}

describe("symbolPresetFor", () => {
  it("finds the desk's preset for the way traders write a symbol", () => {
    expect(symbolPresetFor("EURUSD")).toBe("EURUSD");
    expect(symbolPresetFor("eurusd")).toBe("EURUSD");
    expect(symbolPresetFor(" EUR/USD ")).toBe("EURUSD");
    expect(symbolPresetFor("XAU-USD")).toBe("XAUUSD");
  });

  it("has no preset for anything else (and never matches an object property)", () => {
    expect(symbolPresetFor("BTCUSDT")).toBeNull();
    expect(symbolPresetFor("")).toBeNull();
    expect(symbolPresetFor("constructor")).toBeNull();
    expect(symbolPresetFor("__proto__")).toBeNull();
  });
});

describe("plannerPrefill", () => {
  it("fills the planner from the plan, the strategy and the account", () => {
    const { prefill, sources } = plannerPrefill(plan(), settings);
    expect(prefill).toEqual({
      symbol: "EURUSD",
      direction: "buy",
      balance: "25000",
      risk: "0.5",
      entry: "1.086",
      stopLoss: "1.08",
      finalTp: "1.095",
      positions: "3"
    });
    expect(sources).toMatchObject({ symbol: "preset", direction: "chosen", balance: "account", risk: "plan", entry: "midpoint" });
  });

  it("turns a short plan into a sell, and guesses the side of an older plan from its bias", () => {
    expect(plannerPrefill(plan({ checklist: { direction: "short" } }), settings).prefill.direction).toBe("sell");
    const older = plannerPrefill(plan({ checklist: {}, bias: "Bearish below the range" }), settings);
    expect(older.prefill.direction).toBe("sell");
    expect(older.sources.direction).toBe("guessed");
    expect(plannerPrefill(plan({ checklist: null }), settings).prefill.direction).toBe("buy");
  });

  it("uses the symbol 'custom' for a symbol with no preset", () => {
    const { prefill, sources } = plannerPrefill(plan({ symbol: "BTCUSDT", entryZone: "64600-65100", stopLoss: 63750, takeProfit: 67000 }), settings);
    expect(prefill.symbol).toBe("custom");
    expect(sources.symbol).toBe("custom");
    expect(prefill.entry).toBe("64850");
    expect(prefill.stopLoss).toBe("63750");
    expect(prefill.finalTp).toBe("67000");
  });

  it("leaves the contract spec empty for a symbol with no preset: an example spec would be made up", () => {
    const { prefill } = plannerPrefill(plan({ symbol: "EURGBP", entryZone: "0.8500-0.8520", stopLoss: 0.845, takeProfit: 0.865 }), settings);
    expect(prefill.symbol).toBe("custom");
    for (const key of ["digits", "tickSize", "tickValue", "volumeMin", "volumeMax", "volumeStep"] as const) {
      expect(prefill[key], key).toBe("");
    }
    // Even when the plan was sized before: the spec was never stored with it.
    const sized = {
      symbol: "custom",
      direction: "buy",
      balance: 12000,
      riskPercent: 0.5,
      entry: 0.851,
      stopLoss: 0.845,
      finalTp: 0.865,
      totalVolume: 0.5,
      riskMoney: 60,
      lossAtStop: 59.5,
      finalRr: 2,
      legs: [{ volume: 0.5, takeProfit: 0.865, rr: 2 }],
      sizedAt: "2026-10-01T10:00:00.000Z"
    };
    expect(plannerPrefill(plan({ symbol: "EURGBP", sizing: sized }), settings).prefill.tickValue).toBe("");
  });

  it("does not fill the spec fields for a symbol that has a preset (the preset is the spec)", () => {
    const { prefill } = plannerPrefill(plan(), settings);
    for (const key of ["digits", "tickSize", "tickValue", "volumeMin", "volumeMax", "volumeStep"] as const) {
      expect(prefill[key], key).toBeUndefined();
    }
  });

  it("takes the risk % from the plan, else the strategy's limit, else the account default", () => {
    expect(plannerPrefill(plan(), settings).prefill.risk).toBe("0.5");
    const fromStrategy = plannerPrefill(plan({ riskPercent: null }), settings);
    expect(fromStrategy.prefill.risk).toBe("0.75");
    expect(fromStrategy.sources.risk).toBe("strategy");
    const fromAccount = plannerPrefill(plan({ riskPercent: "0", strategy: null }), settings);
    expect(fromAccount.prefill.risk).toBe("1");
    expect(fromAccount.sources.risk).toBe("account");
    const nothing = plannerPrefill(plan({ riskPercent: null, strategy: null }), null);
    expect(nothing.prefill.risk).toBe("1");
    expect(nothing.sources.risk).toBe("default");
  });

  it("does not make up a balance, an entry, a stop or a take profit", () => {
    const { prefill, sources } = plannerPrefill(plan({ entryZone: "wait for a pullback", stopLoss: null, takeProfit: null }), { riskPerTradePct: 1, maxDailyLossPct: 3, startingBalance: null });
    expect(prefill.balance).toBe("");
    expect(prefill.entry).toBe("");
    expect(prefill.stopLoss).toBe("");
    expect(prefill.finalTp).toBe("");
    expect(sources).toMatchObject({ balance: "none", entry: "none", entryZone: "wait for a pullback" });
    expect(plannerPrefill(plan(), null).prefill.balance).toBe("");
  });

  it("reads a plain single-number entry zone as that number", () => {
    const { prefill, sources } = plannerPrefill(plan({ entryZone: "1.0850" }), settings);
    expect(prefill.entry).toBe("1.085");
    expect(sources.entry).toBe("single");
  });

  describe("an entry zone that gives a price", () => {
    it("is used when it lies strictly between the plan's stop loss and take profit, in either direction", () => {
      expect(plannerPrefill(plan({ entryZone: "1.0850" }), settings).prefill.entry).toBe("1.085");
      const short = plannerPrefill(plan({ entryZone: "1.0860", checklist: { direction: "short" }, stopLoss: "1.09500000", takeProfit: "1.08000000" }), settings);
      expect(short.prefill.entry).toBe("1.086");
      expect(short.sources.entry).toBe("single");
    });

    it("is not used when it lies outside, or on, the stop loss or the take profit: the trader types the entry", () => {
      for (const zone of ["1.2000", "1.0700", "1.0800", "1.0950", "8", "0.12"]) {
        const { prefill, sources } = plannerPrefill(plan({ entryZone: zone }), settings);
        expect(prefill.entry, zone).toBe("");
        expect(sources.entry, zone).toBe("outside");
        expect(sources.entryZone).toBe(zone);
      }
      const range = plannerPrefill(plan({ entryZone: "1.2000-1.2100" }), settings);
      expect(range.prefill.entry).toBe("");
      expect(range.sources.entry).toBe("outside");
    });

    // A plan may have only one of the two levels. A lone number that is nowhere near it ("London 8" on a pair that
    // trades at 1.08) is a time or a count, not this plan's entry.
    it("with only a stop loss or only a take profit, is used only when it is a different price of the same size", () => {
      const onlyStop = { stopLoss: "1.08000000", takeProfit: null };
      const onlyTarget = { stopLoss: null, takeProfit: "1.09500000" };
      for (const levels of [onlyStop, onlyTarget]) {
        const near = plannerPrefill(plan({ entryZone: "1.0850", ...levels }), settings);
        expect(near.prefill.entry).toBe("1.085");
        expect(near.sources.entry).toBe("single");
        for (const zone of ["London 8", "week 2", "ATR 14", "65.000"]) {
          const far = plannerPrefill(plan({ entryZone: zone, ...levels }), settings);
          expect(far.prefill.entry, zone).toBe("");
          expect(far.sources.entry, zone).toBe("outside");
        }
      }
      // The stop itself is not an entry.
      expect(plannerPrefill(plan({ entryZone: "1.0800", ...onlyStop }), settings).prefill.entry).toBe("");
    });

    it("says 'none' when the zone has no price at all, and never reads a time as one", () => {
      for (const zone of ["London open 8 am", "ساعت ۱۰", "کندل ۴ ساعته", "RSI 30", "200 EMA retest"]) {
        const { prefill, sources } = plannerPrefill(plan({ entryZone: zone }), settings);
        expect(prefill.entry, zone).toBe("");
        expect(sources.entry, zone).toBe("none");
      }
    });

    it("cannot check a zone against a stop or a target the plan does not have yet", () => {
      expect(plannerPrefill(plan({ entryZone: "1.2000", takeProfit: null }), settings).prefill.entry).toBe("1.2");
      expect(plannerPrefill(plan({ entryZone: "1.2000", stopLoss: null }), settings).prefill.entry).toBe("1.2");
      expect(plannerPrefill(plan({ entryZone: "1.2000", stopLoss: null, takeProfit: null }), settings).sources.entry).toBe("single");
    });

    it("never overrides the entry the plan was last sized with", () => {
      const sized = {
        symbol: "EURUSD",
        direction: "buy",
        balance: 12000,
        riskPercent: 0.5,
        entry: 1.2,
        stopLoss: 1.08,
        finalTp: 1.3,
        totalVolume: 0.5,
        riskMoney: 60,
        lossAtStop: 59.5,
        finalRr: 1.7,
        legs: [{ volume: 0.5, takeProfit: 1.3, rr: 1.7 }],
        sizedAt: "2026-10-01T10:00:00.000Z"
      };
      expect(plannerPrefill(plan({ sizing: sized, entryZone: "wait" }), settings).prefill.entry).toBe("1.2");
    });
  });

  it("starts again from what the plan was last sized with", () => {
    const sized = {
      symbol: "EURUSD",
      direction: "buy",
      balance: 12000,
      riskPercent: 0.5,
      entry: 1.0855,
      stopLoss: 1.08,
      finalTp: 1.095,
      totalVolume: 0.5,
      riskMoney: 60,
      lossAtStop: 59.5,
      finalRr: 1.7,
      legs: [
        { volume: 0.25, takeProfit: 1.09, rr: 0.8 },
        { volume: 0.25, takeProfit: 1.095, rr: 1.7 }
      ],
      sizedAt: "2026-10-01T10:00:00.000Z"
    };
    const { prefill, sources } = plannerPrefill(plan({ sizing: sized }), settings);
    expect(prefill.balance).toBe("12000");
    expect(prefill.entry).toBe("1.0855");
    expect(prefill.positions).toBe("2");
    expect(sources).toMatchObject({ balance: "sizing", entry: "sizing" });
  });

  it("ignores a stored sizing that is not a sizing", () => {
    const { prefill } = plannerPrefill(plan({ sizing: { balance: "lots", legs: "none" } }), settings);
    expect(prefill.balance).toBe("25000");
    expect(prefill.positions).toBe("3");
  });
});

describe("openPlans", () => {
  it("keeps only the plans that can still be sized", () => {
    const list = [plan({ id: "a_12345", status: "planned" }), plan({ id: "b_12345", status: "active" }), plan({ id: "c_12345", status: "closed" }), plan({ id: "d_12345", status: "canceled" })];
    expect(openPlans(list).map((item) => item.id)).toEqual(["a_12345", "b_12345"]);
  });
});

describe("buildPlanSizing", () => {
  it("stores exactly what the planner shows, in a shape the API accepts", () => {
    const now = new Date("2026-10-02T09:30:00.000Z");
    const sizing = buildPlanSizing(snapshot(), now);
    expect(sizing).toEqual({
      symbol: "EURUSD",
      direction: "buy",
      balance: 10000,
      riskPercent: 1,
      entry: 1.1,
      stopLoss: 1.098,
      finalTp: 1.106,
      totalVolume: 0.5,
      riskMoney: 100,
      lossAtStop: 100,
      finalRr: 3,
      legs: [
        { volume: 0.17, takeProfit: 1.102, rr: 1 },
        { volume: 0.17, takeProfit: 1.104, rr: 2 },
        { volume: 0.16, takeProfit: 1.106, rr: 3 }
      ],
      sizedAt: "2026-10-02T09:30:00.000Z"
    });
    expect(planSizingSchema.safeParse(sizing).success).toBe(true);
  });

  it("rounds money to cents and R to two places, the way the planner prints them", () => {
    const sizing = buildPlanSizing(snapshot({ balance: 12345.67, risk: 0.35, entry: 1.0855, stopLoss: 1.0812, finalTp: 1.0961 }), new Date());
    expect(sizing).not.toBeNull();
    const result = snapshot({ balance: 12345.67, risk: 0.35, entry: 1.0855, stopLoss: 1.0812, finalTp: 1.0961 }).result as { ok: true; plan: PositionPlan };
    // The planner prints money with formatMoney and R with toFixed(2); what is stored reads the same as what was printed.
    expect(formatMoney(sizing!.riskMoney, "en")).toBe(formatMoney(result.plan.riskMoney, "en"));
    expect(formatMoney(sizing!.lossAtStop, "en")).toBe(formatMoney(result.plan.allocatedSlLoss, "en"));
    expect(sizing!.finalRr).toBe(Number(result.plan.finalRr.toFixed(2)));
    expect(sizing!.lossAtStop).toBeLessThanOrEqual(sizing!.riskMoney);
    expect(sizing!.legs.map((leg) => leg.volume)).toEqual(result.plan.legs.map((leg) => leg.volume));
    expect(planSizingSchema.safeParse(sizing).success).toBe(true);
  });

  it("stores a half cent the way the screen rounds it (balance 5075 at 0.7% is a 35.53 budget)", () => {
    const shown = snapshot({ balance: 5075, risk: 0.7 });
    const result = shown.result as { ok: true; plan: PositionPlan };
    expect(formatMoney(result.plan.riskMoney, "en")).toBe("$35.53");
    expect(buildPlanSizing(shown, new Date())!.riskMoney).toBe(35.53);
  });

  it("never stores a money amount that reads differently from what the planner printed", () => {
    let checked = 0;
    for (const balance of [1000, 2500.5, 5075, 12345.67, 20000, 33333.33, 98765.43]) {
      for (const risk of [0.1, 0.25, 0.35, 0.5, 0.7, 0.75, 1, 1.25, 1.5, 2]) {
        for (const stopLoss of [1.098, 1.0975, 1.0962]) {
          const shown = snapshot({ balance, risk, stopLoss });
          if (!shown.result.ok) continue;
          const sizing = buildPlanSizing(shown, new Date())!;
          expect(formatMoney(sizing.riskMoney, "en")).toBe(formatMoney(shown.result.plan.riskMoney, "en"));
          expect(formatMoney(sizing.lossAtStop, "en")).toBe(formatMoney(shown.result.plan.allocatedSlLoss, "en"));
          expect(formatMoney(sizing.riskMoney, "fa")).toBe(formatMoney(shown.result.plan.riskMoney, "fa"));
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("stores the prices the legs are built on (snapped to the symbol's tick), not the raw text", () => {
    const sizing = buildPlanSizing(snapshot({ entry: 1.100004, stopLoss: 1.098, finalTp: 1.106 }), new Date());
    expect(sizing!.entry).toBe(1.1);
  });

  it("is null when the planner has no valid result", () => {
    expect(buildPlanSizing(snapshot({ direction: "sell" }), new Date())).toBeNull();
    expect(buildPlanSizing({ ...snapshot(), result: { ok: false, code: "invalid_number", message: "x" } }, new Date())).toBeNull();
  });

  it("is null when the plan would have more legs than a plan can store", () => {
    const many = snapshot({ balance: 10_000_000, positions: 21 });
    expect(many.result.ok).toBe(true);
    expect(buildPlanSizing(many, new Date())).toBeNull();
  });

  it("names a custom symbol 'custom'", () => {
    const base = snapshot();
    expect(buildPlanSizing({ ...base, symbol: "custom" }, new Date())!.symbol).toBe("custom");
  });
});

describe("tickAdjustedPrices", () => {
  it("is null when every typed price is already on the symbol's tick", () => {
    expect(tickAdjustedPrices(snapshot())).toBeNull();
    expect(tickAdjustedPrices(snapshot({ entry: 1.0855, stopLoss: 1.0812, finalTp: 1.0961 }))).toBeNull();
  });

  it("gives the prices as saved when the tick moved a typed one", () => {
    expect(tickAdjustedPrices(snapshot({ entry: 1.100004 }))).toEqual({ entry: 1.1, stopLoss: 1.098, finalTp: 1.106 });
    expect(tickAdjustedPrices(snapshot({ stopLoss: 1.0980049 }))?.stopLoss).toBe(1.098);
  });

  it("is null when there is no valid result to compare", () => {
    expect(tickAdjustedPrices(snapshot({ direction: "sell" }))).toBeNull();
    expect(tickAdjustedPrices({ ...snapshot(), entry: Number.NaN })).toBeNull();
  });
});

describe("buildPlanUpdate", () => {
  const now = new Date("2026-10-02T09:30:00.000Z");

  it("names the status it loaded, and sends the sized numbers and a ticked risk box, and nothing the plan already has", () => {
    const body = buildPlanUpdate(plan({ status: "active" }), snapshot(), now);
    expect(body).toEqual({
      id: "plan_12345",
      expectedStatus: "active",
      stopLoss: 1.098,
      takeProfit: 1.106,
      riskPercent: 1,
      riskAmount: 100,
      sizing: expect.objectContaining({ totalVolume: 0.5, lossAtStop: 100, sizedAt: "2026-10-02T09:30:00.000Z" }),
      checklist: { newsChecked: true, direction: "long", riskCalculated: true }
    });
    expect(Object.keys(body!).sort()).toEqual(["checklist", "expectedStatus", "id", "riskAmount", "riskPercent", "sizing", "stopLoss", "takeProfit"]);
    expect(tradePlanUpdateSchema.safeParse(body).success).toBe(true);
  });

  it("keeps the plan's own checklist entries and works for a plan with none", () => {
    expect(buildPlanUpdate(plan({ checklist: null }), snapshot(), now)!.checklist).toEqual({ riskCalculated: true });
    expect(buildPlanUpdate(plan({ checklist: { riskCalculated: false, strategyMatched: true } }), snapshot(), now)!.checklist).toEqual({ riskCalculated: true, strategyMatched: true });
  });

  it("is null when the planner is sizing the other side than the plan's own, even with valid numbers", () => {
    const sell = snapshot({ direction: "sell", entry: 1.1, stopLoss: 1.102, finalTp: 1.094 });
    expect(sell.result.ok).toBe(true);
    expect(buildPlanUpdate(plan({ checklist: { direction: "long" } }), sell, now)).toBeNull();
    expect(buildPlanUpdate(plan({ checklist: { direction: "short" } }), sell, now)).not.toBeNull();
    // A plan with no saved direction has nothing to contradict.
    expect(buildPlanUpdate(plan({ checklist: {} }), sell, now)).not.toBeNull();
    expect(buildPlanUpdate(plan({ checklist: null }), sell, now)).not.toBeNull();
  });

  it("is null when there is nothing valid to save, and for a plan that is not open", () => {
    expect(buildPlanUpdate(plan(), snapshot({ direction: "sell" }), now)).toBeNull();
    expect(buildPlanUpdate(plan({ status: "closed" }), snapshot(), now)).toBeNull();
    expect(buildPlanUpdate(plan({ status: "canceled" }), snapshot(), now)).toBeNull();
  });
});

describe("sizingViolations", () => {
  const limits = resolveRiskLimits({ riskPerTradePct: 0.75, maxOpenPositions: 2 }, { riskPerTradePct: 1, maxDailyLossPct: 3 });

  it("is empty inside the limits", () => {
    expect(sizingViolations(limits, 0.5, 2)).toEqual([]);
  });

  it("reports the risk limit with both numbers and where the limit comes from", () => {
    expect(sizingViolations(limits, 1.5, 1)).toEqual([{ code: "risk_per_trade", limit: 0.75, actual: 1.5, source: "strategy" }]);
  });

  it("reports a risk above the daily loss limit", () => {
    const codes = sizingViolations(limits, 4, 1).map((violation) => violation.code);
    expect(codes).toEqual(["risk_per_trade", "daily_loss"]);
  });

  it("counts the plan's own positions against the open-positions limit", () => {
    expect(sizingViolations(limits, 0.5, 3)).toEqual([{ code: "open_positions", limit: 2, actual: 3, source: "strategy" }]);
    expect(sizingViolations(limits, 0.5, 2)).toEqual([]);
  });

  it("stays quiet about numbers that are not there yet", () => {
    expect(sizingViolations(limits, Number.NaN, Number.NaN)).toEqual([]);
    expect(sizingViolations(limits, 0.5, 0)).toEqual([]);
  });
});
