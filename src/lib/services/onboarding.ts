import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  buildDisciplineSprint,
  buildOnboardingPlan,
  type DisciplineSprint,
  type Language,
  type OnboardingRawInput
} from "@/lib/onboarding/segmentation";
import { formatGeneratedDate, localizeDigits } from "@/lib/services/locale";
import { getUtcDayPeriod } from "@/lib/services/reviews";
import { normalizeFirstRunState, type FirstRunState, type PrimaryGoal, type TradingPlatform } from "@/lib/onboarding/first-run";
import type { OnboardingStateInput } from "@/lib/validation/onboarding";

type OnboardingProfileRecord = {
  id: string;
  segment: string;
  experience: string;
  market: string;
  disciplineIssue: string;
  language: string;
  defaultRiskPercent: Prisma.Decimal | number;
  focusAreas: string[];
  recommendedFeatures: string[];
  startingChecklist: string[];
  sprint: Prisma.JsonValue;
  starterStrategyId: string | null;
  firstReviewId: string | null;
  completedAt: Date;
};

export type PersistedOnboardingProfile = {
  id: string;
  segment: string;
  experience: string;
  market: string;
  disciplineIssue: string;
  language: string;
  defaultRiskPercent: number;
  focusAreas: string[];
  recommendedFeatures: string[];
  startingChecklist: string[];
  sprint: DisciplineSprint;
  starterStrategyId: string | null;
  firstReviewId: string | null;
  completedAt: string;
};

/** The day-one sprint review's own wording, per language (the sprint itself is written in `onboarding/segmentation`). */
const firstReviewCopy = {
  en: {
    title: (date: string) => `Discipline sprint - day 1 - ${date}`,
    sessionRule: (rule: string) => `Use the session rule: ${rule}`,
    riskDefault: (riskPercent: string) => `Keep risk at ${riskPercent}% for planned records.`,
    watchFor: (mistake: string) => `Watch for: ${mistake}.`,
    lesson: "Write one process lesson before closing the review.",
    startFocus: "Start the sprint with one focused session.",
    targetMistake: (mistake: string) => `Target mistake: ${mistake}`
  },
  fa: {
    title: (date: string) => `اسپرینت انضباط - روز ۱ - ${formatGeneratedDate(date, "fa")}`,
    sessionRule: (rule: string) => `از قانون جلسه استفاده کنید: ${rule}`,
    riskDefault: (riskPercent: string) => `ریسک را برای رکوردهای برنامه‌ریزی‌شده روی ${riskPercent}٪ نگه دارید.`,
    watchFor: (mistake: string) => `مراقب این باشید: ${mistake}.`,
    lesson: "پیش از بستن مرور، یک درس فرایندی بنویسید.",
    startFocus: "اسپرینت را با یک جلسه متمرکز شروع کنید.",
    targetMistake: (mistake: string) => `خطای هدف: ${mistake}`
  }
} as const;

/** The Persian day-one title as it was written before dates went into the Persian calendar (ISO day, ASCII digits). */
function legacyPersianTitle(isoDay: string): string {
  return `اسپرینت انضباط - روز ۱ - ${isoDay}`;
}

/**
 * Where the person stands in the first run: the two saved answers, when the steps were finished or skipped, and whether
 * they have a trade, a strategy and a plan of their own. Rows of the sample workspace are not their own: a person who
 * only has sample data still has everything left to do.
 */
export async function getFirstRunState(userId: string): Promise<FirstRunState> {
  const own = { userId, isSample: false };
  const [user, trade, strategy, plan] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { tradingPlatform: true, primaryGoal: true, onboardedAt: true, sampleLoadedAt: true } }),
    prisma.trade.findFirst({ where: own, select: { id: true } }),
    prisma.strategy.findFirst({ where: own, select: { id: true } }),
    prisma.tradePlan.findFirst({ where: own, select: { id: true } })
  ]);

  // The stored answers are free text columns: a value that is not one of the choices reads as "not answered".
  return normalizeFirstRunState({
    tradingPlatform: user?.tradingPlatform,
    primaryGoal: user?.primaryGoal,
    onboardedAt: user?.onboardedAt ? user.onboardedAt.toISOString() : null,
    hasTrades: Boolean(trade),
    hasStrategy: Boolean(strategy),
    hasPlan: Boolean(plan),
    hasSample: Boolean(user?.sampleLoadedAt)
  });
}

/**
 * Saves what the first-run screens send: only the fields present change. `done` sets `onboardedAt` once; a person who
 * is already done keeps the first date (the update only matches while it is still empty), so finishing twice, or two
 * tabs finishing at once, never moves it.
 */
export async function saveFirstRunState(userId: string, input: OnboardingStateInput, now = new Date()): Promise<FirstRunState> {
  const answers: { tradingPlatform?: TradingPlatform; primaryGoal?: PrimaryGoal } = {};
  if (input.tradingPlatform) answers.tradingPlatform = input.tradingPlatform;
  if (input.primaryGoal) answers.primaryGoal = input.primaryGoal;

  if (Object.keys(answers).length > 0) await prisma.user.update({ where: { id: userId }, data: answers });
  if (input.done) await prisma.user.updateMany({ where: { id: userId, onboardedAt: null }, data: { onboardedAt: now } });

  return getFirstRunState(userId);
}

export async function getOnboardingProfile(userId: string): Promise<PersistedOnboardingProfile | null> {
  const profile = await prisma.onboardingProfile.findUnique({ where: { userId } });
  return profile ? serializeProfile(profile) : null;
}

export async function saveOnboardingProfile(
  userId: string,
  input: OnboardingRawInput,
  now = new Date()
): Promise<PersistedOnboardingProfile> {
  const plan = buildOnboardingPlan(input);
  const startDate = now.toISOString().slice(0, 10);
  const sprint = buildDisciplineSprint(plan, startDate);
  const issue = plan.segment.split("-").slice(2).join("-");

  const profile = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        locale: plan.language,
        riskPerTradePct: plan.defaultRiskPercent,
        maxDailyLossPct: sprint.riskDefaults.maxDailyLossPct,
        maxWeeklyLossPct: sprint.riskDefaults.maxWeeklyLossPct
      }
    });

    await tx.riskProfile.upsert({
      where: { userId },
      update: {
        riskPerTradePct: plan.defaultRiskPercent,
        maxDailyRiskPct: sprint.riskDefaults.maxDailyLossPct,
        maxWeeklyRiskPct: sprint.riskDefaults.maxWeeklyLossPct,
        rules: buildRiskRules(sprint, issue) as Prisma.InputJsonValue
      },
      create: {
        userId,
        riskPerTradePct: plan.defaultRiskPercent,
        maxDailyRiskPct: sprint.riskDefaults.maxDailyLossPct,
        maxWeeklyRiskPct: sprint.riskDefaults.maxWeeklyLossPct,
        maxOpenRiskPct: 5,
        rules: buildRiskRules(sprint, issue) as Prisma.InputJsonValue
      }
    });

    const starterStrategy = await findOrCreateStarterStrategy(tx, userId, sprint);
    const firstReview = await findOrCreateFirstSprintReview(tx, userId, sprint, starterStrategy.id, plan.language);

    return tx.onboardingProfile.upsert({
      where: { userId },
      update: {
        experience: plan.experience,
        market: plan.market,
        disciplineIssue: issue,
        language: plan.language,
        segment: plan.segment,
        defaultRiskPercent: plan.defaultRiskPercent,
        focusAreas: plan.focusAreas,
        recommendedFeatures: plan.recommendedFeatures,
        startingChecklist: plan.startingChecklist,
        sprint: sprint as unknown as Prisma.InputJsonValue,
        starterStrategyId: starterStrategy.id,
        firstReviewId: firstReview.id,
        completedAt: now
      },
      create: {
        userId,
        experience: plan.experience,
        market: plan.market,
        disciplineIssue: issue,
        language: plan.language,
        segment: plan.segment,
        defaultRiskPercent: plan.defaultRiskPercent,
        focusAreas: plan.focusAreas,
        recommendedFeatures: plan.recommendedFeatures,
        startingChecklist: plan.startingChecklist,
        sprint: sprint as unknown as Prisma.InputJsonValue,
        starterStrategyId: starterStrategy.id,
        firstReviewId: firstReview.id,
        completedAt: now
      }
    });
  });

  return serializeProfile(profile);
}

async function findOrCreateStarterStrategy(tx: Prisma.TransactionClient, userId: string, sprint: DisciplineSprint) {
  const existing = await tx.strategy.findFirst({
    where: { userId, tags: { has: "onboarding-sprint" } },
    orderBy: { createdAt: "asc" }
  });

  if (existing) return existing;

  const playbook = sprint.starterPlaybook;
  return tx.strategy.create({
    data: {
      userId,
      name: playbook.name,
      description: playbook.description,
      entryRules: playbook.entryRules,
      exitRules: playbook.exitRules,
      invalidationRules: playbook.invalidationRules,
      riskRules: playbook.riskRules,
      allowedMarkets: playbook.allowedMarkets,
      timeframes: playbook.timeframes,
      allowedSessions: playbook.allowedSessions,
      checklist: playbook.checklist,
      commonMistakes: playbook.commonMistakes,
      idealMarketConditions: playbook.idealMarketConditions,
      tags: playbook.tags,
      status: "active",
      isActive: true
    }
  });
}

async function findOrCreateFirstSprintReview(
  tx: Prisma.TransactionClient,
  userId: string,
  sprint: DisciplineSprint,
  starterStrategyId: string,
  language: Language
) {
  const day = getUtcDayPeriod(new Date(`${sprint.startDate}T00:00:00.000Z`));
  const text = firstReviewCopy[language];
  const title = text.title(sprint.startDate);
  // The same day's review counts whichever language it was written in, so saving again in the other language adds none.
  // Persian reviews saved before dates went into the Persian calendar carry the ISO day, so that title counts too.
  const otherTitle = firstReviewCopy[language === "fa" ? "en" : "fa"].title(sprint.startDate);
  const titles = [...new Set([title, otherTitle, legacyPersianTitle(sprint.startDate)])];
  const existing = await tx.review.findFirst({
    where: { userId, type: "daily", title: { in: titles } }
  });

  if (existing) return existing;

  return tx.review.create({
    data: {
      userId,
      type: "daily",
      status: "open",
      periodStart: day.periodStart,
      periodEnd: day.periodEnd,
      title,
      checklist: [
        { key: "sprint_session_rule", label: text.sessionRule(sprint.sessionRule), completed: false },
        {
          key: "sprint_risk_default",
          label: text.riskDefault(localizeDigits(String(sprint.riskDefaults.riskPerTradePct), language)),
          completed: false
        },
        { key: "sprint_target_mistake", label: text.watchFor(sprint.targetMistake), completed: false },
        { key: "sprint_lesson", label: text.lesson, completed: false }
      ] as Prisma.InputJsonValue,
      metrics: {
        onboardingSprint: true,
        sprintDay: 1,
        targetScore: sprint.days[0]?.targetScore ?? 65
      },
      insights: [sprint.days[0]?.focus ?? text.startFocus],
      risks: [text.targetMistake(sprint.targetMistake)],
      lessons: [],
      nextActions: [sprint.sessionRule],
      linkedTradeIds: [],
      linkedStrategyIds: [starterStrategyId]
    }
  });
}

function buildRiskRules(sprint: DisciplineSprint, issue: string) {
  return {
    // Decided by the chosen issue, not by the wording of the sprint text, which follows the user's language.
    maxTradesPerDay: issue === "overtrading" ? 2 : 3,
    requireChecklistBeforeEntry: true,
    onboardingSprint: {
      targetMistake: sprint.targetMistake,
      sessionRule: sprint.sessionRule
    }
  };
}

function serializeProfile(profile: OnboardingProfileRecord): PersistedOnboardingProfile {
  return {
    id: profile.id,
    segment: profile.segment,
    experience: profile.experience,
    market: profile.market,
    disciplineIssue: profile.disciplineIssue,
    language: profile.language,
    defaultRiskPercent: Number(profile.defaultRiskPercent),
    focusAreas: profile.focusAreas,
    recommendedFeatures: profile.recommendedFeatures,
    startingChecklist: profile.startingChecklist,
    sprint: profile.sprint as unknown as DisciplineSprint,
    starterStrategyId: profile.starterStrategyId,
    firstReviewId: profile.firstReviewId,
    completedAt: profile.completedAt.toISOString()
  };
}
