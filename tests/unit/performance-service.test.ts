import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: { trade: { findMany: vi.fn() }, user: { findUnique: vi.fn() } }
}));

import { prisma } from "@/lib/db/prisma";
import { getPerformanceReport, getPerformanceRowTradeIds, getPerformanceSnapshot, loadPerformanceTrades } from "@/lib/services/performance";

const NOW = new Date("2026-10-04T10:00:00Z");

/** A row as Prisma returns it: Decimal columns are objects that read as numbers, not numbers. */
const decimal = (value: number) => ({ valueOf: () => value, toString: () => String(value) });

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    symbol: "BTCUSDT",
    market: "crypto",
    side: "long",
    status: "closed",
    entryPrice: decimal(100),
    exitPrice: decimal(102),
    stopLoss: decimal(99),
    takeProfit: null,
    quantity: decimal(1),
    fees: decimal(0),
    riskAmount: null,
    riskPercent: null,
    rMultiple: null,
    realizedPnl: null,
    openedAt: new Date("2026-10-03T08:00:00Z"),
    closedAt: new Date("2026-10-03T09:00:00Z"),
    ladderKey: null,
    ladderLeg: null,
    ladderSize: null,
    strategyId: "s1",
    session: "London",
    setupType: "Breakout",
    ruleFollowed: "followed",
    isSample: false,
    strategy: { name: "Range" },
    journalEntry: { mistakes: ["Late entry"], emotionalState: "calm" },
    ...overrides
  };
}

beforeEach(() => {
  vi.mocked(prisma.trade.findMany).mockReset().mockResolvedValue([row()] as never);
  vi.mocked(prisma.user.findUnique).mockReset().mockResolvedValue({ startingBalance: decimal(1000) } as never);
});

describe("loadPerformanceTrades", () => {
  it("reads the user's trades in close order, with no notes and no screenshots", async () => {
    await loadPerformanceTrades("u1");
    const args = vi.mocked(prisma.trade.findMany).mock.calls[0][0] as { where: unknown; orderBy: unknown; select: Record<string, unknown> };
    expect(args.where).toEqual({ userId: "u1" });
    expect(args.orderBy).toEqual([{ closedAt: "asc" }, { openedAt: "asc" }]);
    expect(args.select.journalEntry).toEqual({ select: { mistakes: true, emotionalState: true } });
    expect(args.select.strategy).toEqual({ select: { name: true } });
    for (const column of ["preTradeNotes", "postTradeNotes", "lessonsLearned", "outcome", "screenshotUrl", "attachments", "notes"]) {
      expect(args.select).not.toHaveProperty(column);
    }
  });

  it("hands the pure functions plain numbers, ISO times and the trader's own words", async () => {
    const [trade] = await loadPerformanceTrades("u1");
    expect(trade).toEqual({
      id: "t1",
      symbol: "BTCUSDT",
      market: "crypto",
      side: "long",
      status: "closed",
      entryPrice: 100,
      exitPrice: 102,
      stopLoss: 99,
      takeProfit: null,
      quantity: 1,
      fees: 0,
      riskAmount: null,
      riskPercent: null,
      rMultiple: null,
      realizedPnl: null,
      openedAt: "2026-10-03T08:00:00.000Z",
      closedAt: "2026-10-03T09:00:00.000Z",
      ladderKey: null,
      ladderLeg: null,
      ladderSize: null,
      strategyId: "s1",
      strategyName: "Range",
      session: "London",
      setupType: "Breakout",
      ruleFollowed: "followed",
      mistakes: ["Late entry"],
      emotionalState: "calm",
      isSample: false
    });
  });

  it("reads a trade with no journal entry, no strategy and no close time", async () => {
    vi.mocked(prisma.trade.findMany).mockResolvedValue([row({ journalEntry: null, strategy: null, strategyId: null, closedAt: null, status: "open", exitPrice: null })] as never);
    const [trade] = await loadPerformanceTrades("u1");
    expect(trade).toMatchObject({ mistakes: [], emotionalState: null, strategyName: null, strategyId: null, closedAt: null, exitPrice: null });
  });
});

describe("getPerformanceReport", () => {
  it("builds the report for the user's period, time zone and starting balance", async () => {
    const report = await getPerformanceReport({ id: "u1", timezone: "Asia/Tehran" }, { period: "all", now: NOW });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "u1" }, select: { startingBalance: true } });
    expect(report.context).toMatchObject({ period: "all", timeZone: "Asia/Tehran", source: "own", to: NOW.toISOString() });
    expect(report.summary).toMatchObject({ closedTrades: 1, netPnl: 2 });
    expect(report.summary.maxDrawdownPct).toBe(0);
  });

  it("reads the period's window in the trader's zone", async () => {
    const report = await getPerformanceReport({ id: "u1", timezone: "Asia/Tehran" }, { period: "7d", now: NOW });
    expect(report.context.from).toBe("2026-09-27T20:30:00.000Z");
  });

  it("falls back to UTC for a time zone the runtime does not know", async () => {
    const report = await getPerformanceReport({ id: "u1", timezone: "Mars/Olympus" }, { period: "7d", now: NOW });
    expect(report.context).toMatchObject({ timeZone: "UTC", from: "2026-09-28T00:00:00.000Z" });
  });

  it("works for a user with no starting balance and no trades", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ startingBalance: null } as never);
    vi.mocked(prisma.trade.findMany).mockResolvedValue([] as never);
    const report = await getPerformanceReport({ id: "u1", timezone: "UTC" }, { period: "all", now: NOW });
    expect(report.context.source).toBe("none");
    expect(report.summary.maxDrawdownPct).toBeNull();
  });
});

describe("getPerformanceSnapshot", () => {
  it("is the 30-day headline and equity by default", async () => {
    const snapshot = await getPerformanceSnapshot({ id: "u1", timezone: "UTC" }, { now: NOW });
    expect(snapshot.context.period).toBe("30d");
    expect(Object.keys(snapshot).sort()).toEqual(["context", "equity", "summary"]);
    expect(snapshot.summary.closedTrades).toBe(1);
  });

  it("takes another period when asked", async () => {
    expect((await getPerformanceSnapshot({ id: "u1", timezone: "UTC" }, { period: "7d", now: NOW })).context.period).toBe("7d");
  });
});

describe("getPerformanceRowTradeIds", () => {
  it("gives the ids behind a row of the report, for the user period and zone", async () => {
    const user = { id: "u1", timezone: "Asia/Tehran" };
    const ids = await getPerformanceRowTradeIds(user, { period: "all", dimension: "symbol", row: "text:btcusdt", now: NOW });
    expect(ids).toEqual(["t1"]);
    const report = await getPerformanceReport(user, { period: "all", now: NOW });
    expect(report.breakdowns.symbol.find((r) => r.id === "text:btcusdt")?.entries).toBe(ids.length);
  });

  it("reads the window like the report: a trade closed before it is not in the row", async () => {
    const ids = await getPerformanceRowTradeIds({ id: "u1", timezone: "UTC" }, { period: "7d", dimension: "symbol", row: "text:btcusdt", now: new Date("2026-11-30T10:00:00Z") });
    expect(ids).toEqual([]);
  });

  it("falls back to UTC for a time zone the runtime does not know", async () => {
    const ids = await getPerformanceRowTradeIds({ id: "u1", timezone: "Mars/Olympus" }, { period: "all", dimension: "weekday", row: "key:weekday.6", now: NOW });
    expect(ids).toEqual(["t1"]); // 3 October 2026 is a Saturday
  });
});
