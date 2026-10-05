import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/services/reviews", () => ({ getReviewFocus: vi.fn(async () => ({ overdueCount: 0 })) }));
vi.mock("@/lib/services/mistake-memory", () => ({ getMistakeMemory: vi.fn(async () => []) }));
import { prisma } from "@/lib/db/prisma";
import { getDisciplineStreak } from "@/lib/services/discipline-streak";
import { getDisciplineOverview } from "@/lib/services/discipline";
import { todayRisk } from "@/lib/calculations/today-risk";

const day = (date: string) => new Date(`${date}T10:00:00Z`);

describe("getDisciplineStreak", () => {
  beforeEach(() => {
    Object.assign(prisma, {
      trade: {
        findMany: vi.fn(async () => [
          { openedAt: day("2026-09-01"), ruleFollowed: "followed" },
          { openedAt: day("2026-09-02"), ruleFollowed: "unknown" },
          { openedAt: day("2026-09-03"), ruleFollowed: "followed" },
          { openedAt: day("2026-09-03"), ruleFollowed: "unknown" },
          { openedAt: day("2026-09-04"), ruleFollowed: "broken" }
        ])
      }
    });
  });

  it("leaves days with unreviewed trades out of the streak and counts them separately", async () => {
    const streak = await getDisciplineStreak("u1");

    // 09-02 (only unknown) and 09-03 (followed + unknown) are not evidence either way.
    expect(streak).toMatchObject({ totalActiveDays: 2, totalDisciplinedDays: 1, unreviewedDays: 2, currentStreak: 0, brokeStreakOnLastDay: true });
  });
});

describe("getDisciplineOverview", () => {
  let journalFindMany: ReturnType<typeof vi.fn>;
  let journalCount: ReturnType<typeof vi.fn>;
  let tradeFindMany: ReturnType<typeof vi.fn>;
  let userFindUnique: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    userFindUnique = vi.fn(async () => ({ riskPerTradePct: 1, maxDailyLossPct: 3, startingBalance: null, timezone: "UTC" }));
    journalFindMany = vi.fn(async () => []);
    journalCount = vi.fn(async () => 0);
    // Newest first: the last two closed trades lost money. The week's verdicts are read off the trades themselves.
    tradeFindMany = vi.fn(async (args: { where: { status?: string }; select: Record<string, boolean> }) => {
      if (args.select.ruleFollowed) return [...Array(7).fill({ ruleFollowed: "unknown" }), { ruleFollowed: "mixed" }, ...Array(2).fill({ ruleFollowed: "followed" })];
      return args.where.status === "closed" ? [{ realizedPnl: "-3" }, { realizedPnl: "-5" }, { realizedPnl: "12" }] : [];
    });
    Object.assign(prisma, {
      tradePlan: { findMany: vi.fn(async () => []) },
      tradeJournalEntry: { findMany: journalFindMany, count: journalCount },
      trade: { findMany: tradeFindMany, count: vi.fn(async () => 60) },
      user: { findUnique: userFindUnique }
    });
  });

  it("takes this week's rule verdicts from the trades opened this week (Trade.ruleFollowed), not from their journal rows", async () => {
    await getDisciplineOverview("u1");

    const verdictQuery = tradeFindMany.mock.calls.map((call) => call[0]).find((args) => args.select.ruleFollowed);
    expect(verdictQuery.where).toEqual({ userId: "u1", openedAt: { gte: expect.any(Date) } });
    expect(journalFindMany.mock.calls.map((call) => call[0]).filter((args) => args.select.ruleFollowed)).toEqual([]);
  });

  it("starts the week with the trader's day: today and the six before, from midnight in their zone", async () => {
    userFindUnique.mockResolvedValue({ riskPerTradePct: 1, maxDailyLossPct: 3, startingBalance: null, timezone: "Asia/Tehran" });
    await getDisciplineOverview("u1", "en", { now: new Date("2026-10-04T10:00:00.000Z") });

    const verdictQuery = tradeFindMany.mock.calls.map((call) => call[0]).find((args) => args.select.ruleFollowed);
    // Sep 28 00:00 in Tehran (UTC+3:30) is Sep 27 at 20:30 UTC.
    expect(verdictQuery.where.openedAt.gte).toEqual(new Date("2026-09-27T20:30:00.000Z"));
  });

  it("takes this week's repeated mistakes from trades opened this week", async () => {
    await getDisciplineOverview("u1");

    const mistakesQuery = journalFindMany.mock.calls.map((call) => call[0]).find((args) => args.select.mistakes);
    expect(mistakesQuery.where).toEqual({ userId: "u1", trade: { openedAt: { gte: expect.any(Date) } } });
  });

  it("scores unreviewed trades as not yet following the rules", async () => {
    const overview = await getDisciplineOverview("u1");

    expect(overview.disciplineScore?.checks.find((c) => c.key === "rule_discipline")?.score).toBe(20);
    expect(overview.weekSummary).toMatchObject({ followedRules: 2, brokenRules: 0, mixedRules: 1, unreviewedRules: 7 });
  });

  it("counts a closed trade as journaled only when its lesson is written", async () => {
    const overview = await getDisciplineOverview("u1");

    expect(journalCount.mock.calls[0][0].where).toMatchObject({ userId: "u1", trade: { status: "closed" }, lessonsLearned: { not: null }, NOT: { lessonsLearned: "" } });
    expect(overview.disciplineScore?.checks.find((c) => c.key === "journal_completeness")?.score).toBe(0);
  });

  it("warns about two losses in a row from the trades' results, not their rule verdicts", async () => {
    const overview = await getDisciplineOverview("u1");

    expect(overview.propGuard.alerts.map((a) => a.key)).toContain("revenge_pattern");
  });

  it("gives a brand-new account no grade and no score instead of a default B / 75", async () => {
    journalFindMany.mockImplementation(async () => []);
    tradeFindMany.mockImplementation(async () => []);
    Object.assign(prisma, { trade: { findMany: tradeFindMany, count: vi.fn(async () => 0) } });

    const overview = await getDisciplineOverview("new-user");

    expect(overview.disciplineScore).toBeNull();
    expect(overview.weekSummary).toMatchObject({ totalPlans: 0, totalTrades: 0 });
  });

  it("looks only at trades closed this week for that warning", async () => {
    await getDisciplineOverview("u1");

    const resultsQuery = tradeFindMany.mock.calls.map((call) => call[0]).find((args) => args.where.status === "closed");
    expect(resultsQuery.where).toEqual({ userId: "u1", status: "closed", closedAt: { gte: expect.any(Date) } });
  });

  describe("today's loss, shared with the dashboard's meter", () => {
    const now = new Date("2026-10-04T10:00:00.000Z");
    // Opened yesterday evening, closed this morning at -2.1R: with a 1% risk and a 3% limit that is 70% of the limit.
    const row = (over: Record<string, unknown>) => ({
      status: "closed" as const,
      openedAt: new Date("2026-10-03T18:00:00.000Z"),
      closedAt: new Date("2026-10-04T06:00:00.000Z"),
      realizedPnl: "-21",
      rMultiple: "-2.1",
      riskPercent: "1",
      riskAmount: null,
      strategyId: "s1",
      ...over
    });
    const serveToday = (rows: unknown[]) =>
      tradeFindMany.mockImplementation(async (args: { where: { status?: string }; select: Record<string, boolean> }) => {
        if (args.select.ruleFollowed) return [];
        return args.where.status === "closed" ? [] : rows;
      });

    it("reads the day's trades closed today, wherever they were opened, from the trader's midnight", async () => {
      serveToday([]);
      userFindUnique.mockResolvedValue({ riskPerTradePct: 1, maxDailyLossPct: 3, startingBalance: null, timezone: "Asia/Tehran" });
      await getDisciplineOverview("u1", "en", { now });

      const todayQuery = tradeFindMany.mock.calls.map((call) => call[0]).find((args) => args.where.OR);
      // Oct 4 00:00 in Tehran (UTC+3:30) is Oct 3 at 20:30 UTC.
      const midnight = new Date("2026-10-03T20:30:00.000Z");
      expect(todayQuery.where).toEqual({ userId: "u1", OR: [{ openedAt: { gte: midnight } }, { closedAt: { gte: midnight } }] });
    });

    it("gives the guard the same percent as todayRisk, so the alert and the meter agree", async () => {
      const rows = [row({})];
      serveToday(rows);
      const overview = await getDisciplineOverview("u1", "en", { now });

      const meter = todayRisk(
        rows.map((r) => ({ ...r, openedAt: r.openedAt.toISOString(), closedAt: r.closedAt.toISOString(), realizedPnl: -21, rMultiple: -2.1, riskPercent: 1, riskAmount: null })),
        { timeZone: "UTC", now, maxDailyLossPct: 3, riskPerTradePct: 1, startingBalance: null }
      );
      expect(meter).toMatchObject({ lossPct: 2.1, state: "near" });
      expect(overview.propGuard.todayLossPct).toBe(meter.lossPct);
      expect(overview.propGuard.alerts.map((alert) => alert.key)).toContain("daily_loss_warning");
    });

    it("does not count a loss that closed before today's midnight, and shows a win as no loss", async () => {
      serveToday([row({ closedAt: new Date("2026-10-03T22:00:00.000Z") }), row({ realizedPnl: "30", rMultiple: "3" })]);
      const overview = await getDisciplineOverview("u1", "en", { now });

      expect(overview.propGuard.todayLossPct).toBe(0);
      expect(overview.propGuard.alerts.map((alert) => alert.key)).not.toContain("daily_loss_warning");
    });

    it("counts only the trades opened today for the trade count and the unplanned warning", async () => {
      serveToday([row({ strategyId: null }), row({ openedAt: new Date("2026-10-04T05:00:00.000Z"), strategyId: null })]);
      const overview = await getDisciplineOverview("u1", "en", { now });

      expect(overview.propGuard.alerts.find((alert) => alert.key === "unplanned_trades")?.message).toMatch(/^1 trade today/);
    });
  });
});
