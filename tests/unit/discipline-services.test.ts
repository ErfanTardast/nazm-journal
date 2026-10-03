import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/services/reviews", () => ({ getReviewFocus: vi.fn(async () => ({ overdueCount: 0 })) }));
vi.mock("@/lib/services/mistake-memory", () => ({ getMistakeMemory: vi.fn(async () => []) }));
import { prisma } from "@/lib/db/prisma";
import { getDisciplineStreak } from "@/lib/services/discipline-streak";
import { getDisciplineOverview } from "@/lib/services/discipline";

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

  beforeEach(() => {
    journalFindMany = vi.fn(async (args: { select: Record<string, boolean> }) =>
      args.select.ruleFollowed
        ? [...Array(7).fill({ ruleFollowed: "unknown" }), { ruleFollowed: "mixed" }, ...Array(2).fill({ ruleFollowed: "followed" })]
        : []
    );
    journalCount = vi.fn(async () => 0);
    // Newest first: the last two closed trades lost money.
    tradeFindMany = vi.fn(async (args: { where: { status?: string } }) =>
      args.where.status === "closed" ? [{ realizedPnl: "-3" }, { realizedPnl: "-5" }, { realizedPnl: "12" }] : []
    );
    Object.assign(prisma, {
      tradePlan: { findMany: vi.fn(async () => []) },
      tradeJournalEntry: { findMany: journalFindMany, count: journalCount },
      trade: { findMany: tradeFindMany, count: vi.fn(async () => 60) },
      user: { findUnique: vi.fn(async () => ({ riskPerTradePct: 1, maxDailyLossPct: 3 })) }
    });
  });

  it("takes this week's rule verdicts from trades opened this week, not from when their journal was created", async () => {
    await getDisciplineOverview("u1");

    const verdictQuery = journalFindMany.mock.calls.map((call) => call[0]).find((args) => args.select.ruleFollowed);
    expect(verdictQuery.where).toEqual({ userId: "u1", trade: { openedAt: { gte: expect.any(Date) } } });
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
});
