import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type FakeDb } from "./support/fake-db";

const holder = vi.hoisted(() => ({ prisma: {} as Record<string, unknown> }));
vi.mock("@/lib/db/prisma", () => ({ prisma: holder.prisma }));

import { createTrade, listTrades, updateTrade } from "@/lib/services/trades";

/**
 * A trade may name a strategy and a portfolio, and only the person's own. An id that belongs to someone else is
 * refused the way a trade that is not theirs is: as not found, with nothing written.
 */
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

beforeEach(() => {
  db = fakeDb({
    user: [{ id: A, sampleLoadedAt: null }, { id: B, sampleLoadedAt: null }],
    strategy: [
      { id: "strategy-of-a", userId: A, isSample: false, name: "Mine" },
      { id: "strategy-of-b", userId: B, isSample: false, name: "Secret strategy of B" }
    ],
    portfolio: [
      { id: "portfolio-of-a", userId: A, name: "Main" },
      { id: "portfolio-of-b", userId: B, name: "Secret portfolio of B" }
    ],
    trade: [{ id: "trade-of-a", userId: A, isSample: false, symbol: "EURUSD", market: "forex", side: "long", status: "closed", entryPrice: "1.1", quantity: "0.5", fees: "0", openedAt: new Date("2026-09-20T08:00:00Z") }]
  });
  Object.assign(holder.prisma, db.client);
});

const trades = () => db.rows("trade");

describe("creating a trade", () => {
  it("refuses a strategy that is not the person's, and writes nothing", async () => {
    await expect(createTrade(A, { ...forexInput, strategyId: "strategy-of-b" })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    expect(trades()).toHaveLength(1);
    expect(db.writes()).toEqual([]);
  });

  it("refuses a portfolio that is not the person's, and writes nothing", async () => {
    await expect(createTrade(A, { ...forexInput, portfolioId: "portfolio-of-b" })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    expect(trades()).toHaveLength(1);
    expect(db.writes()).toEqual([]);
  });

  it("refuses an id that does not exist at all", async () => {
    await expect(createTrade(A, { ...forexInput, strategyId: "no-such-strategy" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createTrade(A, { ...forexInput, portfolioId: "no-such-portfolio" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("accepts the person's own strategy and portfolio", async () => {
    const trade = await createTrade(A, { ...forexInput, strategyId: "strategy-of-a", portfolioId: "portfolio-of-a" });

    expect(trade).toMatchObject({ strategyId: "strategy-of-a", portfolioId: "portfolio-of-a" });
    expect(trades()).toHaveLength(2);
  });

  it("does not look for a strategy or a portfolio when the trade names none", async () => {
    await createTrade(A, forexInput);
    await createTrade(A, { ...forexInput, strategyId: null, portfolioId: null });

    expect(db.log).not.toContain("strategy.findFirst");
    expect(db.log).not.toContain("portfolio.findFirst");
  });

  it("never lists another person's strategy on a trade", async () => {
    await expect(createTrade(A, { ...forexInput, strategyId: "strategy-of-b" })).rejects.toThrow();

    const listed = await listTrades(A);
    expect(JSON.stringify(listed)).not.toContain("Secret");
  });
});

describe("editing a trade", () => {
  it("refuses a strategy that is not the person's, and changes nothing", async () => {
    await expect(updateTrade(A, { id: "trade-of-a", strategyId: "strategy-of-b" })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    expect(trades()[0].strategyId ?? null).toBeNull();
    expect(db.writes()).toEqual([]);
  });

  it("refuses a portfolio that is not the person's, and changes nothing", async () => {
    await expect(updateTrade(A, { id: "trade-of-a", portfolioId: "portfolio-of-b" })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    expect(trades()[0].portfolioId ?? null).toBeNull();
    expect(db.writes()).toEqual([]);
  });

  it("accepts the person's own strategy and portfolio", async () => {
    const trade = await updateTrade(A, { id: "trade-of-a", strategyId: "strategy-of-a", portfolioId: "portfolio-of-a" });

    expect(trade).toMatchObject({ strategyId: "strategy-of-a", portfolioId: "portfolio-of-a" });
  });

  it("still answers not found for a trade that is not theirs, before it looks at the links", async () => {
    await expect(updateTrade(B, { id: "trade-of-a", strategyId: "strategy-of-b" })).rejects.toMatchObject({ code: "NOT_FOUND", message: "Trade not found" });
  });

  it("an edit that names no strategy or portfolio does not look for one", async () => {
    await updateTrade(A, { id: "trade-of-a", setupType: "breakout" });

    expect(db.log).not.toContain("strategy.findFirst");
    expect(db.log).not.toContain("portfolio.findFirst");
  });
});
