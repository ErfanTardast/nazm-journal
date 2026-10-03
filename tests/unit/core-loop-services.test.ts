import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { createStrategy, updateStrategy } from "@/lib/services/strategies";
import { createTradePlan, updateTradePlan } from "@/lib/services/trade-plans";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/services/trades", () => ({ createTrade: vi.fn() }));

const USER = "user-1";
const SIZING = {
  symbol: "EURUSD",
  direction: "buy" as const,
  balance: 10000,
  riskPercent: 1,
  entry: 1.1,
  stopLoss: 1.098,
  finalTp: 1.106,
  totalVolume: 0.48,
  riskMoney: 100,
  lossAtStop: 96,
  finalRr: 3,
  legs: [{ volume: 0.48, takeProfit: 1.106, rr: 3 }],
  sizedAt: "2026-10-02T08:00:00.000Z"
};
const STRATEGY_INPUT = {
  name: "Range fade",
  entryRules: ["Sweep of the range low"],
  exitRules: ["Range midpoint"],
  invalidationRules: [],
  riskRules: [],
  allowedMarkets: ["forex" as const],
  timeframes: [],
  allowedSessions: [],
  checklist: [],
  commonMistakes: [],
  idealMarketConditions: [],
  tags: [],
  status: "active",
  isActive: true
};
const PLAN_INPUT = { market: "forex" as const, symbol: "EURUSD", bias: "Range", entryZone: "1.0850-1.0870", checklist: {}, status: "planned" as const };

let strategy: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
let tradePlan: { create: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };

beforeEach(async () => {
  const { prisma } = await import("@/lib/db/prisma");
  strategy = {
    create: vi.fn(async ({ data }) => ({ id: "strat-1", ...data })),
    update: vi.fn(async ({ data }) => ({ id: "strat-1", ...data })),
    findFirst: vi.fn(async () => ({ id: "strat-1", userId: USER }))
  };
  tradePlan = {
    create: vi.fn(async ({ data }) => ({ id: "plan-1", ...data })),
    updateMany: vi.fn(async () => ({ count: 1 })),
    findFirst: vi.fn(async () => ({ id: "plan-1", userId: USER, status: "planned", convertedTradeId: null }))
  };
  Object.assign(prisma, { strategy, tradePlan });
});

describe("strategy risk limits in the service", () => {
  it("stores the limits a new strategy was given", async () => {
    await createStrategy(USER, { ...STRATEGY_INPUT, riskPerTradePct: 0.5, maxDailyLossPct: 2, maxOpenPositions: 3 });
    expect(strategy.create.mock.calls[0][0].data).toMatchObject({ riskPerTradePct: 0.5, maxDailyLossPct: 2, maxOpenPositions: 3 });
  });

  it("writes none for a strategy created without them", async () => {
    await createStrategy(USER, STRATEGY_INPUT);
    const data = strategy.create.mock.calls[0][0].data;
    for (const key of ["riskPerTradePct", "maxDailyLossPct", "maxOpenPositions"]) expect(data[key], key).toBeUndefined();
  });

  it("clears a limit set to null and leaves the ones that were not sent", async () => {
    await updateStrategy(USER, { id: "strat-1", riskPerTradePct: null, maxOpenPositions: 2 });
    const data = strategy.update.mock.calls[0][0].data;
    expect(data.riskPerTradePct).toBeNull();
    expect(data.maxOpenPositions).toBe(2);
    expect(data.maxDailyLossPct).toBeUndefined();
  });

  it("never lets a request mark a strategy as sample data", async () => {
    await createStrategy(USER, { ...STRATEGY_INPUT, isSample: true } as never);
    expect(strategy.create.mock.calls[0][0].data.isSample).toBeUndefined();
  });
});

describe("plan sizing in the service", () => {
  it("stores the sizing a new plan was given", async () => {
    await createTradePlan(USER, { ...PLAN_INPUT, sizing: SIZING });
    expect(tradePlan.create.mock.calls[0][0].data.sizing).toEqual(SIZING);
  });

  it("writes none for a plan created without it", async () => {
    await createTradePlan(USER, PLAN_INPUT);
    expect(tradePlan.create.mock.calls[0][0].data.sizing).toBeUndefined();
  });

  it("saves the sizing on an update, in the same conditional write as the rest", async () => {
    await updateTradePlan(USER, { id: "plan-1", riskPercent: 1, sizing: SIZING });
    expect(tradePlan.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = tradePlan.updateMany.mock.calls[0][0];
    expect(where).toMatchObject({ id: "plan-1", userId: USER, convertedTradeId: null });
    expect(data.sizing).toEqual(SIZING);
    expect(data.riskPercent).toBe(1);
  });

  it("clears the sizing when it is set to null, and leaves it alone when it is not sent", async () => {
    await updateTradePlan(USER, { id: "plan-1", sizing: null });
    expect(tradePlan.updateMany.mock.calls[0][0].data.sizing).toBe(Prisma.JsonNull);
    await updateTradePlan(USER, { id: "plan-1", notes: "x" });
    expect(tradePlan.updateMany.mock.calls[1][0].data.sizing).toBeUndefined();
  });

  // The risk desk names the status it loaded the plan with instead of writing one.
  it("applies an update that names the expected status only while the plan still has it, and never writes it", async () => {
    await updateTradePlan(USER, { id: "plan-1", expectedStatus: "planned", sizing: SIZING });
    const { where, data } = tradePlan.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: "plan-1", userId: USER, convertedTradeId: null, status: "planned" });
    expect(data.status).toBeUndefined();
    expect(data).not.toHaveProperty("expectedStatus");
  });

  it("refuses with a conflict when the plan no longer has the expected status", async () => {
    tradePlan.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(updateTradePlan(USER, { id: "plan-1", expectedStatus: "planned", sizing: SIZING })).rejects.toMatchObject({ status: 409 });
  });

  it("never lets a request mark a plan as sample data", async () => {
    await createTradePlan(USER, { ...PLAN_INPUT, isSample: true } as never);
    expect(tradePlan.create.mock.calls[0][0].data.isSample).toBeUndefined();
  });
});
