import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    user: { update: vi.fn() },
    riskProfile: { upsert: vi.fn() },
    strategy: {
      findFirst: vi.fn(),
      create: vi.fn()
    },
    review: {
      findFirst: vi.fn(),
      create: vi.fn()
    },
    onboardingProfile: {
      findUnique: vi.fn(),
      upsert: vi.fn()
    }
  };

  return {
    tx,
    prisma: {
      onboardingProfile: {
        findUnique: vi.fn()
      },
      $transaction: vi.fn(async (fn: (txArg: typeof tx) => unknown) => fn(tx))
    }
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

import { getOnboardingProfile, saveOnboardingProfile } from "@/lib/services/onboarding";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tx.strategy.findFirst.mockResolvedValue(null);
  mocks.tx.strategy.create.mockResolvedValue({ id: "strategy-1" });
  mocks.tx.review.findFirst.mockResolvedValue(null);
  mocks.tx.review.create.mockResolvedValue({ id: "review-1" });
  mocks.tx.onboardingProfile.upsert.mockImplementation(async ({ create }) => ({
    id: "profile-1",
    ...create,
    completedAt: new Date("2026-06-27T10:00:00.000Z")
  }));
});

describe("onboarding service", () => {
  it("saves onboarding answers into risk defaults, starter playbook, day-one review, and profile", async () => {
    const profile = await saveOnboardingProfile(
      "user-1",
      { experience: "beginner", market: "crypto", disciplineIssue: "overtrading", language: "fa" },
      new Date("2026-06-27T10:00:00.000Z")
    );

    expect(profile.segment).toBe("beginner-crypto-overtrading");
    expect(profile.defaultRiskPercent).toBe(0.5);
    expect(profile.starterStrategyId).toBe("strategy-1");
    expect(profile.firstReviewId).toBe("review-1");
    expect(profile.sprint.days).toHaveLength(7);

    expect(mocks.tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ locale: "fa", riskPerTradePct: 0.5 })
      })
    );
    expect(mocks.tx.riskProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        update: expect.objectContaining({ riskPerTradePct: 0.5 })
      })
    );
    expect(mocks.tx.strategy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          tags: expect.arrayContaining(["onboarding-sprint", "crypto"])
        })
      })
    );
    expect(mocks.tx.review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          title: "اسپرینت انضباط - روز ۱ - ۶ تیر ۱۴۰۵",
          linkedStrategyIds: ["strategy-1"]
        })
      })
    );
  });

  describe("in the language the user chose", () => {
    const now = new Date("2026-06-27T10:00:00.000Z");
    const answers = { experience: "beginner", market: "forex", disciplineIssue: "overtrading" };
    const createdReview = () => mocks.tx.review.create.mock.calls[0][0].data;

    it("writes the day-one review in Persian for fa", async () => {
      await saveOnboardingProfile("user-1", { ...answers, language: "fa" }, now);
      const review = createdReview();

      expect(review.title).toBe("اسپرینت انضباط - روز ۱ - ۶ تیر ۱۴۰۵");
      expect(review.title).not.toMatch(/[0-9]/);
      expect(review.checklist.map((item: { key: string }) => item.key)).toEqual(["sprint_session_rule", "sprint_risk_default", "sprint_target_mistake", "sprint_lesson"]);
      expect(review.checklist[0].label).toBe("از قانون جلسه استفاده کنید: جلسه را بعد از دو معامله ثبت‌شده یا یک معامله با نقض قانون متوقف کنید.");
      expect(review.checklist[1].label).toBe("ریسک را برای رکوردهای برنامه‌ریزی‌شده روی ۰٫۵٪ نگه دارید.");
      expect(review.checklist[2].label).toBe("مراقب این باشید: معامله بعد از پر شدن سقف معاملات جلسه.");
      expect(review.checklist[3].label).toBe("پیش از بستن مرور، یک درس فرایندی بنویسید.");
      expect(review.insights).toEqual(["خط پایه را تعیین کنید و یک جلسه متمرکز شروع کنید."]);
      expect(review.risks).toEqual(["خطای هدف: معامله بعد از پر شدن سقف معاملات جلسه"]);
      expect(review.nextActions).toEqual(["جلسه را بعد از دو معامله ثبت‌شده یا یک معامله با نقض قانون متوقف کنید."]);
      for (const item of review.checklist) expect(item.label).toMatch(/[؀-ۿ]/);
    });

    it("keeps the English day-one review exactly as it was for en", async () => {
      await saveOnboardingProfile("user-1", { ...answers, language: "en" }, now);
      const review = createdReview();

      expect(review.title).toBe("Discipline sprint - day 1 - 2026-06-27");
      expect(review.checklist.map((item: { label: string }) => item.label)).toEqual([
        "Use the session rule: Stop the session after two recorded trades or one broken-rule trade.",
        "Keep risk at 0.5% for planned records.",
        "Watch for: Taking trades after the session cap.",
        "Write one process lesson before closing the review."
      ]);
      expect(review.insights).toEqual(["Set the baseline and start one focused session."]);
      expect(review.risks).toEqual(["Target mistake: Taking trades after the session cap"]);
    });

    it("finds the same day's review whichever language it was written in, so saving again does not add a second one", async () => {
      mocks.tx.review.findFirst.mockResolvedValue({ id: "review-existing" });

      const profile = await saveOnboardingProfile("user-1", { ...answers, language: "fa" }, now);

      expect(mocks.tx.review.findFirst).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          type: "daily",
          title: { in: ["اسپرینت انضباط - روز ۱ - ۶ تیر ۱۴۰۵", "Discipline sprint - day 1 - 2026-06-27", "اسپرینت انضباط - روز ۱ - 2026-06-27"] }
        }
      });
      expect(mocks.tx.review.create).not.toHaveBeenCalled();
      expect(profile.firstReviewId).toBe("review-existing");
    });

    it("looks for the English title first when the sprint is saved in English, and still knows the Persian title from before the date format changed", async () => {
      mocks.tx.review.findFirst.mockResolvedValue({ id: "review-existing" });

      await saveOnboardingProfile("user-1", { ...answers, language: "en" }, now);

      expect(mocks.tx.review.findFirst).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          type: "daily",
          title: { in: ["Discipline sprint - day 1 - 2026-06-27", "اسپرینت انضباط - روز ۱ - ۶ تیر ۱۴۰۵", "اسپرینت انضباط - روز ۱ - 2026-06-27"] }
        }
      });
      expect(mocks.tx.review.create).not.toHaveBeenCalled();
    });

    it.each(["en", "fa"] as const)("caps trades per day at two for the overtrading issue in %s, and at three otherwise", async (language) => {
      await saveOnboardingProfile("user-1", { ...answers, language }, now);
      await saveOnboardingProfile("user-1", { ...answers, disciplineIssue: "fomo", language }, now);

      const rules = mocks.tx.riskProfile.upsert.mock.calls.map((call) => call[0].create.rules);
      expect(rules[0].maxTradesPerDay).toBe(2);
      expect(rules[1].maxTradesPerDay).toBe(3);
      expect(rules[0].onboardingSprint.targetMistake).toBe(language === "fa" ? "معامله بعد از پر شدن سقف معاملات جلسه" : "Taking trades after the session cap");
    });
  });

  it("serializes an existing profile for resume", async () => {
    mocks.prisma.onboardingProfile.findUnique.mockResolvedValue({
      id: "profile-1",
      segment: "advanced-forex-revenge",
      experience: "advanced",
      market: "forex",
      disciplineIssue: "revenge",
      language: "en",
      defaultRiskPercent: 1,
      focusAreas: ["Set a max daily loss and stop for the day"],
      recommendedFeatures: ["journal"],
      startingChecklist: ["Start a trading session before your first trade"],
      sprint: { days: [] },
      starterStrategyId: "strategy-1",
      firstReviewId: "review-1",
      completedAt: new Date("2026-06-27T10:00:00.000Z")
    });

    const profile = await getOnboardingProfile("user-1");
    expect(profile?.segment).toBe("advanced-forex-revenge");
    expect(profile?.completedAt).toBe("2026-06-27T10:00:00.000Z");
  });
});
