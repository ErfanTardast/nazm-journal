import { describe, expect, it, vi } from "vitest";
import { calculateDisciplineStreak } from "@/lib/calculations/discipline-streak";

describe("calculateDisciplineStreak (pure)", () => {
  it("returns zeros for no active days", () => {
    const s = calculateDisciplineStreak([]);
    expect(s).toMatchObject({ currentStreak: 0, bestStreak: 0, totalActiveDays: 0, lastActiveDate: null, brokeStreakOnLastDay: false });
  });

  it("counts an all-disciplined run", () => {
    const s = calculateDisciplineStreak([
      { date: "2026-06-01", disciplined: true },
      { date: "2026-06-02", disciplined: true },
      { date: "2026-06-05", disciplined: true }, // gap day does NOT break the streak (active-day based)
    ]);
    expect(s.currentStreak).toBe(3);
    expect(s.bestStreak).toBe(3);
    expect(s.totalActiveDays).toBe(3);
    expect(s.totalDisciplinedDays).toBe(3);
    expect(s.lastActiveDate).toBe("2026-06-05");
  });

  it("resets current streak after a rule break, keeps best", () => {
    const s = calculateDisciplineStreak([
      { date: "2026-06-01", disciplined: true },
      { date: "2026-06-02", disciplined: true },
      { date: "2026-06-03", disciplined: false }, // break
      { date: "2026-06-04", disciplined: true },
      { date: "2026-06-05", disciplined: true },
    ]);
    expect(s.currentStreak).toBe(2); // last two
    expect(s.bestStreak).toBe(2);
    expect(s.brokeStreakOnLastDay).toBe(false);
  });

  it("flags a break on the most recent day", () => {
    const s = calculateDisciplineStreak([
      { date: "2026-06-01", disciplined: true },
      { date: "2026-06-02", disciplined: false },
    ]);
    expect(s.currentStreak).toBe(0);
    expect(s.brokeStreakOnLastDay).toBe(true);
  });

  it("sorts unordered input by date", () => {
    const s = calculateDisciplineStreak([
      { date: "2026-06-03", disciplined: true },
      { date: "2026-06-01", disciplined: true },
      { date: "2026-06-02", disciplined: false },
    ]);
    expect(s.lastActiveDate).toBe("2026-06-03");
    expect(s.currentStreak).toBe(1);
  });
});

describe("getDisciplineStreak (service, mocked prisma)", () => {
  it("derives disciplined days from trades (broken/mixed break a day, UTC-keyed)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/prisma", () => ({
      prisma: {
        trade: {
          findMany: vi.fn().mockResolvedValue([
            { openedAt: new Date("2026-06-01T10:00:00Z"), ruleFollowed: "followed" },
            { openedAt: new Date("2026-06-02T08:00:00Z"), ruleFollowed: "followed" },
            { openedAt: new Date("2026-06-02T20:00:00Z"), ruleFollowed: "broken" }, // same day -> breaks it
            { openedAt: new Date("2026-06-03T10:00:00Z"), ruleFollowed: "mixed" }, // mixed also breaks
            { openedAt: new Date("2026-06-04T10:00:00Z"), ruleFollowed: "followed" },
          ]),
        },
      },
    }));
    const { getDisciplineStreak } = await import("@/lib/services/discipline-streak");
    const s = await getDisciplineStreak("u1");
    expect(s.totalActiveDays).toBe(4); // 06-01..06-04
    expect(s.totalDisciplinedDays).toBe(2); // 06-01 and 06-04
    expect(s.currentStreak).toBe(1); // only 06-04 (06-03 mixed broke it)
    expect(s.bestStreak).toBe(1);
    vi.doUnmock("@/lib/db/prisma");
  });
});
