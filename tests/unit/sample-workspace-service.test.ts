import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type FakeDb, type Row } from "./support/fake-db";

const holder = vi.hoisted(() => ({ prisma: {} as Record<string, unknown> }));
vi.mock("@/lib/db/prisma", () => ({ prisma: holder.prisma }));

import {
  getSampleWorkspaceState,
  loadSampleWorkspace,
  removeSampleWorkspace,
  removeSampleWorkspaceIfLoaded
} from "@/lib/services/sample-workspace";

const NOW = new Date("2026-10-02T09:30:00.000Z");
const A = "user-a";
const B = "user-b";
const counts = { trades: 30, strategies: 2, plans: 2, reviews: 2 };

let db: FakeDb;

function useDb(seed: Parameters<typeof fakeDb>[0] = {}) {
  db = fakeDb({ user: [{ id: A, sampleLoadedAt: null }, { id: B, sampleLoadedAt: null }], ...seed });
  Object.assign(holder.prisma, db.client);
}

beforeEach(() => useDb());

const rows = (table: Parameters<FakeDb["rows"]>[0]) => db.rows(table);
const ofUser = (table: Parameters<FakeDb["rows"]>[0], userId: string) => rows(table).filter((row) => row.userId === userId);
const sample = (table: Parameters<FakeDb["rows"]>[0], userId: string) => ofUser(table, userId).filter((row) => row.isSample === true);
const userRow = (id: string) => rows("user").find((row) => row.id === id) as Row;

describe("loading the sample workspace", () => {
  it("writes the whole month, every row marked as sample, and notes when it was loaded", async () => {
    const result = await loadSampleWorkspace(A, "en", NOW);

    expect(result).toMatchObject({ created: true, counts });
    expect(sample("trade", A)).toHaveLength(30);
    expect(sample("strategy", A)).toHaveLength(2);
    expect(sample("tradePlan", A)).toHaveLength(2);
    expect(sample("review", A)).toHaveLength(2);
    expect(ofUser("tradeJournalEntry", A)).toHaveLength(30);
    // Nothing of the account's own was written, and the account knows it holds sample data.
    for (const table of ["strategy", "trade", "tradePlan", "review"] as const) expect(ofUser(table, A).every((row) => row.isSample === true)).toBe(true);
    expect(userRow(A).sampleLoadedAt).toEqual(result.loadedAt);
    expect(userRow(B).sampleLoadedAt).toBeNull();
  });

  it("links the rows to each other with their real ids", async () => {
    await loadSampleWorkspace(A, "en", NOW);
    const strategyIds = new Set(rows("strategy").map((row) => row.id));
    const tradeIds = new Set(rows("trade").map((row) => row.id));

    for (const trade of rows("trade")) expect(strategyIds.has(trade.strategyId), String(trade.symbol)).toBe(true);
    for (const plan of rows("tradePlan")) expect(strategyIds.has(plan.strategyId)).toBe(true);
    for (const entry of rows("tradeJournalEntry")) expect(tradeIds.has(entry.tradeId)).toBe(true);
    for (const review of rows("review")) {
      expect((review.linkedTradeIds as string[]).every((id) => tradeIds.has(id))).toBe(true);
      expect((review.linkedStrategyIds as string[]).every((id) => strategyIds.has(id))).toBe(true);
    }
    expect(new Set(tradeIds).size).toBe(30);
  });

  it("keeps the strategies' limits and the trades' prices as the sample defines them", async () => {
    await loadSampleWorkspace(A, "en", NOW);
    for (const strategy of rows("strategy")) {
      expect(strategy.riskPerTradePct).toBeGreaterThan(0);
      expect(strategy.maxDailyLossPct).toBeGreaterThan(0);
      expect(strategy.maxOpenPositions).toBeGreaterThan(0);
    }
    for (const trade of rows("trade")) {
      expect(trade.status).toBe("closed");
      expect(typeof trade.rMultiple).toBe("number");
      expect(trade.exitPrice).not.toBeNull();
    }
  });

  it("writes the sample in the language it was asked for", async () => {
    await loadSampleWorkspace(A, "fa", NOW);
    expect(rows("strategy").every((row) => String(row.name).endsWith("(نمونه)"))).toBe(true);
  });

  it("does it all in one transaction", async () => {
    await loadSampleWorkspace(A, "en", NOW);
    expect(db.log.filter((entry) => entry === "$transaction")).toHaveLength(1);
    // The first thing it does inside is claim the account, before any row is written.
    const inside = db.log.slice(db.log.indexOf("$transaction") + 1);
    expect(inside[0]).toBe("user.updateMany");
  });

  it("loading twice adds nothing and says so", async () => {
    const first = await loadSampleWorkspace(A, "en", NOW);
    const writesAfterFirst = db.writes().length;
    const second = await loadSampleWorkspace(A, "en", NOW);

    expect(second).toMatchObject({ created: false, counts });
    expect(second.loadedAt).toEqual(first.loadedAt);
    expect(rows("trade")).toHaveLength(30);
    // Only the claim is tried again; no row is written.
    expect(db.writes().slice(writesAfterFirst)).toEqual(["user.updateMany"]);
  });

  it("two requests at once load it once", async () => {
    const [one, two] = await Promise.all([loadSampleWorkspace(A, "en", NOW), loadSampleWorkspace(A, "en", NOW)]);

    expect([one.created, two.created].sort()).toEqual([false, true]);
    expect(one.counts).toEqual(counts);
    expect(two.counts).toEqual(counts);
    expect(rows("trade")).toHaveLength(30);
    expect(rows("strategy")).toHaveLength(2);
    expect(rows("tradeJournalEntry")).toHaveLength(30);
  });

  it("refuses an account that has a trade of its own, and writes nothing", async () => {
    useDb({ trade: [{ id: "own-1", userId: A, isSample: false, symbol: "EURUSD" }] });

    await expect(loadSampleWorkspace(A, "en", NOW)).rejects.toMatchObject({ code: "SAMPLE_NOT_EMPTY", status: 409 });

    expect(rows("trade")).toHaveLength(1);
    expect(rows("strategy")).toHaveLength(0);
    expect(userRow(A).sampleLoadedAt).toBeNull();
  });

  it("looks again for a trade of the person's own as its last statement, and leaves nothing if one arrived while it wrote", async () => {
    // A first trade that another request commits while the sample rows are being written: the check at the start
    // cannot have seen it, the one at the end can.
    const createMany = db.client.review.createMany;
    vi.spyOn(db.client.review, "createMany").mockImplementationOnce(async (args) => {
      await db.client.trade.create({ data: { id: "own-arrived", userId: A, isSample: false, symbol: "EURUSD" } });
      return createMany(args);
    });

    await expect(loadSampleWorkspace(A, "en", NOW)).rejects.toMatchObject({ code: "SAMPLE_NOT_EMPTY", status: 409 });

    for (const table of ["strategy", "tradeJournalEntry", "tradePlan", "review"] as const) expect(rows(table), table).toHaveLength(0);
    expect(sample("trade", A)).toHaveLength(0);
    expect(userRow(A).sampleLoadedAt).toBeNull();
    // The last thing it did inside was to count again.
    expect(db.log.slice(-1)).toEqual(["trade.count"]);
  });

  it("is not stopped by another account's trades", async () => {
    useDb({ trade: [{ id: "other-1", userId: B, isSample: false }] });
    await expect(loadSampleWorkspace(A, "en", NOW)).resolves.toMatchObject({ created: true });
  });

  it("leaves nothing behind when a write fails half-way", async () => {
    vi.spyOn(db.client.review, "createMany").mockRejectedValueOnce(new Error("database went away"));

    await expect(loadSampleWorkspace(A, "en", NOW)).rejects.toThrow("database went away");

    for (const table of ["strategy", "trade", "tradeJournalEntry", "tradePlan", "review"] as const) expect(rows(table), table).toHaveLength(0);
    expect(userRow(A).sampleLoadedAt).toBeNull();
    // And it can be tried again.
    await expect(loadSampleWorkspace(A, "en", NOW)).resolves.toMatchObject({ created: true, counts });
  });
});

describe("removing the sample workspace", () => {
  /** A's account holds the sample and rows of its own (a plan that uses a sample strategy among them); B holds sample data too. */
  async function mixedAccounts() {
    await loadSampleWorkspace(A, "en", NOW);
    await loadSampleWorkspace(B, "en", NOW);
    const sampleStrategy = sample("strategy", A)[0];
    rows("strategy").push({ id: "own-strategy", userId: A, isSample: false, name: "My strategy" });
    rows("tradePlan").push({ id: "own-plan", userId: A, isSample: false, strategyId: sampleStrategy.id, symbol: "EURUSD" });
    rows("tradePlan").push({ id: "own-plan-2", userId: A, isSample: false, strategyId: "own-strategy", symbol: "GBPUSD" });
    rows("review").push({ id: "own-review", userId: A, isSample: false, title: "My review" });
    rows("trade").push({ id: "own-trade", userId: A, isSample: false, symbol: "EURUSD" });
    rows("tradeJournalEntry").push({ id: "own-entry", userId: A, tradeId: "own-trade" });
    return sampleStrategy;
  }

  it("deletes the account's sample rows and says how many", async () => {
    await loadSampleWorkspace(A, "en", NOW);

    const result = await removeSampleWorkspace(A);

    expect(result).toEqual({ wasActive: true, removed: counts });
    for (const table of ["strategy", "trade", "tradeJournalEntry", "tradePlan", "review"] as const) expect(rows(table), table).toHaveLength(0);
    expect(userRow(A).sampleLoadedAt).toBeNull();
  });

  it("never touches a row that is not a sample row of that account", async () => {
    await mixedAccounts();
    const before = structuredClone({
      ownTrade: rows("trade").find((row) => row.id === "own-trade"),
      ownEntry: rows("tradeJournalEntry").find((row) => row.id === "own-entry"),
      ownStrategy: rows("strategy").find((row) => row.id === "own-strategy"),
      ownPlan2: rows("tradePlan").find((row) => row.id === "own-plan-2"),
      ownReview: rows("review").find((row) => row.id === "own-review"),
      bUser: userRow(B),
      bTrades: ofUser("trade", B),
      bStrategies: ofUser("strategy", B),
      bPlans: ofUser("tradePlan", B),
      bReviews: ofUser("review", B),
      bEntries: ofUser("tradeJournalEntry", B)
    });

    await removeSampleWorkspace(A);

    expect(sample("trade", A)).toHaveLength(0);
    expect(sample("strategy", A)).toHaveLength(0);
    expect(sample("tradePlan", A)).toHaveLength(0);
    expect(sample("review", A)).toHaveLength(0);
    expect(rows("trade").find((row) => row.id === "own-trade")).toEqual(before.ownTrade);
    expect(rows("tradeJournalEntry").find((row) => row.id === "own-entry")).toEqual(before.ownEntry);
    expect(rows("strategy").find((row) => row.id === "own-strategy")).toEqual(before.ownStrategy);
    expect(rows("tradePlan").find((row) => row.id === "own-plan-2")).toEqual(before.ownPlan2);
    expect(rows("review").find((row) => row.id === "own-review")).toEqual(before.ownReview);
    // The other account is exactly as it was, sample data and all.
    expect(userRow(B)).toEqual(before.bUser);
    expect(ofUser("trade", B)).toEqual(before.bTrades);
    expect(ofUser("strategy", B)).toEqual(before.bStrategies);
    expect(ofUser("tradePlan", B)).toEqual(before.bPlans);
    expect(ofUser("review", B)).toEqual(before.bReviews);
    expect(ofUser("tradeJournalEntry", B)).toEqual(before.bEntries);
  });

  it("keeps a plan of the person's own that used a sample strategy, now without a strategy", async () => {
    await mixedAccounts();

    await removeSampleWorkspace(A);

    const plan = rows("tradePlan").find((row) => row.id === "own-plan");
    expect(plan).toBeDefined();
    expect(plan?.strategyId).toBeNull();
    expect(plan?.isSample).toBe(false);
  });

  it("asks the database for sample rows of one account only, in every delete", async () => {
    await loadSampleWorkspace(A, "en", NOW);
    const calls: unknown[] = [];
    for (const table of ["trade", "tradePlan", "review", "strategy"] as const) {
      const original = db.client[table].deleteMany;
      vi.spyOn(db.client[table], "deleteMany").mockImplementation(async (args) => {
        calls.push(args);
        return original(args);
      });
    }

    await removeSampleWorkspace(A);

    expect(calls).toHaveLength(4);
    for (const call of calls) expect(call).toEqual({ where: { userId: A, isSample: true } });
  });

  it("removing when nothing is loaded changes nothing and answers with zeros", async () => {
    rows("trade").push({ id: "own-trade", userId: A, isSample: false });

    const result = await removeSampleWorkspace(A);

    expect(result).toEqual({ wasActive: false, removed: { trades: 0, strategies: 0, plans: 0, reviews: 0 } });
    expect(rows("trade")).toHaveLength(1);
  });

  it("is all or nothing: a failure leaves the sample and the marker as they were", async () => {
    await loadSampleWorkspace(A, "en", NOW);
    vi.spyOn(db.client.strategy, "deleteMany").mockRejectedValueOnce(new Error("database went away"));

    await expect(removeSampleWorkspace(A)).rejects.toThrow("database went away");

    expect(sample("trade", A)).toHaveLength(30);
    expect(userRow(A).sampleLoadedAt).not.toBeNull();
  });

  it("can be loaded again after it was removed", async () => {
    await loadSampleWorkspace(A, "en", NOW);
    await removeSampleWorkspace(A);
    await expect(loadSampleWorkspace(A, "en", NOW)).resolves.toMatchObject({ created: true, counts });
  });
});

describe("removing it before a person's first trade", () => {
  it("does nothing, and writes nothing, for an account without sample data", async () => {
    await expect(removeSampleWorkspaceIfLoaded(A)).resolves.toBe(false);
    expect(db.writes()).toEqual([]);
    expect(db.log).toEqual(["user.findUnique"]);
  });

  it("removes the sample when the account has it", async () => {
    await loadSampleWorkspace(A, "en", NOW);
    await expect(removeSampleWorkspaceIfLoaded(A)).resolves.toBe(true);
    expect(rows("trade")).toHaveLength(0);
    expect(userRow(A).sampleLoadedAt).toBeNull();
  });
});

describe("the state of the sample workspace", () => {
  it("is empty and loadable for a new account", async () => {
    await expect(getSampleWorkspaceState(A)).resolves.toEqual({ active: false, loadedAt: null, canLoad: true });
  });

  it("is active with the time it was loaded, and still loadable (the offer hides itself)", async () => {
    const { loadedAt } = await loadSampleWorkspace(A, "en", NOW);
    await expect(getSampleWorkspaceState(A)).resolves.toEqual({ active: true, loadedAt: loadedAt.toISOString(), canLoad: true });
  });

  it("cannot be loaded once the account has a trade of its own", async () => {
    rows("trade").push({ id: "own-trade", userId: A, isSample: false });
    await expect(getSampleWorkspaceState(A)).resolves.toMatchObject({ active: false, canLoad: false });
  });

  it("does not count the sample's own trades, or another account's, as the person's", async () => {
    await loadSampleWorkspace(A, "en", NOW);
    rows("trade").push({ id: "other", userId: B, isSample: false });
    await expect(getSampleWorkspaceState(A)).resolves.toMatchObject({ active: true, canLoad: true });
  });
});
