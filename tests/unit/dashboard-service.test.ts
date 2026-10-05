import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PerformanceTrade } from "@/lib/calculations/performance/types";
import { perfTrade } from "./support/performance-trades";

const state = vi.hoisted(() => ({ trades: [] as unknown[] }));
vi.mock("@/lib/services/performance", () => ({ loadPerformanceTrades: vi.fn(async () => state.trades) }));
vi.mock("@/lib/services/reviews", () => ({ getReviewFocus: vi.fn(async () => ({ review: null, overdueCount: 0, suggestedType: "daily" })) }));
vi.mock("@/lib/services/sessions", () => ({ getActiveSession: vi.fn(async () => null) }));

// Every model answers with an empty result unless a test gives it an answer; each call is recorded so a test can read its filter.
const calls: { model: string; method: string; args: { where?: Record<string, unknown>; take?: number } }[] = [];
const answers: Record<string, unknown> = {};
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_target, model: string) =>
        new Proxy(
          {},
          {
            get: (_inner, method: string) => async (args: { where?: Record<string, unknown> }) => {
              calls.push({ model, method, args });
              const key = `${model}.${method}`;
              if (key in answers) return answers[key];
              return method === "count" ? 0 : method === "findUnique" ? null : [];
            }
          }
        )
    }
  )
}));

import { getDashboardOverview } from "@/lib/services/dashboard";

const now = new Date("2026-10-04T10:00:00.000Z"); // 13:30 in Tehran
const tehran = { timeZone: "Asia/Tehran", now };
const account = { riskPerTradePct: 1, maxDailyLossPct: 3, maxWeeklyLossPct: 6, startingBalance: null };

const completePlan = (id: string, plannedFor: string | null = null, over: Record<string, unknown> = {}) => ({
  id,
  symbol: "EURUSD",
  market: "forex",
  bias: "up",
  status: "planned",
  plannedFor: plannedFor ? new Date(plannedFor) : null,
  invalidationRule: "close below support",
  riskAmount: null,
  riskPercent: 1,
  checklist: { scenario: true, risk: true },
  ...over
});

beforeEach(() => {
  calls.length = 0;
  for (const key of Object.keys(answers)) delete answers[key];
  answers["user.findUnique"] = account;
  state.trades = [];
});

describe("getDashboardOverview: what it reads", () => {
  it("counts rule breaks of trades opened in the last 7 days from Trade.ruleFollowed, not from journal rows edited then", async () => {
    // Reviewing an old imported trade today updates its journal row; that is not a recent rule break.
    await getDashboardOverview("u1", "en", tehran);

    const violations = calls.find((c) => c.model === "trade" && c.method === "count" && c.args.where?.ruleFollowed === "broken");
    // The 7 days are today and the six before, from midnight in the trader's zone: Sep 28 00:00 in Tehran is Sep 27 20:30 UTC.
    expect(violations?.args.where).toEqual({ userId: "u1", ruleFollowed: "broken", openedAt: { gte: new Date("2026-09-27T20:30:00.000Z") } });
    expect(calls.filter((c) => c.model === "tradeJournalEntry" && c.args.where?.ruleFollowed)).toEqual([]);
  });

  it("does not query what the screen no longer shows", async () => {
    await getDashboardOverview("u1", "en", tehran);

    const models = new Set(calls.map((c) => c.model));
    for (const gone of ["portfolio", "holding", "transaction", "watchlist", "watchlistItem", "alert", "strategy", "idea", "newsItem"]) expect(models.has(gone)).toBe(false);
    // The journal is only counted (follow-ups), never listed.
    expect(calls.filter((c) => c.model === "tradeJournalEntry" && c.method !== "count")).toEqual([]);
  });

  it("asks the database for no more than the six reads the blocks need (the trades come in one read of their own)", async () => {
    await getDashboardOverview("u1", "en", tehran);

    // user, open reviews, active plans, trades without a journal row, journal rows without a lesson, rule breaks of the week.
    expect(calls.map((c) => `${c.model}.${c.method}`).sort()).toEqual(["review.count", "trade.count", "trade.count", "tradeJournalEntry.count", "tradePlan.findMany", "user.findUnique"]);
  });

  it("takes the new-account check from a plain trade count, with no extra query", async () => {
    state.trades = [perfTrade({ status: "open", closedAt: null }), perfTrade()];
    const overview = await getDashboardOverview("u1", "en", tehran);
    expect(overview).toMatchObject({ tradeCount: 2, openTrades: 1 });
    expect(overview).not.toHaveProperty("metrics");
    expect(calls.filter((c) => c.model === "trade" && c.method === "findMany")).toEqual([]);
  });

  it("no longer carries the coaching sentence or the lists nothing renders", async () => {
    const overview = await getDashboardOverview("u1", "en", tehran);
    for (const gone of ["coachingSummary", "recentJournal", "repeatedMistakes", "watchlists", "openIdeas", "marketContext", "portfolioSummary", "activeAlerts", "activeStrategies"]) {
      expect(overview).not.toHaveProperty(gone);
    }
  });
});

describe("getDashboardOverview: plans", () => {
  it("counts every active plan, not just the first five: 7 complete plans give completeCount 7", async () => {
    answers["tradePlan.findMany"] = Array.from({ length: 7 }, (_, index) => completePlan(`p${index}`));
    const overview = await getDashboardOverview("u1", "en", tehran);

    expect(overview.plans).toMatchObject({ activeCount: 7, completeCount: 7 });
    const planQuery = calls.find((c) => c.model === "tradePlan" && c.method === "findMany");
    expect(planQuery?.args.take).toBeUndefined();
    expect(planQuery?.args.where).toMatchObject({ userId: "u1", status: { in: ["planned", "active"] } });
  });

  it("does not count an incomplete plan as complete", async () => {
    answers["tradePlan.findMany"] = [completePlan("a"), completePlan("b", null, { invalidationRule: "" }), completePlan("c", null, { checklist: { scenario: false } })];
    expect((await getDashboardOverview("u1", "en", tehran)).plans).toMatchObject({ activeCount: 3, completeCount: 1 });
  });

  it("counts a plan for later today in Asia/Tehran as today's, and tomorrow's as not", async () => {
    answers["tradePlan.findMany"] = [
      // 18:30 UTC is 22:00 in Tehran on Oct 4: later today. 21:00 UTC is 00:30 on Oct 5: tomorrow there, still the 4th in UTC.
      completePlan("later-today", "2026-10-04T18:30:00.000Z"),
      completePlan("tomorrow", "2026-10-04T21:00:00.000Z"),
      completePlan("undated")
    ];
    const overview = await getDashboardOverview("u1", "en", tehran);
    expect(overview.plans).toMatchObject({ todayCount: 1, activeCount: 3 });
  });

  it("names the next plan: the soonest from today on, then an undated one, then an older one", async () => {
    const plan = (id: string, plannedFor: string | null) => completePlan(id, plannedFor);
    answers["tradePlan.findMany"] = [plan("old", "2026-10-01T10:00:00.000Z"), plan("undated", null), plan("soon", "2026-10-05T10:00:00.000Z"), plan("sooner", "2026-10-04T18:30:00.000Z")];
    expect((await getDashboardOverview("u1", "en", tehran)).plans.next).toMatchObject({ id: "sooner", symbol: "EURUSD", riskPercent: 1, plannedFor: "2026-10-04T18:30:00.000Z" });

    answers["tradePlan.findMany"] = [plan("old", "2026-10-01T10:00:00.000Z"), plan("undated", null)];
    expect((await getDashboardOverview("u1", "en", tehran)).plans.next).toMatchObject({ id: "undated", plannedFor: null });

    answers["tradePlan.findMany"] = [];
    expect((await getDashboardOverview("u1", "en", tehran)).plans).toEqual({ todayCount: 0, activeCount: 0, completeCount: 0, next: null });
  });
});

describe("getDashboardOverview: recent trades and reviews", () => {
  it("lists the latest five newest first, an open trade by its open time, with reviewed read from the verdict", async () => {
    const trade = (id: string, over: Partial<PerformanceTrade>) => perfTrade({ id, ...over });
    state.trades = [
      trade("a", { closedAt: "2026-10-01T10:00:00.000Z", ruleFollowed: "followed" }),
      trade("b", { closedAt: "2026-10-02T10:00:00.000Z", ruleFollowed: "unknown" }),
      trade("c", { closedAt: "2026-10-03T10:00:00.000Z", ruleFollowed: "broken", realizedPnl: -5, rMultiple: -1 }),
      trade("open", { status: "open", closedAt: null, openedAt: "2026-10-03T12:00:00.000Z", realizedPnl: null }),
      trade("planned", { status: "planned", closedAt: null, openedAt: "2026-10-04T09:00:00.000Z" }),
      trade("d", { closedAt: "2026-09-28T10:00:00.000Z", ruleFollowed: "mixed" }),
      trade("e", { closedAt: "2026-09-27T10:00:00.000Z" }),
      trade("f", { closedAt: "2026-09-26T10:00:00.000Z" })
    ];
    const { recentTrades } = await getDashboardOverview("u1", "en", tehran);

    expect(recentTrades.map((row) => row.id)).toEqual(["open", "c", "b", "a", "d"]);
    expect(recentTrades.map((row) => row.reviewed)).toEqual([false, true, false, true, true]);
    expect(recentTrades[0]).toMatchObject({ symbol: "BTCUSDT", side: "long", status: "open", closedAt: null, realizedPnl: null, rMultiple: null });
    expect(recentTrades[1]).toMatchObject({ status: "closed", closedAt: "2026-10-03T10:00:00.000Z", realizedPnl: -5, rMultiple: -1 });
  });

  it("reports the open reviews, the overdue ones and the next one", async () => {
    const { getReviewFocus } = await import("@/lib/services/reviews");
    vi.mocked(getReviewFocus).mockResolvedValueOnce({
      review: { id: "r1", title: "Weekly review", type: "weekly", status: "open", periodEnd: new Date("2026-10-02T00:00:00.000Z") },
      overdueCount: 1,
      suggestedType: "daily"
    } as never);
    answers["review.count"] = 3;
    const { reviewTasks } = await getDashboardOverview("u1", "en", tehran);
    expect(reviewTasks).toEqual({ openCount: 3, overdueCount: 1, next: { id: "r1", title: "Weekly review", type: "weekly", periodEnd: "2026-10-02T00:00:00.000Z" } });
    expect(calls.find((c) => c.model === "review" && c.method === "count")?.args.where).toEqual({ userId: "u1", status: "open" });
  });

  it("has no next review when none is open", async () => {
    expect((await getDashboardOverview("u1", "en", tehran)).reviewTasks).toEqual({ openCount: 0, overdueCount: 0, next: null });
  });
});

describe("getDashboardOverview: today, the last 30 days and the week's focus", () => {
  it("measures today in the trader's zone, from the trades closed then, against the daily limit", async () => {
    // Closed at 21:00Z on Oct 3 = 00:30 on Oct 4 in Tehran: it is today's loss there, yesterday's in UTC.
    state.trades = [perfTrade({ openedAt: "2026-10-03T19:00:00.000Z", closedAt: "2026-10-03T21:00:00.000Z", rMultiple: -2.1, realizedPnl: -21 })];

    const inTehran = await getDashboardOverview("u1", "en", tehran);
    expect(inTehran.today).toMatchObject({ day: "2026-10-04", closedToday: 1, netR: -2.1, basis: "r", lossPct: 2.1, limitPct: 3, state: "near" });

    const inUtc = await getDashboardOverview("u1", "en", { timeZone: "UTC", now });
    expect(inUtc.today).toMatchObject({ day: "2026-10-04", closedToday: 0, state: "clear" });
  });

  it("falls back to UTC for a zone this runtime does not know", async () => {
    const overview = await getDashboardOverview("u1", "en", { timeZone: "Mars/Olympus", now });
    expect(overview.today.day).toBe("2026-10-04");
    expect(overview.performance.context.timeZone).toBe("UTC");
  });

  it("carries the 30-day snapshot, with where its numbers come from", async () => {
    state.trades = [perfTrade({ closedAt: "2026-10-02T10:00:00.000Z", realizedPnl: 40, rMultiple: 2, ruleFollowed: "followed" }), perfTrade({ closedAt: "2026-08-02T10:00:00.000Z", realizedPnl: 999 })];
    const { performance } = await getDashboardOverview("u1", "en", tehran);
    expect(performance.context).toMatchObject({ period: "30d", timeZone: "Asia/Tehran", source: "own" });
    expect(performance.summary).toMatchObject({ closedTrades: 1, netPnl: 40 });
  });

  it("labels sample data as sample", async () => {
    state.trades = [perfTrade({ isSample: true })];
    expect((await getDashboardOverview("u1", "en", tehran)).performance.context.source).toBe("sample");
  });

  it("finds the week's focus from the last seven days only", async () => {
    const tagged = (hour: number, closedOn: string) =>
      perfTrade({ mistakes: ["Late entry"], rMultiple: -1, realizedPnl: -10, openedAt: `${closedOn}T0${hour}:00:00.000Z`, closedAt: `${closedOn}T0${hour + 1}:00:00.000Z` });
    state.trades = [tagged(1, "2026-10-02"), tagged(4, "2026-10-03"), tagged(1, "2026-09-10"), tagged(4, "2026-09-11")];
    expect((await getDashboardOverview("u1", "en", tehran)).focus).toMatchObject({ kind: "mistake", label: "Late entry", count: 2, totalR: -2 });

    state.trades = [tagged(1, "2026-09-10"), tagged(4, "2026-09-11")];
    expect((await getDashboardOverview("u1", "en", tehran)).focus).toBeNull();
  });
});
