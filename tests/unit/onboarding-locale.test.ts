import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sanitizeAiResponse } from "@/lib/ai/guard";
import {
  buildDisciplineSprint,
  buildOnboardingPlan,
  type DisciplineIssue,
  type DisciplineSprint,
  type Experience,
  type Market,
  type OnboardingPlan
} from "@/lib/onboarding/segmentation";

const PERSIAN_LETTER = /[؀-ۿ]/;
const ISSUES: DisciplineIssue[] = ["overtrading", "revenge", "moving_stops", "fomo", "no_plan", "oversizing"];
const EXPERIENCES: Experience[] = ["beginner", "intermediate", "advanced"];
const MARKETS: Market[] = ["crypto", "forex", "stocks"];

/** English words of three or more letters left in Persian text. */
function englishLeft(lines: string[]) {
  return lines.join(" ").split(/[^A-Za-z]+/).filter((word) => word.length >= 3);
}

function educational(lines: string[]) {
  return sanitizeAiResponse({ disclaimer: "", mode: "learning", summary: "", observations: lines, risks: [], nextActions: [] });
}

/** Every sentence a sprint writes for the user (identifiers like tags, timeframes and markets stay as they are). */
function sprintSentences(sprint: DisciplineSprint) {
  const playbook = sprint.starterPlaybook;
  return [
    sprint.title,
    sprint.targetMistake,
    sprint.sessionRule,
    playbook.name,
    playbook.description,
    ...playbook.entryRules,
    ...playbook.exitRules,
    ...playbook.invalidationRules,
    ...playbook.riskRules,
    ...playbook.allowedSessions,
    ...playbook.checklist,
    ...playbook.commonMistakes,
    ...playbook.idealMarketConditions,
    ...sprint.days.flatMap((day) => [day.focus, day.reviewPrompt])
  ];
}

function planSentences(plan: OnboardingPlan) {
  return [...plan.focusAreas, ...plan.startingChecklist];
}

describe("onboarding plan in Persian", () => {
  it.each(ISSUES.flatMap((issue) => EXPERIENCES.map((experience) => ({ issue, experience }))))(
    "$experience / $issue: focus areas and starting checklist are Persian and educational",
    ({ issue, experience }) => {
      const plan = buildOnboardingPlan({ experience, market: "forex", disciplineIssue: issue, language: "fa" });

      expect(plan.language).toBe("fa");
      expect(plan.focusAreas).toHaveLength(2);
      expect(plan.startingChecklist).toHaveLength(4);
      for (const line of planSentences(plan)) expect(line).toMatch(PERSIAN_LETTER);
      expect(englishLeft(planSentences(plan))).toEqual([]);
      expect(educational(planSentences(plan))).toEqual({ ok: true });
    }
  );

  it("keeps the numbers and identifiers language-independent", () => {
    const fa = buildOnboardingPlan({ experience: "beginner", market: "crypto", disciplineIssue: "overtrading", language: "fa" });
    const en = buildOnboardingPlan({ experience: "beginner", market: "crypto", disciplineIssue: "overtrading", language: "en" });

    expect(fa.segment).toBe(en.segment);
    expect(fa.defaultRiskPercent).toBe(en.defaultRiskPercent);
    expect(fa.recommendedFeatures).toEqual(en.recommendedFeatures);
  });

  it("keeps the English plan exactly as it was", () => {
    const plan = buildOnboardingPlan({ experience: "beginner", market: "crypto", disciplineIssue: "moving_stops", language: "en" });

    expect(plan.focusAreas).toEqual(["Pre-commit your stop before entry", "Mark each trade rule-followed or broken"]);
    expect(plan.startingChecklist).toEqual([
      "Start a trading session before your first trade",
      "Create one playbook (strategy) you will follow",
      "Set your max daily loss",
      "Trade in Learning Mode first"
    ]);
    expect(buildOnboardingPlan({ experience: "advanced", disciplineIssue: "fomo" }).startingChecklist[3]).toBe("Review last week's adherence");
  });
});

describe("onboarding wording in Persian", () => {
  const everySentence = ISSUES.flatMap((issue) => {
    const plan = buildOnboardingPlan({ experience: "beginner", market: "forex", disciplineIssue: issue, language: "fa" });
    return [...planSentences(plan), ...sprintSentences(buildDisciplineSprint(plan, "2026-06-27"))];
  });

  it("calls a plan پلن, the target mistake خطای هدف and a guardrail قانون محافظ, the way the rest of the app does", () => {
    const text = everySentence.join("\n");

    expect(text).not.toMatch(/برنامه(?!‌ریزی)/);
    expect(text).not.toMatch(/اشتباه هدف|حفاظ|در برابر|توسط کاربر/);
    expect(text).toContain("خطای هدف");
    expect(text).toContain("قانون محافظ جلسه بعد");
  });

  it("writes the calques as natural Persian", () => {
    const fomo = buildOnboardingPlan({ disciplineIssue: "fomo", language: "fa" });
    const overtrading = buildOnboardingPlan({ disciplineIssue: "overtrading", language: "fa" });
    const sprint = buildDisciplineSprint(overtrading, "2026-06-27");

    expect(overtrading.focusAreas[1]).toBe("هر معامله را بر اساس یک پلن ثبت کنید");
    expect(fomo.focusAreas[0]).toBe("بدون پلن مکتوب وارد نشوید");
    expect(sprint.targetMistake).toBe("معامله بعد از پر شدن سقف معاملات جلسه");
    expect(sprint.starterPlaybook.allowedSessions).toEqual(["جلسه متمرکزی که خودتان تعریف می‌کنید"]);
    expect(sprint.starterPlaybook.checklist[3]).toBe("خطای هدف مرور شد");
    expect(sprint.starterPlaybook.invalidationRules[1]).toBe("اگر چک‌لیست ناقص باشد، رکورد «بدون پلن» علامت می‌خورد.");
    expect(sprint.days[6].focus).toBe("اسپرینت را با یک درس فرایندی و قانون محافظ جلسه بعد ببندید.");
  });

  it("writes the risk default in the digits of the language, from the one shared helper", () => {
    const advanced = buildDisciplineSprint(buildOnboardingPlan({ experience: "advanced", language: "fa" }), "2026-06-27");
    const english = buildDisciplineSprint(buildOnboardingPlan({ experience: "advanced", language: "en" }), "2026-06-27");

    expect(advanced.starterPlaybook.riskRules[0]).toBe("ریسک پیش‌فرض در طول اسپرینت ۱٪ برای هر معامله می‌ماند.");
    expect(english.starterPlaybook.riskRules[0]).toBe("Default risk stays at 1% per trade during the sprint.");

    const source = readFileSync(join(process.cwd(), "src/lib/onboarding/segmentation.ts"), "utf8");
    expect(source).toContain('import { localizeDigits } from "@/lib/services/locale"');
    expect(source).not.toContain("۰۱۲۳۴۵۶۷۸۹");
  });
});

describe("discipline sprint in Persian", () => {
  it.each(ISSUES.flatMap((issue) => MARKETS.map((market) => ({ issue, market }))))(
    "$market / $issue: every sentence is Persian and educational; markets, tags and timeframes stay identifiers",
    ({ issue, market }) => {
      const plan = buildOnboardingPlan({ experience: "beginner", market, disciplineIssue: issue, language: "fa" });
      const sprint = buildDisciplineSprint(plan, "2026-06-27");

      expect(sprintSentences(sprint)).toHaveLength(38);
      for (const line of sprintSentences(sprint)) expect(line).toMatch(PERSIAN_LETTER);
      expect(englishLeft(sprintSentences(sprint))).toEqual([]);
      expect(educational(sprintSentences(sprint))).toEqual({ ok: true });
      expect(sprint.starterPlaybook.allowedMarkets).toEqual([market]);
      expect(sprint.starterPlaybook.tags).toEqual(["onboarding-sprint", "beginner", market, issue]);
      expect(sprint.starterPlaybook.timeframes).toEqual(["1h", "4h"]);
    }
  );

  it("writes the risk default with Persian digits and the playbook name with the market in Persian", () => {
    const plan = buildOnboardingPlan({ experience: "beginner", market: "forex", disciplineIssue: "no_plan", language: "fa" });
    const sprint = buildDisciplineSprint(plan, "2026-06-27");

    expect(sprint.starterPlaybook.riskRules[0]).toBe("ریسک پیش‌فرض در طول اسپرینت ۰٫۵٪ برای هر معامله می‌ماند.");
    expect(sprint.starterPlaybook.name).toBe("پلی‌بوک شروع انضباط فارکس");
    expect(sprint.days[0].reviewPrompt).toBe(`آیا از «${sprint.targetMistake}» پرهیز کردم و از قانون مکتوب جلسه پیروی کردم؟`);
    expect(sprint.riskDefaults).toEqual({ riskPerTradePct: 0.5, maxDailyLossPct: 3, maxWeeklyLossPct: 6 });
  });

  it("keeps the dates, scores and the English sprint exactly as they were", () => {
    const fa = buildDisciplineSprint(buildOnboardingPlan({ disciplineIssue: "fomo", language: "fa" }), "2026-06-27");
    const en = buildDisciplineSprint(buildOnboardingPlan({ disciplineIssue: "fomo", language: "en" }), "2026-06-27");

    expect(fa.days.map(({ day, date, targetScore }) => ({ day, date, targetScore }))).toEqual(
      en.days.map(({ day, date, targetScore }) => ({ day, date, targetScore }))
    );
    expect([fa.startDate, fa.endDate]).toEqual([en.startDate, en.endDate]);
    expect(en.title).toBe("7-day discipline sprint");
    expect(en.targetMistake).toBe("Entering because price moved without a written plan");
    expect(en.starterPlaybook.name).toBe("Crypto discipline starter");
    expect(en.days[0].reviewPrompt).toBe('Did I avoid "Entering because price moved without a written plan" and follow the written session rule?');
  });
});
