import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type FakeDb } from "./support/fake-db";

const holder = vi.hoisted(() => ({ prisma: {} as Record<string, unknown> }));
vi.mock("@/lib/db/prisma", () => ({ prisma: holder.prisma }));

import { loadSampleWorkspace } from "@/lib/services/sample-workspace";
import { convertTradePlan } from "@/lib/services/trade-plans";
import { createTrade, importTradesFromCsv, recordTrade } from "@/lib/services/trades";

/**
 * Sample trades and a person's own trades never exist together: every path that writes a person's first trade removes
 * the sample workspace first. These tests run the real services against a stand-in database that applies the filters.
 */
const NOW = new Date("2026-10-02T09:30:00.000Z");
const A = "user-a";
const B = "user-b";

const forexInput = {
  symbol: "EURUSD",
  market: "forex" as const,
  side: "long" as const,
  status: "closed" as const,
  entryPrice: 1.1,
  stopLoss: 1.098,
  exitPrice: 1.104,
  quantity: 0.5,
  fees: 0,
  ruleFollowed: "unknown" as const,
  openedAt: new Date("2026-10-01T08:00:00Z")
};

let db: FakeDb;

function useDb(seed: Parameters<typeof fakeDb>[0] = {}) {
  db = fakeDb({ user: [{ id: A, sampleLoadedAt: null }, { id: B, sampleLoadedAt: null }], ...seed });
  Object.assign(holder.prisma, db.client);
}

beforeEach(() => useDb());

const rows = (table: Parameters<FakeDb["rows"]>[0]) => db.rows(table);
const sampleRows = (table: Parameters<FakeDb["rows"]>[0], userId = A) => rows(table).filter((row) => row.userId === userId && row.isSample === true);
const ownRows = (table: Parameters<FakeDb["rows"]>[0], userId = A) => rows(table).filter((row) => row.userId === userId && row.isSample === false);
const userRow = (id: string) => rows("user").find((row) => row.id === id) as Record<string, unknown>;

function expectNoSampleLeft() {
  for (const table of ["trade", "strategy", "tradePlan", "review"] as const) expect(sampleRows(table), table).toHaveLength(0);
  expect(userRow(A).sampleLoadedAt).toBeNull();
}

describe("typing in a trade", () => {
  it("removes the sample workspace first, and leaves the one real trade", async () => {
    await loadSampleWorkspace(A, "en", NOW);
    expect(sampleRows("trade")).toHaveLength(30);

    const { trade, sampleRemoved } = await recordTrade(A, forexInput);

    expect(sampleRemoved).toBe(true);
    expectNoSampleLeft();
    expect(rows("trade")).toHaveLength(1);
    expect(rows("trade")[0]).toMatchObject({ id: trade.id, userId: A, isSample: false, symbol: "EURUSD" });
    // Only the real trade has a journal entry: the sample's went with its trades.
    expect(rows("tradeJournalEntry")).toHaveLength(1);
    expect(rows("tradeJournalEntry")[0].tradeId).toBe(trade.id);
  });

  it("removes the sample before the trade is written, so the new trade can never go with it", async () => {
    await loadSampleWorkspace(A, "en", NOW);
    const writesBefore = db.log.length;

    await createTrade(A, forexInput);

    const after = db.log.slice(writesBefore);
    expect(after.indexOf("trade.deleteMany")).toBeGreaterThan(-1);
    expect(after.indexOf("trade.deleteMany")).toBeLessThan(after.indexOf("trade.create"));
  });

  it("does not touch another account's sample data", async () => {
    await loadSampleWorkspace(A, "en", NOW);
    await loadSampleWorkspace(B, "en", NOW);

    await createTrade(A, forexInput);

    expect(sampleRows("trade", B)).toHaveLength(30);
    expect(sampleRows("strategy", B)).toHaveLength(2);
    expect(userRow(B).sampleLoadedAt).not.toBeNull();
  });

  it("an account without sample data pays one read and nothing is deleted", async () => {
    rows("trade").push({ id: "own-earlier", userId: A, isSample: false, symbol: "GBPUSD" });

    const result = await recordTrade(A, forexInput);

    expect(result.sampleRemoved).toBe(false);
    expect(rows("trade")).toHaveLength(2);
    expect(db.writes()).toEqual(["asset.upsert", "trade.create"]);
    expect(db.log.filter((entry) => entry === "user.findUnique")).toHaveLength(1);
    expect(db.log).not.toContain("$transaction");
  });

  it("createTrade still returns the trade itself", async () => {
    const trade = await createTrade(A, forexInput);
    expect(trade).toMatchObject({ symbol: "EURUSD", entryPrice: 1.1 });
  });

  it("keeps the sample when the trade is refused before anything is written", async () => {
    await loadSampleWorkspace(A, "en", NOW);
    rows("strategy").push({ id: "strategy-of-b", userId: B, isSample: false, name: "Not yours" });

    await expect(createTrade(A, { ...forexInput, strategyId: "strategy-of-b" })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    expect(sampleRows("trade")).toHaveLength(30);
    expect(userRow(A).sampleLoadedAt).not.toBeNull();
    expect(ownRows("trade")).toHaveLength(0);
  });

  it("saves a real trade that named a sample strategy without a strategy, since the sample strategy is gone", async () => {
    await loadSampleWorkspace(A, "en", NOW);
    const sampleStrategy = sampleRows("strategy")[0];

    const { trade, sampleRemoved } = await recordTrade(A, { ...forexInput, strategyId: String(sampleStrategy.id) });

    expect(sampleRemoved).toBe(true);
    expect(trade.strategyId ?? null).toBeNull();
    expectNoSampleLeft();
    expect(ownRows("trade")).toHaveLength(1);
  });

  it("never keeps a sample strategy, even when another request had already cleared the marker", async () => {
    await loadSampleWorkspace(A, "en", NOW);
    const sampleStrategy = sampleRows("strategy")[0];

    // The link check saw the sample strategy; by the time this request reads the account, a first trade that overlapped
    // it has removed the sample (the marker is clear), so this request removes nothing. The strategy is gone all the
    // same, and a trade that kept its id would fail on the foreign key.
    const { trade, sampleRemoved } = await recordTrade(A, { ...forexInput, strategyId: String(sampleStrategy.id) }, async () => false);

    expect(sampleRemoved).toBe(false);
    expect(trade.strategyId ?? null).toBeNull();
    expect(ownRows("trade")[0].strategyId ?? null).toBeNull();
  });

  it("two first trades at once that both name a sample strategy are both saved, without it", async () => {
    await loadSampleWorkspace(A, "en", NOW);
    const strategyId = String(sampleRows("strategy")[0].id);

    const results = await Promise.all([
      recordTrade(A, { ...forexInput, strategyId }),
      recordTrade(A, { ...forexInput, symbol: "GBPUSD", strategyId })
    ]);

    expect(results.map((result) => result.trade.strategyId ?? null)).toEqual([null, null]);
    expectNoSampleLeft();
    expect(ownRows("trade")).toHaveLength(2);
  });

  it("keeps the strategy of a real trade that named one of the person's own", async () => {
    await loadSampleWorkspace(A, "en", NOW);
    rows("strategy").push({ id: "own-strategy-1", userId: A, isSample: false, name: "Mine" });

    const { trade } = await recordTrade(A, { ...forexInput, strategyId: "own-strategy-1" });

    expect(trade.strategyId).toBe("own-strategy-1");
    expect(rows("strategy").map((row) => row.id)).toEqual(["own-strategy-1"]);
  });
});

describe("converting a plan", () => {
  it("removes the sample workspace first; the person's own plan survives, without the sample strategy", async () => {
    await loadSampleWorkspace(A, "en", NOW);
    const sampleStrategy = sampleRows("strategy")[0];
    rows("tradePlan").push({
      id: "own-plan-1",
      userId: A,
      isSample: false,
      strategyId: sampleStrategy.id,
      symbol: "EURUSD",
      market: "forex",
      bias: "Bullish above the weekly open",
      checklist: { direction: "long" },
      stopLoss: "1.0980",
      takeProfit: "1.1100",
      riskAmount: null,
      riskPercent: null,
      notes: null,
      status: "planned",
      convertedTradeId: null
    });

    const { trade } = await convertTradePlan(A, "own-plan-1", { entryPrice: 1.1, quantity: 0.5, fees: 0 });

    expectNoSampleLeft();
    expect(ownRows("trade")).toHaveLength(1);
    expect(ownRows("trade")[0]).toMatchObject({ id: trade.id, symbol: "EURUSD" });
    expect(ownRows("trade")[0].strategyId ?? null).toBeNull();
    expect(ownRows("tradePlan")).toHaveLength(1);
    expect(ownRows("tradePlan")[0]).toMatchObject({ id: "own-plan-1", status: "closed", convertedTradeId: trade.id, strategyId: null });
  });
});

describe("importing trades", () => {
  const header = "symbol,market,side,status,entryPrice,exitPrice,quantity,openedAt,externalId";
  const good = [
    "EURUSD,forex,long,closed,1.1000,1.1040,0.5,2026-09-28T08:00:00Z,mt5:7001:1",
    "XAUUSD,forex,short,closed,2400,2390,0.1,2026-09-29T09:00:00Z,mt5:7001:2",
    "GBPUSD,forex,long,closed,1.3000,1.3050,0.2,2026-09-30T10:00:00Z,mt5:7001:3"
  ];
  const mapping = Object.fromEntries(header.split(",").map((field) => [field, field]));
  const run = (lines: string[], previewOnly = false) => importTradesFromCsv(A, { csv: [header, ...lines].join("\n"), mapping, previewOnly });

  it("removes the sample workspace before the first imported trade, and says so", async () => {
    await loadSampleWorkspace(A, "en", NOW);

    const result = await run(good);

    expect(result).toMatchObject({ imported: 3, sampleRemoved: true });
    expectNoSampleLeft();
    expect(ownRows("trade")).toHaveLength(3);
    expect(rows("trade")).toHaveLength(3);
    expect(rows("tradeJournalEntry")).toHaveLength(3);
  });

  it("checks the account once for the whole file, not once per row", async () => {
    await run(good);
    expect(db.log.filter((entry) => entry === "user.findUnique")).toHaveLength(1);
  });

  it("without sample data nothing is deleted and sampleRemoved is false", async () => {
    const result = await run(good);

    expect(result).toMatchObject({ imported: 3, sampleRemoved: false });
    expect(db.log).not.toContain("trade.deleteMany");
    expect(db.log).not.toContain("$transaction");
  });

  describe("rows that name a strategy", () => {
    const linkHeader = `${header},strategyId`;
    const linkMapping = Object.fromEntries(linkHeader.split(",").map((field) => [field, field]));
    const runLinked = (lines: string[], previewOnly = false) =>
      importTradesFromCsv(A, { csv: [linkHeader, ...lines].join("\n"), mapping: linkMapping, previewOnly });

    it("two rows that name the same sample strategy are both imported, with no strategy, and the file is not cut short", async () => {
      await loadSampleWorkspace(A, "en", NOW);
      const strategyId = String(sampleRows("strategy")[0].id);

      const result = await runLinked([`${good[0]},${strategyId}`, `${good[1]},${strategyId}`, `${good[2]},${strategyId}`]);

      expect(result).toMatchObject({ imported: 3, invalidRows: 0, sampleRemoved: true });
      expectNoSampleLeft();
      expect(ownRows("trade")).toHaveLength(3);
      for (const trade of ownRows("trade")) expect(trade.strategyId ?? null).toBeNull();
      expect(rows("tradeImportRow").every((row) => row.isValid === true)).toBe(true);
    });

    it("keeps the strategy a row names when it is one of the person's own", async () => {
      await loadSampleWorkspace(A, "en", NOW);
      rows("strategy").push({ id: "own-strategy-1", userId: A, isSample: false, name: "Mine" });

      const result = await runLinked([`${good[0]},own-strategy-1`]);

      expect(result).toMatchObject({ imported: 1, sampleRemoved: true });
      expect(ownRows("trade")[0].strategyId).toBe("own-strategy-1");
    });

    it("a row that names a strategy that is not theirs is that row's error; the other rows are imported", async () => {
      await loadSampleWorkspace(A, "en", NOW);
      rows("strategy").push({ id: "strategy-of-b", userId: B, isSample: false, name: "Not yours" });

      const result = await runLinked([`${good[0]},strategy-of-b`, good[1], good[2]]);

      expect(result).toMatchObject({ imported: 2, validRows: 2, invalidRows: 1, duplicates: 0 });
      expect(result.preview[0]).toMatchObject({ rowNumber: 2, isValid: false });
      expect(JSON.stringify(result.preview[0].errors)).toContain("strategyId");
      expect(ownRows("trade").map((trade) => trade.externalId)).toEqual(["mt5:7001:2", "mt5:7001:3"]);
      const stored = rows("tradeImportRow").find((row) => row.rowNumber === 2);
      expect(stored).toMatchObject({ isValid: false });
      expect(String((stored?.errors as string[])[0])).toContain("strategyId");
      // Nothing of B's was linked or read out.
      expect(JSON.stringify(result)).not.toContain("Not yours");
      expect(rows("tradeImport")[0]).toMatchObject({ validRows: 2, invalidRows: 1, status: "failed" });
    });

    it("a row that names a portfolio that is not theirs is that row's error too", async () => {
      rows("portfolio").push({ id: "portfolio-of-b", userId: B, name: "Not yours" });
      const withPortfolio = `${header},portfolioId`;
      const result = await importTradesFromCsv(A, {
        csv: [withPortfolio, `${good[0]},portfolio-of-b`, `${good[1]},`].join("\n"),
        mapping: Object.fromEntries(withPortfolio.split(",").map((field) => [field, field])),
        previewOnly: false
      });

      expect(result).toMatchObject({ imported: 1, invalidRows: 1 });
      expect(JSON.stringify(result.preview[0].errors)).toContain("portfolioId");
    });

    it("a preview shows the row without the sample strategy, flags a strategy that is not theirs, and writes no trade", async () => {
      await loadSampleWorkspace(A, "en", NOW);
      rows("strategy").push({ id: "strategy-of-b", userId: B, isSample: false, name: "Not yours" });
      const strategyId = String(sampleRows("strategy")[0].id);

      const result = await runLinked([`${good[0]},${strategyId}`, `${good[1]},strategy-of-b`], true);

      expect(result).toMatchObject({ imported: 0, validRows: 1, invalidRows: 1, sampleRemoved: false });
      expect(result.preview[0]).toMatchObject({ isValid: true, mapped: { strategyId: null } });
      expect(result.preview[1]).toMatchObject({ isValid: false });
      expect(sampleRows("trade")).toHaveLength(30);
    });

    it("an import that names no strategy and no portfolio pays for no extra read", async () => {
      await run(good);
      expect(db.log).not.toContain("strategy.findMany");
      expect(db.log).not.toContain("portfolio.findMany");
    });
  });

  it("a preview writes no trade, so it keeps the sample", async () => {
    await loadSampleWorkspace(A, "en", NOW);

    const result = await run(good, true);

    expect(result).toMatchObject({ imported: 0, sampleRemoved: false });
    expect(sampleRows("trade")).toHaveLength(30);
    expect(userRow(A).sampleLoadedAt).not.toBeNull();
  });

  it("a file with no importable row keeps the sample", async () => {
    await loadSampleWorkspace(A, "en", NOW);

    const result = await run(["EURUSD,forex,long,closed,not-a-price,1.1040,0.5,2026-09-28T08:00:00Z,mt5:7001:9"]);

    expect(result).toMatchObject({ imported: 0, invalidRows: 1, sampleRemoved: false });
    expect(sampleRows("trade")).toHaveLength(30);
  });

  it("removes it at the first row that is really written, even when earlier rows were invalid", async () => {
    await loadSampleWorkspace(A, "en", NOW);

    const result = await run(["EURUSD,forex,long,closed,not-a-price,1.1040,0.5,2026-09-28T08:00:00Z,mt5:7001:9", good[1]]);

    expect(result).toMatchObject({ imported: 1, invalidRows: 1, sampleRemoved: true });
    expectNoSampleLeft();
    expect(ownRows("trade")).toHaveLength(1);
  });
});
