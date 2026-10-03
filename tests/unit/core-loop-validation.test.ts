import { describe, expect, it } from "vitest";
import { planSizingSchema, strategyCreateSchema, strategyUpdateSchema, tradePlanCreateSchema, tradePlanUpdateSchema } from "@/lib/validation/trading";

const ID = "ckv1a2b3c4d5e6f7g8h9i0j1k";
const STRATEGY = { name: "Range fade", entryRules: ["Sweep of the range low"], exitRules: ["Range midpoint"], allowedMarkets: ["forex"] };
const PLAN = { market: "forex", symbol: "eurusd", bias: "Range between the two sessions", entryZone: "1.0850-1.0870" };

const SIZING = {
  symbol: "EURUSD",
  direction: "buy",
  balance: 10000,
  riskPercent: 1,
  entry: 1.1,
  stopLoss: 1.098,
  finalTp: 1.106,
  totalVolume: 0.48,
  riskMoney: 100,
  lossAtStop: 96,
  finalRr: 3,
  legs: [
    { volume: 0.16, takeProfit: 1.102, rr: 1 },
    { volume: 0.16, takeProfit: 1.104, rr: 2 },
    { volume: 0.16, takeProfit: 1.106, rr: 3 }
  ],
  sizedAt: "2026-10-02T08:00:00.000Z"
};

describe("strategy risk limits", () => {
  it("are optional: a strategy without them is still valid and gets none invented", () => {
    const parsed = strategyCreateSchema.parse(STRATEGY);
    for (const key of ["riskPerTradePct", "maxDailyLossPct", "maxOpenPositions"]) expect(parsed, key).not.toHaveProperty(key);
  });

  it("accept typed numbers, Persian digits included", () => {
    const parsed = strategyCreateSchema.parse({ ...STRATEGY, riskPerTradePct: "۰٫۵", maxDailyLossPct: "2", maxOpenPositions: "۳" });
    expect(parsed).toMatchObject({ riskPerTradePct: 0.5, maxDailyLossPct: 2, maxOpenPositions: 3 });
  });

  it("can be cleared with null on an update, and are left alone when not sent", () => {
    expect(strategyUpdateSchema.parse({ id: ID, riskPerTradePct: null })).toEqual({ id: ID, riskPerTradePct: null });
    expect(strategyUpdateSchema.parse({ id: ID, name: "London breakout" })).toEqual({ id: ID, name: "London breakout" });
  });

  it.each([
    ["zero risk per trade", { riskPerTradePct: 0 }],
    ["risk per trade over 100%", { riskPerTradePct: 101 }],
    ["a negative daily loss", { maxDailyLossPct: -1 }],
    ["a daily loss over 100%", { maxDailyLossPct: 100.5 }],
    ["zero open positions", { maxOpenPositions: 0 }],
    ["a fractional number of positions", { maxOpenPositions: 1.5 }],
    ["more than 100 positions", { maxOpenPositions: 101 }],
    ["a limit that is not a number", { riskPerTradePct: "a lot" }]
  ])("refuse %s", (_name, patch) => {
    expect(strategyCreateSchema.safeParse({ ...STRATEGY, ...patch }).success).toBe(false);
    expect(strategyUpdateSchema.safeParse({ id: ID, ...patch }).success).toBe(false);
  });
});

describe("plan sizing", () => {
  it("is optional on a plan and never invented", () => {
    expect(tradePlanCreateSchema.parse(PLAN)).not.toHaveProperty("sizing");
    expect(tradePlanUpdateSchema.parse({ id: ID, notes: "x" })).toEqual({ id: ID, notes: "x" });
  });

  it("is kept as sent when it is whole", () => {
    expect(planSizingSchema.parse(SIZING)).toEqual(SIZING);
    expect(tradePlanUpdateSchema.parse({ id: ID, sizing: SIZING })).toEqual({ id: ID, sizing: SIZING });
    expect(tradePlanCreateSchema.parse({ ...PLAN, sizing: SIZING }).sizing).toEqual(SIZING);
  });

  it("can be cleared with null", () => {
    expect(tradePlanUpdateSchema.parse({ id: ID, sizing: null })).toEqual({ id: ID, sizing: null });
  });

  it("an update may name the status it expects the plan to have; a new plan may not", () => {
    expect(tradePlanUpdateSchema.parse({ id: ID, expectedStatus: "active" })).toEqual({ id: ID, expectedStatus: "active" });
    expect(tradePlanUpdateSchema.safeParse({ id: ID, expectedStatus: "archived" }).success).toBe(false);
    expect(tradePlanCreateSchema.safeParse({ ...PLAN, expectedStatus: "planned" }).success).toBe(false);
  });

  it.each([
    ["an unknown key", { ...SIZING, leverage: 50 }],
    ["a direction that is not buy or sell", { ...SIZING, direction: "long" }],
    ["no legs", { ...SIZING, legs: [] }],
    ["more than 20 legs", { ...SIZING, legs: Array.from({ length: 21 }, () => SIZING.legs[0]) }],
    ["a leg with an unknown key", { ...SIZING, legs: [{ ...SIZING.legs[0], note: "x" }] }],
    ["a zero volume", { ...SIZING, totalVolume: 0 }],
    ["risk over 100%", { ...SIZING, riskPercent: 150 }],
    ["a number sent as text", { ...SIZING, balance: "10000" }],
    ["a number that is not finite", { ...SIZING, finalRr: Number.POSITIVE_INFINITY }],
    ["a date that is not a date", { ...SIZING, sizedAt: "yesterday" }],
    ["a symbol over 24 characters", { ...SIZING, symbol: "X".repeat(25) }],
    ["a missing field", (({ lossAtStop: _lossAtStop, ...rest }) => rest)(SIZING)]
  ])("refuses %s", (_name, sizing) => {
    expect(planSizingSchema.safeParse(sizing).success).toBe(false);
    expect(tradePlanUpdateSchema.safeParse({ id: ID, sizing }).success).toBe(false);
  });
});
