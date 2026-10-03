import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createTradePlan, convertTradePlan, listTradePlans, deleteTradePlan, updateTradePlan } from "@/lib/services/trade-plans";

const MOCK_PLAN = {
  id: "plan-1",
  userId: "user-1",
  strategyId: "strat-1",
  market: "crypto",
  symbol: "BTCUSDT",
  bias: "Bullish above 65k",
  entryZone: "64600-65100",
  stopLoss: "63750",
  takeProfit: "67000",
  riskAmount: "125",
  riskPercent: "0.5",
  checklist: { newsChecked: true, riskCalculated: true, strategyMatched: true },
  invalidationRule: "Close below session midpoint invalidates the plan.",
  relevantNews: null,
  notes: null,
  status: "planned",
  convertedTradeId: null,
  plannedFor: null,
  createdAt: new Date("2026-06-19T08:00:00Z"),
  updatedAt: new Date("2026-06-19T08:00:00Z"),
  strategy: null,
  newsItems: []
};

const MOCK_TRADE = {
  id: "trade-1",
  userId: "user-1",
  symbol: "BTCUSDT",
  market: "crypto",
  side: "long",
  status: "open",
  entryPrice: "65000",
  exitPrice: null,
  quantity: "0.1"
};

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/api/errors", () => ({
  notFound: (msg: string) => Object.assign(new Error(msg), { status: 404 }),
  conflict: (msg: string) => Object.assign(new Error(msg), { status: 409 })
}));
vi.mock("@/lib/services/trades", () => ({
  createTrade: vi.fn(async () => MOCK_TRADE)
}));

describe("trade-plans service", () => {
  const USER = "user-1";
  let prismaFindFirst: ReturnType<typeof vi.fn>;
  let prismaFindMany: ReturnType<typeof vi.fn>;
  let prismaCreate: ReturnType<typeof vi.fn>;
  let prismaUpdate: ReturnType<typeof vi.fn>;
  let prismaDelete: ReturnType<typeof vi.fn>;
  let prismaUpdateMany: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    prismaFindFirst = vi.fn(async () => MOCK_PLAN);
    prismaFindMany = vi.fn(async () => [MOCK_PLAN]);
    prismaCreate = vi.fn(async () => MOCK_PLAN);
    prismaUpdate = vi.fn(async () => ({ ...MOCK_PLAN, status: "closed" }));
    prismaDelete = vi.fn(async () => MOCK_PLAN);
    prismaUpdateMany = vi.fn(async () => ({ count: 1 }));
    Object.assign(prisma, {
      tradePlan: {
        findFirst: prismaFindFirst,
        findMany: prismaFindMany,
        create: prismaCreate,
        update: prismaUpdate,
        updateMany: prismaUpdateMany,
        delete: prismaDelete
      },
      // The plan's strategy ("strat-1") is one of the user's own and not a sample one.
      strategy: { findFirst: vi.fn(async () => ({ isSample: false })) }
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("listTradePlans returns all plans for user with strategy included", async () => {
    const plans = await listTradePlans(USER);
    expect(prismaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER },
        include: expect.objectContaining({ strategy: true })
      })
    );
    expect(plans).toHaveLength(1);
  });

  it("createTradePlan creates a plan with correct fields", async () => {
    await createTradePlan(USER, {
      market: "crypto",
      symbol: "BTCUSDT",
      bias: "Bullish",
      entryZone: "64600-65100",
      checklist: {},
      status: "planned"
    });
    expect(prismaCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: USER, symbol: "BTCUSDT", market: "crypto" })
      })
    );
  });

  it("deleteTradePlan throws notFound when plan does not belong to user", async () => {
    prismaFindFirst.mockResolvedValueOnce(null);
    await expect(deleteTradePlan(USER, "other-plan")).rejects.toThrow("Trade plan not found");
  });

  describe("updateTradePlan", () => {
    // The write is one conditional updateMany, so the check and the write cannot be split by a conversion that lands in between.
    // This stand-in applies the same filter the database would, against the plan row the test hands it.
    function databaseRow(row: Record<string, unknown>) {
      const written: Record<string, unknown>[] = [];
      prismaFindFirst.mockImplementation(async () => ({ ...row, ...Object.assign({}, ...written) }));
      prismaUpdateMany.mockImplementation(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const current = { ...row, ...Object.assign({}, ...written) };
        const statusFilter = where.status as { not?: string } | undefined;
        const matches =
          where.id === current.id &&
          where.userId === current.userId &&
          (!("convertedTradeId" in where) || where.convertedTradeId === current.convertedTradeId) &&
          (!statusFilter?.not || current.status !== statusFilter.not);
        if (matches) written.push(data);
        return { count: matches ? 1 : 0 };
      });
      return written;
    }

    it("updates an open plan the user owns, in one conditional write", async () => {
      const written = databaseRow(MOCK_PLAN);
      await updateTradePlan(USER, { id: "plan-1", status: "active", checklist: { direction: "long" } });
      expect(prismaUpdateMany).toHaveBeenCalledWith({
        where: { id: "plan-1", userId: USER, convertedTradeId: null, status: { not: "closed" } },
        data: expect.objectContaining({ status: "active" })
      });
      expect(written).toHaveLength(1);
      expect(prismaUpdate).not.toHaveBeenCalled();
    });

    it("returns the plan as it is after the write", async () => {
      databaseRow(MOCK_PLAN);
      const plan = await updateTradePlan(USER, { id: "plan-1", status: "active" });
      expect(plan).toMatchObject({ id: "plan-1", status: "active" });
    });

    it("throws notFound when the plan does not belong to the user", async () => {
      prismaFindFirst.mockResolvedValueOnce(null);
      await expect(updateTradePlan(USER, { id: "other-plan", status: "active" })).rejects.toMatchObject({ status: 404 });
      expect(prismaUpdate).not.toHaveBeenCalled();
      expect(prismaUpdateMany).not.toHaveBeenCalled();
    });

    // A converted plan is closed; a stale tab must not reopen it (the update schema fills status "planned" by default).
    it("rejects an update of a plan that was already converted, and leaves the row unchanged", async () => {
      const written = databaseRow({ ...MOCK_PLAN, status: "closed", convertedTradeId: "trade-1" });
      await expect(updateTradePlan(USER, { id: "plan-1", status: "planned", checklist: { direction: "long" } })).rejects.toMatchObject({
        status: 409
      });
      expect(written).toEqual([]);
      expect(prismaUpdate).not.toHaveBeenCalled();
    });

    // While a conversion is in flight the plan is claimed (closed) but has no convertedTradeId yet.
    it("rejects an update that would reopen a plan a conversion has claimed, and writes nothing", async () => {
      const written = databaseRow({ ...MOCK_PLAN, status: "closed", convertedTradeId: null });
      await expect(updateTradePlan(USER, { id: "plan-1", status: "planned" })).rejects.toMatchObject({ status: 409 });
      expect(prismaUpdateMany).toHaveBeenCalledWith({
        where: { id: "plan-1", userId: USER, convertedTradeId: null, status: { not: "closed" } },
        data: expect.objectContaining({ status: "planned" })
      });
      expect(written).toEqual([]);
      expect(prismaUpdate).not.toHaveBeenCalled();
    });

    it("lets an update that closes the plan through even when it is already closed", async () => {
      const written = databaseRow({ ...MOCK_PLAN, status: "closed", convertedTradeId: null });
      await updateTradePlan(USER, { id: "plan-1", status: "closed" });
      expect(prismaUpdateMany).toHaveBeenCalledWith({
        where: { id: "plan-1", userId: USER, convertedTradeId: null },
        data: expect.objectContaining({ status: "closed" })
      });
      expect(written).toHaveLength(1);
    });
  });

  it("convertTradePlan creates a trade from the plan fields", async () => {
    const { createTrade } = await import("@/lib/services/trades");
    await convertTradePlan(USER, "plan-1", { entryPrice: 65000, quantity: 0.1, fees: 0 });
    expect(createTrade).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({
        strategyId: "strat-1",
        symbol: MOCK_PLAN.symbol,
        market: MOCK_PLAN.market,
        entryPrice: 65000,
        quantity: 0.1
      })
    );
  });

  it("convertTradePlan infers short side when bias contains 'bear'", async () => {
    prismaFindFirst.mockResolvedValueOnce({ ...MOCK_PLAN, bias: "Bearish below 60k" });
    const { createTrade } = await import("@/lib/services/trades");
    await convertTradePlan(USER, "plan-1", { entryPrice: 59000, quantity: 0.1, fees: 0 });
    expect(createTrade).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ side: "short" })
    );
  });

  describe("the side of a converted trade", () => {
    async function convertWith(overrides: Record<string, unknown>) {
      prismaFindFirst.mockResolvedValueOnce({ ...MOCK_PLAN, ...overrides });
      const { createTrade } = await import("@/lib/services/trades");
      await convertTradePlan(USER, "plan-1", { entryPrice: 100, quantity: 1, fees: 0 });
      return vi.mocked(createTrade).mock.calls.at(-1)![1] as { side: string };
    }

    it("uses the direction the trader chose on the plan, whatever language the bias is written in", async () => {
      expect((await convertWith({ bias: "نزولی زیر حمایت", checklist: { direction: "short" } })).side).toBe("short");
      expect((await convertWith({ bias: "صعودی بالای مقاومت", checklist: { direction: "short" } })).side).toBe("short");
    });

    it("lets the chosen direction win over words in the bias text", async () => {
      expect((await convertWith({ bias: "Bearish below 60k", checklist: { direction: "long" } })).side).toBe("long");
      expect((await convertWith({ bias: "Bullish above 65k", checklist: { direction: "short" } })).side).toBe("short");
    });

    it("keeps working for older plans that have no direction: Persian and English short wording", async () => {
      expect((await convertWith({ bias: "نزولی زیر حمایت", checklist: {} })).side).toBe("short");
      expect((await convertWith({ bias: "فروش در پولبک", checklist: {} })).side).toBe("short");
      expect((await convertWith({ bias: "Short below 64k", checklist: {} })).side).toBe("short");
      expect((await convertWith({ bias: "sell the rally", checklist: {} })).side).toBe("short");
    });

    it("does not turn a bullish or neutral bias into a short", async () => {
      expect((await convertWith({ bias: "صعودی بالای ۶۵ هزار", checklist: {} })).side).toBe("long");
      expect((await convertWith({ bias: "Bullish above 65k", checklist: {} })).side).toBe("long");
      expect((await convertWith({ bias: "Shortly after the open, wait", checklist: {} })).side).toBe("long");
    });

    it("reads more short wording for older plans: bears, and Persian نزول، ریزش، خرس", async () => {
      expect((await convertWith({ bias: "Bears in control below 60k", checklist: {} })).side).toBe("short");
      expect((await convertWith({ bias: "انتظار نزول زیر حمایت", checklist: {} })).side).toBe("short");
      expect((await convertWith({ bias: "ریزش پس از شکست", checklist: {} })).side).toBe("short");
      expect((await convertWith({ bias: "دید خرسی", checklist: {} })).side).toBe("short");
    });

    it("ignores a direction that is not long or short", async () => {
      expect((await convertWith({ bias: "Bearish below 60k", checklist: { direction: "sideways" } })).side).toBe("short");
    });
  });

  it("convertTradePlan refuses a plan that already became a trade, so a double click cannot record it twice", async () => {
    const { createTrade } = await import("@/lib/services/trades");
    vi.mocked(createTrade).mockClear();
    prismaFindFirst.mockResolvedValueOnce({ ...MOCK_PLAN, status: "closed", convertedTradeId: "trade-1" });
    await expect(convertTradePlan(USER, "plan-1", { entryPrice: 65000, quantity: 0.1, fees: 0 })).rejects.toMatchObject({ status: 409 });
    expect(createTrade).not.toHaveBeenCalled();
    expect(prismaUpdate).not.toHaveBeenCalled();
  });

  it("convertTradePlan claims the plan atomically, so two overlapping requests cannot both record it", async () => {
    const { createTrade } = await import("@/lib/services/trades");
    vi.mocked(createTrade).mockClear();
    prismaUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(convertTradePlan(USER, "plan-1", { entryPrice: 65000, quantity: 0.1, fees: 0 })).rejects.toMatchObject({ status: 409 });
    expect(prismaUpdateMany).toHaveBeenCalledWith({
      where: { id: "plan-1", userId: USER, convertedTradeId: null, status: { not: "closed" } },
      data: { status: "closed" }
    });
    expect(createTrade).not.toHaveBeenCalled();
  });

  it("convertTradePlan releases the claim when the trade cannot be created", async () => {
    const { createTrade } = await import("@/lib/services/trades");
    vi.mocked(createTrade).mockRejectedValueOnce(new Error("db down"));
    await expect(convertTradePlan(USER, "plan-1", { entryPrice: 65000, quantity: 0.1, fees: 0 })).rejects.toThrow("db down");
    expect(prismaUpdate).toHaveBeenCalledWith({ where: { id: "plan-1" }, data: { status: MOCK_PLAN.status } });
  });

  it("convertTradePlan marks plan as closed after conversion", async () => {
    await convertTradePlan(USER, "plan-1", { entryPrice: 65000, quantity: 0.1, fees: 0 });
    expect(prismaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "plan-1" },
        data: expect.objectContaining({ status: "closed" })
      })
    );
  });

  it("convertTradePlan sets status to closed when exitPrice is provided", async () => {
    const { createTrade } = await import("@/lib/services/trades");
    await convertTradePlan(USER, "plan-1", { entryPrice: 65000, exitPrice: 66000, quantity: 0.1, fees: 0 });
    expect(createTrade).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ status: "closed", exitPrice: 66000 })
    );
  });

  it("convertTradePlan throws notFound when plan does not belong to user", async () => {
    prismaFindFirst.mockResolvedValueOnce(null);
    await expect(convertTradePlan(USER, "other-plan", { entryPrice: 65000, quantity: 0.1, fees: 0 })).rejects.toThrow(
      "Trade plan not found"
    );
  });
});
