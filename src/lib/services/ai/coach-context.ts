import type { Locale } from "@/lib/i18n/locales";
import { formatGeneratedNumber, localizeDigits } from "@/lib/services/locale";
import { getActiveSession } from "@/lib/services/sessions";
import { getDisciplineOverview } from "@/lib/services/discipline";
import { getDisciplineStreak } from "@/lib/services/discipline-streak";
import { getReviewFocus } from "@/lib/services/reviews";
import { listTradePlans } from "@/lib/services/trade-plans";

/**
 * The Safe AI Coach uses the operator's SAVED context to ground a trade review in their own history:
 * discipline score, mistake memory, active-session rule (Phase Delta), plus the written plan for the
 * reviewed symbol, overdue reviews, and the discipline streak (coach-real-context). Read-only: it
 * never writes, never predicts markets, and never invents data (empty inputs produce no lines).
 */
export type CoachPlanContext = {
  symbol: string;
  bias: string | null;
  riskPercent: number | null;
  invalidationRule: string | null;
};

export type CoachContextInput = {
  disciplineGrade?: string | null;
  disciplineScore?: number | null;
  topMistake?: { mistake: string; frequency: number; streak: number } | null;
  sessionMistakeToAvoid?: string | null;
  /** The symbol under review (enables plan matching). */
  reviewedSymbol?: string | null;
  /** The written plan covering the reviewed symbol, if any. */
  planForSymbol?: CoachPlanContext | null;
  /** True when the user has at least one written plan (distinguishes "no plan for THIS symbol"). */
  hasAnyPlans?: boolean;
  overdueReviews?: number | null;
  streak?: { currentStreak: number; brokeStreakOnLastDay: boolean } | null;
};

/** The sentences of the saved-context lines. Names the user typed (mistakes, symbols, rules) stay as typed. */
const lineCopy = {
  en: {
    grade: (grade: string, score: string) => `Your current discipline grade is ${grade} (${score}/100).`,
    topMistake: (mistake: string, frequency: string, streak: string) =>
      `Your most frequent recent mistake is "${mistake}" (seen ${frequency}x, current streak ${streak}).`,
    topMistakeAction: (mistake: string) => `Check whether this trade repeated "${mistake}"; if so, write the prevention step.`,
    sessionAvoid: (mistake: string) => `Your active session set out to avoid: "${mistake}".`,
    sessionAvoidAction: (mistake: string) => `Confirm this trade respected your session rule: avoid "${mistake}".`,
    planBias: (bias: string) => `${bias} bias`,
    planRisk: (risk: string) => `risk ${risk}%`,
    planInvalidation: (rule: string) => `invalidation: "${rule}"`,
    plan: (symbol: string, parts: string[]) => `You have a written plan for ${symbol}${parts.length ? ` (${parts.join(", ")})` : ""}.`,
    planAction: "Compare this trade's entry, risk, and exit against the written plan; note any deviation.",
    noPlan: (symbol: string) => `No written plan covers ${symbol}.`,
    noPlanAction: (symbol: string) => `Write the plan (scenario, risk, invalidation) before the next ${symbol} trade.`,
    overdue: (count: number, shown: string) => `You have ${shown} overdue review${count === 1 ? "" : "s"}.`,
    overdueAction: "Close the overdue review loop before adding new trades.",
    streakBroken: "Your last active day broke your discipline streak.",
    streakBrokenAction: "Treat this review as the restart: name the rule that broke and its prevention step.",
    streak: (days: string) => `You are on a ${days}-day disciplined streak.`,
    streakAction: "Protect the streak: follow the written rules on this and the next trade."
  },
  fa: {
    grade: (grade: string, score: string) => `درجه انضباط فعلی شما ${grade} است (${score} از ۱۰۰).`,
    topMistake: (mistake: string, frequency: string, streak: string) =>
      `پرتکرارترین اشتباه اخیر شما «${mistake}» است (${frequency} بار دیده شده، ${streak} بار پشت‌سرهم).`,
    topMistakeAction: (mistake: string) => `بررسی کنید این معامله دوباره «${mistake}» را تکرار کرده است یا نه؛ اگر کرده، مرحله پیشگیری را بنویسید.`,
    sessionAvoid: (mistake: string) => `در جلسه فعال‌تان قرار گذاشته‌اید از این پرهیز کنید: «${mistake}».`,
    sessionAvoidAction: (mistake: string) => `تأیید کنید این معامله به قانون جلسه‌تان پایبند بود: پرهیز از «${mistake}».`,
    planBias: (bias: string) => `دیدگاه: ${bias}`,
    planRisk: (risk: string) => `ریسک ${risk}٪`,
    planInvalidation: (rule: string) => `ابطال: «${rule}»`,
    plan: (symbol: string, parts: string[]) => `برای ${symbol} یک پلن مکتوب دارید${parts.length ? ` (${parts.join("، ")})` : ""}.`,
    planAction: "ورود، ریسک و خروج این معامله را با پلن مکتوب مقایسه کنید و هر انحراف را یادداشت کنید.",
    noPlan: (symbol: string) => `هیچ پلن مکتوبی ${symbol} را پوشش نمی‌دهد.`,
    noPlanAction: (symbol: string) => `پیش از معامله بعدی ${symbol}، پلن (سناریو، ریسک، ابطال) را بنویسید.`,
    overdue: (_count: number, shown: string) => `${shown} مرور عقب‌افتاده دارید.`,
    overdueAction: "پیش از افزودن معامله‌های جدید، مرورهای عقب‌افتاده را ببندید.",
    streakBroken: "آخرین روز فعال شما زنجیره انضباط را شکست.",
    streakBrokenAction: "این مرور را شروع دوباره بدانید: قانونی را که شکست و مرحله پیشگیری از آن را بنویسید.",
    streak: (days: string) => `زنجیره انضباط شما ${days} روز است.`,
    streakAction: "زنجیره را حفظ کنید: در این معامله و معامله بعدی به قوانین مکتوب پایبند بمانید."
  }
} satisfies Record<Locale, unknown>;

/** Pure: reduce saved context to extra coach observation/next-action lines (no fabrication). */
export function coachContextLines(ctx: CoachContextInput, locale: Locale = "en"): { observations: string[]; nextActions: string[] } {
  const observations: string[] = [];
  const nextActions: string[] = [];
  const c = lineCopy[locale];
  const num = (value: number, fractionDigits = 0) => formatGeneratedNumber(value, fractionDigits, locale);

  if (ctx.disciplineGrade && typeof ctx.disciplineScore === "number") {
    observations.push(c.grade(ctx.disciplineGrade, num(ctx.disciplineScore)));
  }
  if (ctx.topMistake && ctx.topMistake.mistake) {
    const m = ctx.topMistake;
    observations.push(c.topMistake(m.mistake, num(m.frequency), num(m.streak)));
    nextActions.push(c.topMistakeAction(m.mistake));
  }
  if (ctx.sessionMistakeToAvoid) {
    observations.push(c.sessionAvoid(ctx.sessionMistakeToAvoid));
    nextActions.push(c.sessionAvoidAction(ctx.sessionMistakeToAvoid));
  }

  if (ctx.planForSymbol) {
    const p = ctx.planForSymbol;
    const parts = [
      p.bias ? c.planBias(p.bias) : null,
      p.riskPercent != null ? c.planRisk(localizeDigits(String(p.riskPercent), locale)) : null,
      p.invalidationRule ? c.planInvalidation(p.invalidationRule) : null
    ].filter((part): part is string => Boolean(part));
    observations.push(c.plan(p.symbol, parts));
    nextActions.push(c.planAction);
  } else if (ctx.reviewedSymbol && ctx.hasAnyPlans) {
    observations.push(c.noPlan(ctx.reviewedSymbol));
    nextActions.push(c.noPlanAction(ctx.reviewedSymbol));
  }

  if (typeof ctx.overdueReviews === "number" && ctx.overdueReviews > 0) {
    observations.push(c.overdue(ctx.overdueReviews, num(ctx.overdueReviews)));
    nextActions.push(c.overdueAction);
  }

  if (ctx.streak) {
    if (ctx.streak.brokeStreakOnLastDay) {
      observations.push(c.streakBroken);
      nextActions.push(c.streakBrokenAction);
    } else if (ctx.streak.currentStreak > 0) {
      observations.push(c.streak(num(ctx.streak.currentStreak)));
      nextActions.push(c.streakAction);
    }
  }

  return { observations, nextActions };
}

/** Await a read-only source, degrading to a fallback on ANY failure (a new source must never cost
 * the review the context it already had). */
async function safe<T>(read: () => Promise<T> | T, fallback: T): Promise<T> {
  try {
    const value = await read();
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

/** Fetch the user's saved context (read-only) and reduce it to coach lines. Best-effort: any
 * failure yields no extra lines and never breaks the review. */
export async function buildReviewContext(
  userId: string,
  symbol?: string | null,
  locale: Locale = "en"
): Promise<{ observations: string[]; nextActions: string[] }> {
  try {
    const [overview, session, plans, reviewFocus, streak] = await Promise.all([
      getDisciplineOverview(userId),
      getActiveSession(userId),
      safe(() => listTradePlans(userId), [] as Awaited<ReturnType<typeof listTradePlans>>),
      safe(() => getReviewFocus(userId), null),
      safe(() => getDisciplineStreak(userId), null)
    ]);
    const top = overview.mistakePatterns?.[0];

    const wanted = symbol?.trim().toUpperCase() || null;
    const planRows = Array.isArray(plans) ? plans : [];
    const match = wanted ? planRows.find((p) => (p.symbol ?? "").toUpperCase() === wanted) ?? null : null;

    return coachContextLines(
      {
        disciplineGrade: overview.disciplineScore?.grade ?? null,
        disciplineScore: overview.disciplineScore?.score ?? null,
        topMistake: top ? { mistake: top.mistake, frequency: top.frequency, streak: top.streak } : null,
        sessionMistakeToAvoid: session?.mistakeToAvoid ?? null,
        reviewedSymbol: wanted,
        hasAnyPlans: planRows.length > 0,
        planForSymbol: match
          ? {
              symbol: (match.symbol ?? wanted ?? "").toUpperCase(),
              bias: match.bias ?? null,
              riskPercent: match.riskPercent == null ? null : Number(match.riskPercent),
              invalidationRule: match.invalidationRule ?? null
            }
          : null,
        overdueReviews: reviewFocus?.overdueCount ?? null,
        streak: streak
          ? { currentStreak: streak.currentStreak, brokeStreakOnLastDay: streak.brokeStreakOnLastDay }
          : null
      },
      locale
    );
  } catch {
    return { observations: [], nextActions: [] };
  }
}
