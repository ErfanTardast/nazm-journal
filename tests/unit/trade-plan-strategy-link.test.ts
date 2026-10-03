import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn(async () => ({ id: "user-1" })) }));
vi.mock("@/lib/security/audit", () => ({ auditLog: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/services/trades", () => ({ createTrade: vi.fn(async () => ({ id: "trade-1" })) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { prisma } from "@/lib/db/prisma";
import { createTrade } from "@/lib/services/trades";
import { convertTradePlan, createTradePlan, updateTradePlan } from "@/lib/services/trade-plans";
import { PATCH, POST } from "@/app/api/trade-plans/route";

const USER = "user-1";
const OWN_STRATEGY = "strat-mine";
const OTHER_USERS_STRATEGY = "strat-theirs";
const PLAN_INPUT = { market: "forex" as const, symbol: "EURUSD", bias: "Range", entryZone: "1.0850-1.0870", checklist: {}, status: "planned" as const };

type Mock = ReturnType<typeof vi.fn>;
let strategy: { findFirst: Mock };
let tradePlan: { create: Mock; updateMany: Mock; update: Mock; findFirst: Mock };

beforeEach(() => {
  vi.clearAllMocks();
  // Only the strategy whose id is OWN_STRATEGY belongs to the signed-in user; the lookup is filtered by user like the service's.
  strategy = {
    findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) =>
      where.id === OWN_STRATEGY && where.userId === USER ? { id: OWN_STRATEGY } : null
    )
  };
  tradePlan = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "plan-12345", ...data })),
    updateMany: vi.fn(async () => ({ count: 1 })),
    update: vi.fn(async () => ({ id: "plan-12345" })),
    findFirst: vi.fn(async () => ({ id: "plan-12345", userId: USER, status: "planned", convertedTradeId: null, isSample: false, bias: "Range", checklist: {} }))
  };
  Object.assign(prisma, { strategy, tradePlan });
});

describe("a plan can only be linked to one of the user's own strategies", () => {
  it("refuses to create a plan with another user's strategy, and writes nothing", async () => {
    await expect(createTradePlan(USER, { ...PLAN_INPUT, strategyId: OTHER_USERS_STRATEGY })).rejects.toMatchObject({ status: 422, code: "VALIDATION_ERROR" });
    expect(strategy.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: OTHER_USERS_STRATEGY, userId: USER } }));
    expect(tradePlan.create).not.toHaveBeenCalled();
  });

  it("names the strategy field, so the screen can show it in the page language", async () => {
    const error = await createTradePlan(USER, { ...PLAN_INPUT, strategyId: "no-such-strategy" }).catch((caught: unknown) => caught);
    expect((error as { details: { fieldErrors: Record<string, unknown> } }).details.fieldErrors).toHaveProperty("strategyId");
  });

  it("creates the plan with a strategy of the user's own", async () => {
    await createTradePlan(USER, { ...PLAN_INPUT, strategyId: OWN_STRATEGY });
    expect(tradePlan.create.mock.calls[0][0].data.strategyId).toBe(OWN_STRATEGY);
  });

  it("does not look up a strategy for a plan created without one", async () => {
    await createTradePlan(USER, PLAN_INPUT);
    expect(strategy.findFirst).not.toHaveBeenCalled();
    expect(tradePlan.create.mock.calls[0][0].data.strategyId).toBeUndefined();
  });

  it("refuses to attach another user's strategy to an existing plan, and writes nothing", async () => {
    await expect(updateTradePlan(USER, { id: "plan-12345", strategyId: OTHER_USERS_STRATEGY })).rejects.toMatchObject({ status: 422 });
    expect(tradePlan.updateMany).not.toHaveBeenCalled();
  });

  it("attaches a strategy of the user's own in the same conditional write as before", async () => {
    await updateTradePlan(USER, { id: "plan-12345", status: "planned", strategyId: OWN_STRATEGY });
    expect(tradePlan.updateMany).toHaveBeenCalledTimes(1);
    const { where, data } = tradePlan.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: "plan-12345", userId: USER, convertedTradeId: null, status: { not: "closed" } });
    expect(data.strategyId).toBe(OWN_STRATEGY);
  });

  it("clears the strategy when an update sends null, without a strategy lookup", async () => {
    await updateTradePlan(USER, { id: "plan-12345", strategyId: null });
    expect(strategy.findFirst).not.toHaveBeenCalled();
    expect(tradePlan.updateMany.mock.calls[0][0].data.strategyId).toBeNull();
  });

  it("leaves the strategy alone when an update does not send it", async () => {
    await updateTradePlan(USER, { id: "plan-12345", notes: "Moved the stop" });
    expect(tradePlan.updateMany.mock.calls[0][0].data.strategyId).toBeUndefined();
  });

  it("still answers not found for a plan that is not the user's, before it looks at the strategy", async () => {
    tradePlan.findFirst.mockResolvedValueOnce(null);
    await expect(updateTradePlan(USER, { id: "plan-99999", strategyId: OWN_STRATEGY })).rejects.toMatchObject({ status: 404 });
    expect(tradePlan.updateMany).not.toHaveBeenCalled();
  });

  it("still cannot reopen a converted plan while attaching a strategy", async () => {
    tradePlan.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(updateTradePlan(USER, { id: "plan-12345", status: "planned", strategyId: OWN_STRATEGY })).rejects.toMatchObject({ status: 409 });
  });
});

describe("the plan routes keep the link honest", () => {
  const send = (handler: typeof PATCH | typeof POST, method: string, body: object) =>
    handler(new Request("http://localhost/api/trade-plans", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

  it("POST answers 422 for a strategy that is not the user's, and creates nothing", async () => {
    const response = await send(POST, "POST", { market: "crypto", symbol: "btcusdt", bias: "Above 65k", entryZone: "64600-65100", strategyId: OTHER_USERS_STRATEGY });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.details.fieldErrors).toHaveProperty("strategyId");
    expect(tradePlan.create).not.toHaveBeenCalled();
  });

  it("PATCH with strategyId null detaches the strategy", async () => {
    const response = await send(PATCH, "PATCH", { id: "plan-12345", status: "planned", strategyId: null });
    expect(response.status).toBe(200);
    expect(tradePlan.updateMany.mock.calls[0][0].data).toMatchObject({ strategyId: null, status: "planned" });
  });

  it("PATCH with another user's strategy answers 422 and writes nothing", async () => {
    const response = await send(PATCH, "PATCH", { id: "plan-12345", status: "planned", strategyId: OTHER_USERS_STRATEGY });
    expect(response.status).toBe(422);
    expect(tradePlan.updateMany).not.toHaveBeenCalled();
  });
});

describe("a sample plan cannot be converted", () => {
  it("answers a conflict and records nothing: the sample rows go away with the first real trade", async () => {
    tradePlan.findFirst.mockResolvedValueOnce({ id: "plan-12345", userId: USER, status: "planned", convertedTradeId: null, isSample: true, bias: "Range", checklist: {} });
    await expect(convertTradePlan(USER, "plan-12345", { entryPrice: 1.1, quantity: 1, fees: 0 })).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
    // The plan is not even claimed (closed), and no trade is created.
    expect(tradePlan.updateMany).not.toHaveBeenCalled();
    expect(createTrade).not.toHaveBeenCalled();
    expect(tradePlan.update).not.toHaveBeenCalled();
  });

  it("still converts a plan of the user's own", async () => {
    await convertTradePlan(USER, "plan-12345", { entryPrice: 1.1, quantity: 1, fees: 0 });
    expect(createTrade).toHaveBeenCalledTimes(1);
  });
});

describe("a converted plan only hands its strategy to the trade when the trade can keep it", () => {
  const CONVERT = { entryPrice: 1.1, quantity: 1, fees: 0 };
  const planWithStrategy = (strategyId: string) => ({ id: "plan-12345", userId: USER, status: "planned", convertedTradeId: null, isSample: false, strategyId, bias: "Range", checklist: {} });
  const strategyOf = (id: string, isSample: boolean) => strategy.findFirst.mockImplementation(async ({ where }: { where: { id: string; userId: string } }) => (where.id === id && where.userId === USER ? { isSample } : null));

  it("keeps the id of a strategy of the user's own", async () => {
    tradePlan.findFirst.mockResolvedValueOnce(planWithStrategy(OWN_STRATEGY));
    strategyOf(OWN_STRATEGY, false);
    await convertTradePlan(USER, "plan-12345", CONVERT);
    expect(strategy.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: OWN_STRATEGY, userId: USER } }));
    expect(createTrade).toHaveBeenCalledWith(USER, expect.objectContaining({ strategyId: OWN_STRATEGY }));
  });

  it("sends no strategy for a real plan linked to a sample strategy: the first real trade removes the sample one", async () => {
    tradePlan.findFirst.mockResolvedValueOnce(planWithStrategy("strat-sample"));
    strategyOf("strat-sample", true);
    await convertTradePlan(USER, "plan-12345", CONVERT);
    expect(createTrade).toHaveBeenCalledTimes(1);
    expect(createTrade).toHaveBeenCalledWith(USER, expect.objectContaining({ strategyId: null }));
    // The plan itself is still converted as usual.
    expect(tradePlan.update).toHaveBeenLastCalledWith({ where: { id: "plan-12345" }, data: { status: "closed", convertedTradeId: "trade-1" } });
  });

  it("sends no strategy for a plan that points at someone else's strategy", async () => {
    tradePlan.findFirst.mockResolvedValueOnce(planWithStrategy(OTHER_USERS_STRATEGY));
    strategyOf(OWN_STRATEGY, false);
    await convertTradePlan(USER, "plan-12345", CONVERT);
    expect(createTrade).toHaveBeenCalledWith(USER, expect.objectContaining({ strategyId: null }));
  });

  it("does not look up a strategy for a plan without one", async () => {
    tradePlan.findFirst.mockResolvedValueOnce({ ...planWithStrategy(OWN_STRATEGY), strategyId: null });
    await convertTradePlan(USER, "plan-12345", CONVERT);
    expect(strategy.findFirst).not.toHaveBeenCalled();
    expect(createTrade).toHaveBeenCalledWith(USER, expect.objectContaining({ strategyId: null }));
  });

  it("looks the strategy up before it claims the plan, so a failed lookup leaves the plan as it was", async () => {
    tradePlan.findFirst.mockResolvedValueOnce(planWithStrategy(OWN_STRATEGY));
    strategy.findFirst.mockRejectedValueOnce(new Error("db down"));
    await expect(convertTradePlan(USER, "plan-12345", CONVERT)).rejects.toThrow("db down");
    expect(tradePlan.updateMany).not.toHaveBeenCalled();
    expect(createTrade).not.toHaveBeenCalled();
  });
});
