import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildReviewContext, coachContextLines, type CoachContextInput } from "@/lib/services/ai/coach-context";
import { sanitizeAiResponse } from "@/lib/ai/guard";

vi.mock("@/lib/services/discipline", () => ({ getDisciplineOverview: vi.fn() }));
vi.mock("@/lib/services/sessions", () => ({ getActiveSession: vi.fn() }));
vi.mock("@/lib/services/trade-plans", () => ({ listTradePlans: vi.fn() }));
vi.mock("@/lib/services/reviews", () => ({ getReviewFocus: vi.fn() }));
vi.mock("@/lib/services/discipline-streak", () => ({ getDisciplineStreak: vi.fn() }));
import { getDisciplineOverview } from "@/lib/services/discipline";
import { getActiveSession } from "@/lib/services/sessions";
import { listTradePlans } from "@/lib/services/trade-plans";
import { getReviewFocus } from "@/lib/services/reviews";
import { getDisciplineStreak } from "@/lib/services/discipline-streak";

const FULL: CoachContextInput = {
  disciplineGrade: "B",
  disciplineScore: 78,
  topMistake: { mistake: "جابه‌جایی حد ضرر", frequency: 3, streak: 2 },
  sessionMistakeToAvoid: "ترید انتقامی",
  reviewedSymbol: "BTCUSDT",
  planForSymbol: { symbol: "BTCUSDT", bias: "صعودی", riskPercent: 0.5, invalidationRule: "close below 60k" },
  hasAnyPlans: true,
  overdueReviews: 2,
  streak: { currentStreak: 5, brokeStreakOnLastDay: false }
};

describe("coachContextLines in Persian", () => {
  it("writes every saved-context line in Persian, with the user's own words kept as typed", () => {
    const { observations, nextActions } = coachContextLines(FULL, "fa");
    const blob = [...observations, ...nextActions].join("\n");

    expect(observations).toHaveLength(6);
    expect(nextActions).toHaveLength(5);
    expect(observations[0]).toBe("درجه انضباط فعلی شما B است (۷۸ از ۱۰۰).");
    expect(blob).toContain("«جابه‌جایی حد ضرر»");
    expect(observations[1]).toContain("(۳ بار دیده شده، ۲ بار پشت‌سرهم)");
    expect(blob).toContain("«ترید انتقامی»");
    expect(blob).toContain("BTCUSDT");
    expect(blob).toContain("«close below 60k»");
    expect(blob).toContain("ریسک ۰٫۵٪");
    expect(blob).toContain("دیدگاه: صعودی");
    expect(blob).not.toContain("سوگیری");
    expect(blob).toContain("در جلسه فعال‌تان قرار گذاشته‌اید از این پرهیز کنید: «ترید انتقامی»");
    expect(blob).toContain("برای BTCUSDT یک پلن مکتوب دارید");
    expect(blob).not.toContain("برنامه");
    expect(observations.join(" ")).toContain("۲ مرور عقب‌افتاده");
    expect(observations.join(" ")).toContain("زنجیره انضباط شما ۵ روز است");
    expect(nextActions.join(" ")).toContain("زنجیره را حفظ کنید");
    // Nothing is left in English except what the user typed.
    const english = blob.replace(/BTCUSDT|close below 60k|[«»]/g, "").match(/[A-Za-z]{2,}/g) ?? [];
    expect(english).toEqual([]);
  });

  it("stays inside the educational scope", () => {
    const { observations, nextActions } = coachContextLines(FULL, "fa");
    const response = { disclaimer: "", mode: "learning" as const, summary: "", observations, risks: [], nextActions };
    expect(sanitizeAiResponse(response)).toEqual({ ok: true });
  });

  it("covers a missing plan and a broken streak in Persian", () => {
    const { observations, nextActions } = coachContextLines(
      { reviewedSymbol: "EURUSD", hasAnyPlans: true, streak: { currentStreak: 0, brokeStreakOnLastDay: true } },
      "fa"
    );

    expect(observations[0]).toBe("هیچ پلن مکتوبی EURUSD را پوشش نمی‌دهد.");
    expect(observations[1]).toBe("آخرین روز فعال شما زنجیره انضباط را شکست.");
    expect(nextActions[0]).toBe("پیش از معامله بعدی EURUSD، پلن (سناریو، ریسک، ابطال) را بنویسید.");
    expect(nextActions[1]).toContain("شروع دوباره");
  });

  it("fabricates nothing from empty context, in either language", () => {
    expect(coachContextLines({}, "fa")).toEqual({ observations: [], nextActions: [] });
  });

  it("keeps the English lines unchanged for en and when no locale is given", () => {
    expect(coachContextLines(FULL, "en")).toEqual(coachContextLines(FULL));
    expect(coachContextLines(FULL).observations[0]).toBe("Your current discipline grade is B (78/100).");
    expect(coachContextLines(FULL).observations).toContain("You have 2 overdue reviews.");
  });
});

describe("buildReviewContext in Persian", () => {
  beforeEach(() => {
    vi.mocked(getDisciplineOverview).mockResolvedValue({
      disciplineScore: { grade: "C", score: 66, checks: [] },
      propGuard: {},
      weekSummary: {},
      mistakePatterns: [{ mistake: "moved stop", frequency: 4, streak: 1, lastSeen: new Date(), avgRImpact: null }]
    } as never);
    vi.mocked(getActiveSession).mockResolvedValue(null as never);
    vi.mocked(listTradePlans).mockResolvedValue([] as never);
    vi.mocked(getReviewFocus).mockResolvedValue({ review: null, overdueCount: 0, suggestedType: "daily" } as never);
    vi.mocked(getDisciplineStreak).mockResolvedValue(null as never);
  });

  it("builds the saved-context lines in the asked language", async () => {
    const fa = await buildReviewContext("u1", "BTCUSDT", "fa");
    const en = await buildReviewContext("u1", "BTCUSDT");

    expect(fa.observations[0]).toBe("درجه انضباط فعلی شما C است (۶۶ از ۱۰۰).");
    expect(fa.observations[1]).toContain("«moved stop»");
    expect(en.observations[0]).toBe("Your current discipline grade is C (66/100).");
  });
});
