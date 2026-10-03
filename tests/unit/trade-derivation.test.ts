import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createTrade, getTradeMetrics, importTradesFromCsv, updateTrade } from "@/lib/services/trades";
import { tradeCreateSchema, tradeUpdateSchema } from "@/lib/validation/trading";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

const USER = "user-1";

const forexInput = {
  symbol: "EURUSD",
  market: "forex" as const,
  side: "long" as const,
  status: "closed" as const,
  entryPrice: 1.1,
  stopLoss: 1.098,
  exitPrice: 1.104,
  quantity: 0.5,
  fees: 3.5,
  ruleFollowed: "unknown" as const,
  openedAt: new Date("2026-09-01T08:00:00Z")
};

describe("trade service derived fields", () => {
  let tradeCreate: ReturnType<typeof vi.fn>;
  let tradeUpdate: ReturnType<typeof vi.fn>;
  let tradeFindFirst: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    tradeCreate = vi.fn(async ({ data }) => ({ id: "trade-1", ...data }));
    tradeUpdate = vi.fn(async ({ data }) => ({ id: "trade-1", ...data }));
    tradeFindFirst = vi.fn();
    Object.assign(prisma, {
      // An account without sample data: the first-trade check reads it and finds nothing to remove.
      user: { findUnique: vi.fn(async () => ({ sampleLoadedAt: null })) },
      asset: { upsert: vi.fn(async () => ({ id: "asset-1" })) },
      trade: { create: tradeCreate, update: tradeUpdate, findFirst: tradeFindFirst }
    });
  });

  it("stores price-geometry R and no money values for a manual forex trade without a preset", async () => {
    await createTrade(USER, { ...forexInput, symbol: "EURGBP" });

    const data = tradeCreate.mock.calls[0][0].data;
    expect(data.rMultiple).toBeCloseTo(2, 10);
    expect(data.riskAmount).toBeUndefined();
    expect(data.realizedPnl).toBeUndefined();
  });

  it("gives a new journal the trade's rule verdict when the journal does not set one", async () => {
    await createTrade(USER, tradeCreateSchema.parse({ ...forexInput, ruleFollowed: "followed", journal: { notes: "clean" } }));

    const journal = tradeCreate.mock.calls[0][0].data.journalEntry.create;
    expect(journal).toMatchObject({ notes: "clean", ruleFollowed: "followed", mistakes: [], tags: [] });
  });

  it("stores the ladder key, leg and size that tie the legs of one entry together", async () => {
    await createTrade(USER, tradeCreateSchema.parse({ ...forexInput, ladderKey: "mt5:7001|EURUSD|buy|EA/3", ladderLeg: "2", ladderSize: "3" }));

    expect(tradeCreate.mock.calls[0][0].data).toMatchObject({ ladderKey: "mt5:7001|EURUSD|buy|EA/3", ladderLeg: 2, ladderSize: 3 });
  });

  it("estimates money from the symbol preset for a manual forex trade", async () => {
    await createTrade(USER, forexInput);

    const data = tradeCreate.mock.calls[0][0].data;
    expect(data.riskAmount).toBeCloseTo(100, 6);
    expect(data.realizedPnl).toBeCloseTo(196.5, 6);
    expect(data.rMultiple).toBeCloseTo(1.965, 8);
  });

  it("keeps stored report values when a forex trade is edited without touching money fields", async () => {
    // Shape of an MT5-imported row as Prisma returns it (Decimal columns stringify to numbers).
    tradeFindFirst.mockResolvedValue({
      ...forexInput,
      id: "trade-1",
      userId: USER,
      entryPrice: "1.1",
      stopLoss: "1.098",
      exitPrice: "1.104",
      quantity: "0.5",
      fees: "3.5",
      riskAmount: "100",
      realizedPnl: "196.5",
      rMultiple: "1.965",
      journalEntry: null
    });

    await updateTrade(USER, { id: "trade-1", setupType: "breakout" });

    const data = tradeUpdate.mock.calls[0][0].data;
    expect(data.rMultiple).toBeCloseTo(1.965, 10);
    expect(data.riskAmount).toBe(100);
    expect(data.realizedPnl).toBe(196.5);
  });
});

describe("editing a forex trade's prices", () => {
  const stored = {
    ...forexInput,
    id: "trade-1",
    userId: USER,
    entryPrice: "1.1",
    stopLoss: "1.098",
    exitPrice: "1.104",
    quantity: "0.5",
    fees: "3.5",
    riskAmount: "100",
    realizedPnl: "196.5",
    rMultiple: "1.965",
    journalEntry: null
  };
  let tradeUpdate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    tradeUpdate = vi.fn(async ({ data }) => ({ id: "trade-1", ...data }));
    Object.assign(prisma, {
      asset: { upsert: vi.fn(async () => ({ id: "asset-1" })) },
      trade: { update: tradeUpdate, findFirst: vi.fn(async () => stored) }
    });
  });

  it("recomputes P&L from the kept risk when the exit changes", async () => {
    await updateTrade(USER, { id: "trade-1", exitPrice: 1.103 });

    const data = tradeUpdate.mock.calls[0][0].data;
    expect(data.riskAmount).toBe(100);
    expect(data.realizedPnl).toBeCloseTo(146.5, 6);
    expect(data.rMultiple).toBeCloseTo(1.465, 8);
  });

  it("recomputes the risk too when the stop changes", async () => {
    await updateTrade(USER, { id: "trade-1", stopLoss: 1.099 });

    const data = tradeUpdate.mock.calls[0][0].data;
    // EURUSD preset: 100 ticks x $1 x 0.5 lots = $50; the 0.004 move is 4R.
    expect(data.riskAmount).toBeCloseTo(50, 6);
    expect(data.realizedPnl).toBeCloseTo(196.5, 6);
  });

  it("keeps a broker P&L when only the stop changes, and re-derives risk and R from it", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    Object.assign(prisma.trade, { findFirst: vi.fn(async () => ({ ...stored, symbol: "GER40" })) });

    await updateTrade(USER, { id: "trade-1", stopLoss: 1.099 });

    const data = tradeUpdate.mock.calls[0][0].data;
    expect(data.realizedPnl).toBe(196.5);
    // The 0.004 move is 4R on the new 0.001 stop: risk = (196.5 + 3.5) / 4.
    expect(data.riskAmount).toBeCloseTo(50, 6);
    expect(data.rMultiple).toBeCloseTo(3.93, 8);
  });

  it("clears the stop and what depended on it when the edit sends null", async () => {
    await updateTrade(USER, { id: "trade-1", stopLoss: null });

    const data = tradeUpdate.mock.calls[0][0].data;
    expect(data.stopLoss).toBeNull();
    expect(data.riskAmount).toBeNull();
    expect(data.rMultiple).toBeNull();
    expect(data.realizedPnl).toBe(196.5);
  });

  it("leaves status, fees and money alone on an edit parsed by the API schema", async () => {
    await updateTrade(USER, tradeUpdateSchema.parse({ id: "trade-1", setupType: "breakout" }));

    const data = tradeUpdate.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
    expect(data.fees).toBeUndefined();
    expect(data.realizedPnl).toBe(196.5);
    expect(data.rMultiple).toBeCloseTo(1.965, 8);
  });

  it("updates only the journal fields an edit sends", async () => {
    await updateTrade(USER, tradeUpdateSchema.parse({ id: "trade-1", ruleFollowed: "followed", journal: { notes: "late entry" } }));

    const journal = tradeUpdate.mock.calls[0][0].data.journalEntry.upsert.update;
    expect(journal).toMatchObject({ notes: "late entry", ruleFollowed: "followed" });
    expect(journal.mistakes).toBeUndefined();
    expect(journal.tags).toBeUndefined();
  });

  it("treats an unchanged price sent again as no change", async () => {
    await updateTrade(USER, { id: "trade-1", exitPrice: 1.104, stopLoss: 1.098 });

    const data = tradeUpdate.mock.calls[0][0].data;
    expect(data.realizedPnl).toBe(196.5);
    expect(data.riskAmount).toBe(100);
  });
});

describe("getTradeMetrics", () => {
  it("reads stored money and R in close order instead of recomputing price x lots", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    const row = { ...forexInput, symbol: "EURGBP", entryPrice: "1.1", stopLoss: "1.098", quantity: "0.5", fees: "3.5", riskAmount: "100" };
    const findMany = vi.fn(async () => [
      { ...row, exitPrice: "1.098", realizedPnl: "-103.5", rMultiple: "-1.035" },
      { ...row, exitPrice: "1.104", realizedPnl: "196.5", rMultiple: "1.965" }
    ]);
    Object.assign(prisma, { trade: { findMany }, user: { findUnique: vi.fn(async () => ({ startingBalance: "10000" })) } });

    const metrics = await getTradeMetrics(USER);

    expect((findMany.mock.calls[0] as unknown[])[0]).toMatchObject({ orderBy: [{ closedAt: "asc" }, { openedAt: "asc" }] });
    expect(metrics.netPnl).toBeCloseTo(93, 8);
    expect(metrics.averageR).toBeCloseTo(0.465, 8);
    expect(metrics.equityCurve.map((value) => Number(value.toFixed(6)))).toEqual([-103.5, 93]);
    expect((findMany.mock.calls[0] as unknown[])[0]).toMatchObject({ select: { ladderKey: true, ladderLeg: true, ladderSize: true, openedAt: true } });
    expect(metrics.setups.count).toBe(2);
    // -103.5 from a 10,000 starting balance.
    expect(metrics.maxDrawdownPct).toBeCloseTo(0.01035, 10);
  });
});

describe("importing an overlapping report again", () => {
  const header = "symbol,market,side,status,entryPrice,exitPrice,quantity,openedAt,externalId";
  const rows = [
    "BTCUSD,crypto,long,closed,78000,78100,0.1,2026-08-29T20:04:44,mt5:7001:1001",
    "BTCUSD,crypto,long,closed,78000,78200,0.1,2026-08-29T20:04:45,mt5:7001:1002",
    "BTCUSD,crypto,long,closed,78000,78200,0.1,2026-08-29T20:04:45,mt5:7001:1002"
  ];
  const mapping = Object.fromEntries(header.split(",").map((field) => [field, field]));
  let tradeCreate: ReturnType<typeof vi.fn>;
  let findMany: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    tradeCreate = vi.fn(async ({ data }) => ({ id: "trade-new", ...data }));
    findMany = vi.fn(async () => [{ externalId: "mt5:7001:1001" }]);
    Object.assign(prisma, {
      user: { findUnique: vi.fn(async () => ({ sampleLoadedAt: null })) },
      tradeImport: { create: vi.fn(async () => ({ id: "import-1" })), update: vi.fn(async () => ({})) },
      tradeImportRow: { create: vi.fn(async ({ data }) => ({ id: `row-${data.rowNumber}` })), update: vi.fn(async () => ({})) },
      asset: { upsert: vi.fn(async () => ({ id: "asset-1" })) },
      trade: { create: tradeCreate, findMany }
    });
  });

  it("skips positions already in the journal and repeats within the file", async () => {
    const result = await importTradesFromCsv(USER, { csv: [header, ...rows].join("\n"), mapping, previewOnly: false });

    expect(result).toMatchObject({ imported: 1, duplicates: 2, invalidRows: 0 });
    expect(tradeCreate).toHaveBeenCalledTimes(1);
    expect(tradeCreate.mock.calls[0][0].data.externalId).toBe("mt5:7001:1002");
    expect((findMany.mock.calls[0] as unknown[])[0]).toMatchObject({ where: { userId: USER, externalId: { in: ["mt5:7001:1001", "mt5:7001:1002"] } } });
  });

  it("reads zone-less open and close times in the import's time zone", async () => {
    findMany.mockResolvedValue([]);
    const csv = ["symbol,market,side,status,entryPrice,exitPrice,quantity,openedAt,closedAt,externalId", "BTCUSD,crypto,long,closed,78000,78100,0.1,2026-08-29T20:04:44,2026-08-29T20:30:00,mt5:7001:1001"].join("\n");
    const withClose = { ...mapping, closedAt: "closedAt" };

    await importTradesFromCsv(USER, { csv, mapping: withClose, previewOnly: false, timeZone: "mt5:new-york-close" });

    const data = tradeCreate.mock.calls[0][0].data;
    expect(new Date(data.openedAt).toISOString()).toBe("2026-08-29T17:04:44.000Z");
    expect(new Date(data.closedAt).toISOString()).toBe("2026-08-29T17:30:00.000Z");
  });

  it("marks known positions in the preview", async () => {
    const result = await importTradesFromCsv(USER, { csv: [header, ...rows].join("\n"), mapping, previewOnly: true });

    expect(result.duplicates).toBe(2);
    expect(result.preview.map((row) => row.duplicate)).toEqual([true, false, true]);
    expect(tradeCreate).not.toHaveBeenCalled();
  });

  it("counts a position another import created meanwhile as a duplicate", async () => {
    findMany.mockResolvedValue([]);
    tradeCreate.mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));

    const result = await importTradesFromCsv(USER, { csv: [header, rows[0], rows[1]].join("\n"), mapping, previewOnly: false });

    expect(result).toMatchObject({ imported: 1, duplicates: 1 });
    // The row's preview and stored import record say what happened to it.
    expect(result.preview.map((row) => row.duplicate)).toEqual([true, false]);
    const { prisma } = await import("@/lib/db/prisma");
    expect((prisma.tradeImportRow as unknown as { update: Mock }).update).toHaveBeenCalledWith({
      where: { id: "row-2" },
      data: { errors: ["duplicate: this position is already in the journal"] }
    });
  });
});
