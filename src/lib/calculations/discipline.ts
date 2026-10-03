import type { Locale } from "@/lib/i18n/locales";
import { formatGeneratedNumber } from "@/lib/services/locale";

export type DisciplineInput = {
  totalPlansThisWeek: number;
  completePlansThisWeek: number;
  totalTradesThisWeek: number;
  followedRulesCount: number;
  brokenRulesCount: number;
  /** Trades that followed some rules and broke others. */
  mixedRulesCount: number;
  /** Trades whose rule verdict is still "unknown" (not reviewed yet, e.g. imported). */
  unreviewedRulesCount: number;
  closedTradesTotal: number;
  closedTradesWithJournal: number;
  repeatedMistakeCount: number;
  overdueReviews: number;
};

export type DisciplineCheckKey =
  | "plan_adherence"
  | "rule_discipline"
  | "journal_completeness"
  | "mistake_control"
  | "review_consistency";

export type DisciplineCheck = {
  key: DisciplineCheckKey;
  score: number;
  passed: boolean;
  detail: string;
};

export type DisciplineGrade = "A" | "B" | "C" | "D" | "F";

export type DisciplineSummary = {
  score: number;
  grade: DisciplineGrade;
  checks: DisciplineCheck[];
};

/** The sentence of each check's detail, per language. Numbers arrive written in the digits of the language. */
const detailCopy = {
  en: {
    noPlans: "No plans this week.",
    plans: (complete: string, total: string) => `${complete} of ${total} plans fully complete.`,
    noRuleTrades: "No rule-tracked trades this week.",
    mixed: (count: string) => `, ${count} mixed`,
    notReviewed: (count: string) => `, ${count} not reviewed`,
    rules: (followed: string, broken: string, mixed: string, notReviewed: string) => `${followed} followed, ${broken} broken${mixed}${notReviewed} this week.`,
    noClosedTrades: "No closed trades to journal.",
    journaled: (journaled: string, total: string) => `${journaled} of ${total} closed trades have journal entries.`,
    noRepeats: "No repeated mistakes detected this week.",
    repeats: (count: string, plural: boolean) => `${count} recurring mistake${plural ? "s" : ""} in recent journal records.`,
    noOverdue: "No overdue reviews.",
    overdue: (count: string, plural: boolean) => `${count} overdue review${plural ? "s" : ""}.`
  },
  fa: {
    noPlans: "این هفته پلنی ثبت نشده است.",
    plans: (complete: string, total: string) => `${complete} از ${total} پلن کامل است.`,
    noRuleTrades: "این هفته معامله‌ای با ردیابی قانون ثبت نشده است.",
    mixed: (count: string) => `، ${count} ترکیبی`,
    notReviewed: (count: string) => `، ${count} مرورنشده`,
    rules: (followed: string, broken: string, mixed: string, notReviewed: string) => `${followed} رعایت‌شده، ${broken} نقض‌شده${mixed}${notReviewed} در این هفته.`,
    noClosedTrades: "معامله بسته‌شده‌ای برای ثبت در ژورنال نیست.",
    journaled: (journaled: string, total: string) => `${journaled} از ${total} معامله بسته‌شده یادداشت ژورنال دارد.`,
    noRepeats: "این هفته اشتباه تکراری دیده نشد.",
    repeats: (count: string, _plural: boolean) => `${count} اشتباه تکراری در رکوردهای اخیر ژورنال.`,
    noOverdue: "مرور عقب‌افتاده‌ای نیست.",
    overdue: (count: string, _plural: boolean) => `${count} مرور عقب‌افتاده.`
  }
} as const;

const WEIGHTS: Record<DisciplineCheckKey, number> = {
  rule_discipline: 30,
  plan_adherence: 25,
  journal_completeness: 20,
  mistake_control: 15,
  review_consistency: 10
};

/**
 * Whether there is anything to grade. Every check without evidence scores 100 (nothing broken, nothing overdue),
 * so a brand-new account would otherwise read as a comfortable B / 75. Discipline is judged on trades: a trade
 * opened this week or an earlier closed trade is required. Plans alone are not evidence of discipline.
 */
export function hasDisciplineData(input: DisciplineInput): boolean {
  return input.totalTradesThisWeek > 0 || input.closedTradesTotal > 0;
}

/** The weekly discipline score, or null while there is not enough data to grade (no default grade). */
export function calculateDisciplineScore(input: DisciplineInput, locale: Locale = "en"): DisciplineSummary | null {
  if (!hasDisciplineData(input)) return null;

  const checks: DisciplineCheck[] = [
    buildPlanAdherence(input, locale),
    buildRuleDiscipline(input, locale),
    buildJournalCompleteness(input, locale),
    buildMistakeControl(input, locale),
    buildReviewConsistency(input, locale)
  ];

  const score = Math.round(
    checks.reduce((sum, c) => sum + (c.score / 100) * WEIGHTS[c.key], 0)
  );

  return { score, grade: toGrade(score), checks };
}

function buildPlanAdherence(input: DisciplineInput, locale: Locale): DisciplineCheck {
  const c = detailCopy[locale];
  const num = (value: number) => formatGeneratedNumber(value, 0, locale);
  const score =
    input.totalPlansThisWeek === 0
      ? 0
      : Math.round((input.completePlansThisWeek / input.totalPlansThisWeek) * 100);
  return {
    key: "plan_adherence",
    score,
    passed: score >= 60,
    detail:
      input.totalPlansThisWeek === 0
        ? c.noPlans
        : c.plans(num(input.completePlansThisWeek), num(input.totalPlansThisWeek))
  };
}

/**
 * Share of this week's trades that followed the rules. Mixed and unreviewed trades count as not (fully)
 * following them: only a recorded "followed" verdict is evidence.
 */
function buildRuleDiscipline(input: DisciplineInput, locale: Locale): DisciplineCheck {
  const c = detailCopy[locale];
  const num = (value: number) => formatGeneratedNumber(value, 0, locale);
  const relevant = input.followedRulesCount + input.brokenRulesCount + input.mixedRulesCount + input.unreviewedRulesCount;
  const score = relevant === 0 ? 100 : Math.round((input.followedRulesCount / relevant) * 100);
  const mixed = input.mixedRulesCount ? c.mixed(num(input.mixedRulesCount)) : "";
  const unreviewed = input.unreviewedRulesCount ? c.notReviewed(num(input.unreviewedRulesCount)) : "";
  return {
    key: "rule_discipline",
    score,
    passed: score >= 75,
    detail:
      relevant === 0
        ? c.noRuleTrades
        : c.rules(num(input.followedRulesCount), num(input.brokenRulesCount), mixed, unreviewed)
  };
}

function buildJournalCompleteness(input: DisciplineInput, locale: Locale): DisciplineCheck {
  const c = detailCopy[locale];
  const num = (value: number) => formatGeneratedNumber(value, 0, locale);
  const score =
    input.closedTradesTotal === 0
      ? 100
      : Math.round((input.closedTradesWithJournal / input.closedTradesTotal) * 100);
  return {
    key: "journal_completeness",
    score,
    passed: score >= 80,
    detail:
      input.closedTradesTotal === 0
        ? c.noClosedTrades
        : c.journaled(num(input.closedTradesWithJournal), num(input.closedTradesTotal))
  };
}

function buildMistakeControl(input: DisciplineInput, locale: Locale): DisciplineCheck {
  const c = detailCopy[locale];
  const score = Math.max(0, 100 - input.repeatedMistakeCount * 20);
  return {
    key: "mistake_control",
    score,
    passed: input.repeatedMistakeCount === 0,
    detail:
      input.repeatedMistakeCount === 0
        ? c.noRepeats
        : c.repeats(formatGeneratedNumber(input.repeatedMistakeCount, 0, locale), input.repeatedMistakeCount > 1)
  };
}

function buildReviewConsistency(input: DisciplineInput, locale: Locale): DisciplineCheck {
  const c = detailCopy[locale];
  const score = input.overdueReviews === 0 ? 100 : Math.max(0, 100 - input.overdueReviews * 25);
  return {
    key: "review_consistency",
    score,
    passed: input.overdueReviews === 0,
    detail:
      input.overdueReviews === 0
        ? c.noOverdue
        : c.overdue(formatGeneratedNumber(input.overdueReviews, 0, locale), input.overdueReviews > 1)
  };
}

function toGrade(score: number): DisciplineGrade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "F";
}
