import { Prisma } from "@prisma/client";
import { notFound } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import type { Locale } from "@/lib/i18n/locales";
import { sampleCopy } from "@/lib/sample/copy";
import { createAlert } from "@/lib/services/alerts";
import { formatGeneratedNumber, localizeDigits } from "@/lib/services/locale";
import { dispatch } from "@/lib/services/notifications";
import { reviewCopy } from "@/lib/services/review-copy";
import { getTradeMetrics } from "@/lib/services/trades";
import {
  reviewChecklistItemSchema,
  type reviewCreateSchema,
  type reviewGenerateSchema,
  type reviewUpdateSchema
} from "@/lib/validation/trading";
import type { z } from "zod";

export type ReviewTypeValue = "daily" | "weekly" | "mistake" | "risk" | "strategy";
export type ReviewStatusValue = "open" | "completed" | "skipped";
export type ReviewChecklistItem = z.infer<typeof reviewChecklistItemSchema>;

export type ReviewPeriod = {
  periodStart: Date;
  periodEnd: Date;
};

type ReviewSummaryContext = {
  metrics: Awaited<ReturnType<typeof getTradeMetrics>>;
  tradeCount: number;
  closedTradeCount: number;
  openTradeCount: number;
  plannedTradeCount: number;
  ruleBreaks: number;
  mixedRules: number;
  topMistakes: string[];
  topEmotions: string[];
  symbols: string[];
  linkedTradeIds: string[];
  linkedStrategyIds: string[];
  activeStrategyNames: string[];
  riskDefaults: {
    riskPerTradePct: number;
    maxDailyLossPct: number;
    maxWeeklyLossPct: number;
  };
};

type CarryForwardSourceReview = {
  id: string;
  title: string;
  type: ReviewTypeValue;
  periodEnd: Date;
  lessons: string[];
  nextActions: string[];
  risks: string[];
  linkedTradeIds: string[];
  linkedStrategyIds: string[];
  /** A review of the sample workspace; the review made from it is a sample review too. */
  isSample?: boolean;
};

/**
 * Whether the account holds the sample workspace. Sample and real trades never exist together, so while it is loaded
 * every number a generated review reads comes from sample trades: that review is a sample row (labelled, left out of the
 * export, removed with the sample) and never the person's own.
 */
async function sampleIsLoaded(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { sampleLoadedAt: true } });
  return Boolean(user?.sampleLoadedAt);
}

const withSampleLabel = (title: string, locale: Locale) => `${title} ${sampleCopy[locale].suffix}`;

export function getDefaultReviewPeriod(type: ReviewTypeValue, now = new Date()): ReviewPeriod {
  if (type === "weekly") {
    return getUtcWeekPeriod(now);
  }

  return getUtcDayPeriod(now);
}

export function getUtcDayPeriod(date: Date): ReviewPeriod {
  const periodStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { periodStart, periodEnd };
}

export function getUtcWeekPeriod(date: Date): ReviewPeriod {
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysSinceMonday));
  const periodEnd = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
  return { periodStart: monday, periodEnd };
}

export function generateDefaultReviewChecklist(type: ReviewTypeValue, locale: Locale = "en"): ReviewChecklistItem[] {
  return reviewCopy[locale].checklist[type].map((item) => ({ ...item, completed: false }));
}

export async function listReviews(
  userId: string,
  filters: {
    type?: ReviewTypeValue;
    status?: ReviewStatusValue;
  } = {}
) {
  return prisma.review.findMany({
    where: {
      userId,
      type: filters.type,
      status: filters.status
    },
    orderBy: [
      { status: "asc" },
      { periodStart: "desc" },
      { updatedAt: "desc" }
    ]
  });
}

export async function createReview(userId: string, input: z.infer<typeof reviewCreateSchema>, locale: Locale = "en") {
  const checklist = normalizeChecklist(input.checklist.length ? input.checklist : generateDefaultReviewChecklist(input.type, locale));

  return prisma.review.create({
    data: {
      userId,
      type: input.type,
      title: input.title,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      checklist: checklist as unknown as Prisma.InputJsonValue,
      metrics: input.metrics ? (input.metrics as Prisma.InputJsonValue) : undefined,
      insights: input.insights,
      risks: input.risks,
      lessons: input.lessons,
      nextActions: input.nextActions,
      linkedTradeIds: input.linkedTradeIds,
      linkedStrategyIds: input.linkedStrategyIds
    }
  });
}

export async function updateReview(userId: string, input: z.infer<typeof reviewUpdateSchema>, locale: Locale = "en") {
  const existing = await prisma.review.findFirst({ where: { id: input.id, userId } });
  if (!existing) {
    throw notFound("Review not found");
  }

  const status = input.status;
  const completedAt =
    status === "completed"
      ? input.completedAt ?? existing.completedAt ?? new Date()
      : status === "open"
        ? null
        : input.completedAt ?? existing.completedAt;

  const review = await prisma.review.update({
    where: { id: input.id },
    data: {
      status,
      checklist: input.checklist ? (normalizeChecklist(input.checklist) as unknown as Prisma.InputJsonValue) : undefined,
      lessons: input.lessons,
      nextActions: input.nextActions,
      completedAt
    }
  });

  const carryForwardReview =
    input.carryForward && status === "completed" ? await createCarryForwardDailyReview(userId, review, locale) : null;

  return { review, carryForwardReview };
}

export async function deleteReview(userId: string, id: string) {
  const existing = await prisma.review.findFirst({ where: { id, userId } });
  if (!existing) {
    throw notFound("Review not found");
  }

  await prisma.review.delete({ where: { id } });
  return { deleted: true };
}

export async function generateReview(userId: string, input: z.infer<typeof reviewGenerateSchema>, locale: Locale = "en") {
  const defaultPeriod = getDefaultReviewPeriod(input.type);
  const periodStart = input.periodStart ?? defaultPeriod.periodStart;
  const periodEnd = input.periodEnd ?? defaultPeriod.periodEnd;
  const sample = await sampleIsLoaded(userId);
  const context = await summarizeReviewContext(userId, periodStart, periodEnd);
  const checklist = generateDefaultReviewChecklist(input.type, locale);
  const builtTitle = buildReviewTitle(input.type, periodStart, periodEnd, locale);
  const title = sample ? withSampleLabel(builtTitle, locale) : builtTitle;

  const review = await prisma.review.create({
    data: {
      userId,
      isSample: sample,
      type: input.type,
      title,
      periodStart,
      periodEnd,
      checklist: checklist as unknown as Prisma.InputJsonValue,
      metrics: buildReviewMetrics(context) as Prisma.InputJsonValue,
      insights: buildReviewInsights(input.type, context, locale),
      risks: buildReviewRisks(input.type, context, locale),
      lessons: [],
      nextActions: buildReviewNextActions(input.type, context, locale),
      linkedTradeIds: context.linkedTradeIds,
      linkedStrategyIds: context.linkedStrategyIds
    }
  });

  // A sample review goes with the sample, and a reminder for it would be left pointing at nothing.
  const reminder = input.createReminder && !sample ? await createReviewReminder(userId, review.id, locale) : null;
  return { review, reminder };
}

export async function getReviewFocus(userId: string) {
  const now = new Date();
  const [review, overdueCount] = await Promise.all([
    prisma.review.findFirst({
      where: { userId, status: "open" },
      orderBy: [
        { periodEnd: "asc" },
        { createdAt: "desc" }
      ]
    }),
    prisma.review.count({
      where: {
        userId,
        status: "open",
        periodEnd: { lt: now }
      }
    })
  ]);

  return {
    review,
    overdueCount,
    suggestedType: "daily" as const
  };
}

export function buildReviewReminderPayload(
  review: {
    id: string;
    type: ReviewTypeValue;
    title: string;
    periodEnd: Date;
  },
  locale: Locale = "en"
) {
  const type: "daily_review" | "weekly_review" | "journal_reminder" =
    review.type === "daily" ? "daily_review" : review.type === "weekly" ? "weekly_review" : "journal_reminder";

  return {
    type,
    status: "active" as const,
    symbol: null,
    condition: {
      reviewId: review.id,
      reviewType: review.type,
      dueAt: review.periodEnd.toISOString()
    },
    message: reviewCopy[locale].reminder.message(review.title),
    channels: ["in_app" as const]
  };
}

export async function createReviewReminder(userId: string, reviewId: string, locale: Locale = "en") {
  const review = await prisma.review.findFirst({ where: { id: reviewId, userId } });
  if (!review) {
    throw notFound("Review not found");
  }

  const alert = await createAlert(userId, buildReviewReminderPayload(review, locale));
  await dispatch(
    { ...alert, condition: alert.condition as Record<string, unknown> },
    { title: alert.message, body: reviewCopy[locale].reminder.body(review.periodStart.toISOString().slice(0, 10)) }
  );
  return alert;
}

export async function summarizeReviewContext(userId: string, periodStart: Date, periodEnd: Date): Promise<ReviewSummaryContext> {
  const [metrics, trades, journalEntries, strategies, user, openTradeCount, plannedTradeCount] = await Promise.all([
    getTradeMetrics(userId),
    prisma.trade.findMany({
      where: {
        userId,
        openedAt: {
          gte: periodStart,
          lte: periodEnd
        }
      },
      include: {
        journalEntry: true,
        strategy: true
      },
      orderBy: { openedAt: "desc" },
      take: 50
    }),
    prisma.tradeJournalEntry.findMany({
      where: {
        userId,
        updatedAt: {
          gte: periodStart,
          lte: periodEnd
        }
      },
      include: { trade: true },
      take: 50
    }),
    prisma.strategy.findMany({
      where: { userId, isActive: true },
      orderBy: { updatedAt: "desc" },
      take: 10
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        riskPerTradePct: true,
        maxDailyLossPct: true,
        maxWeeklyLossPct: true
      }
    }),
    prisma.trade.count({ where: { userId, status: "open" } }),
    prisma.tradePlan.count({ where: { userId, status: { in: ["planned", "active"] } } })
  ]);

  const mistakeTags = [
    ...journalEntries.flatMap((entry) => entry.mistakes),
    ...trades.flatMap((trade) => trade.journalEntry?.mistakes ?? [])
  ];
  const emotionTags = [
    ...journalEntries.map((entry) => entry.emotionalState).filter(Boolean),
    ...trades.map((trade) => trade.journalEntry?.emotionalState).filter(Boolean)
  ] as string[];
  const linkedStrategyIds = uniqueStrings(trades.map((trade) => trade.strategyId).filter(Boolean) as string[]);

  return {
    metrics,
    tradeCount: trades.length,
    closedTradeCount: trades.filter((trade) => trade.status === "closed").length,
    openTradeCount,
    plannedTradeCount,
    ruleBreaks: countRuleStatus(journalEntries, "broken") + trades.filter((trade) => trade.ruleFollowed === "broken").length,
    mixedRules: countRuleStatus(journalEntries, "mixed") + trades.filter((trade) => trade.ruleFollowed === "mixed").length,
    topMistakes: topValues(mistakeTags, 5),
    topEmotions: topValues(emotionTags, 5),
    symbols: topValues(trades.map((trade) => trade.symbol), 6),
    linkedTradeIds: uniqueStrings(trades.map((trade) => trade.id)).slice(0, 20),
    linkedStrategyIds,
    activeStrategyNames: strategies.map((strategy) => strategy.name).slice(0, 5),
    riskDefaults: {
      riskPerTradePct: Number(user?.riskPerTradePct ?? 1),
      maxDailyLossPct: Number(user?.maxDailyLossPct ?? 3),
      maxWeeklyLossPct: Number(user?.maxWeeklyLossPct ?? 6)
    }
  };
}

export function buildReviewMetrics(context: ReviewSummaryContext) {
  return {
    totalClosedTrades: context.metrics.totalTrades,
    periodTrades: context.tradeCount,
    periodClosedTrades: context.closedTradeCount,
    openTrades: context.openTradeCount,
    plannedTrades: context.plannedTradeCount,
    winRate: context.metrics.winRate,
    netPnl: context.metrics.netPnl,
    averageR: context.metrics.averageR,
    expectancy: context.metrics.expectancy,
    maxDrawdownAmount: context.metrics.maxDrawdownAmount,
    maxDrawdownR: context.metrics.maxDrawdownR,
    maxDrawdownPct: context.metrics.maxDrawdownPct ?? null,
    ruleBreaks: context.ruleBreaks,
    mixedRules: context.mixedRules,
    topMistakes: context.topMistakes,
    topEmotions: context.topEmotions,
    symbols: context.symbols,
    riskDefaults: context.riskDefaults
  };
}

export function buildReviewInsights(type: ReviewTypeValue, context: ReviewSummaryContext, locale: Locale = "en") {
  const c = reviewCopy[locale];
  const count = (value: number) => formatGeneratedNumber(value, 0, locale);
  const insights: string[] = [];

  if (context.tradeCount === 0 && context.metrics.totalTrades === 0) {
    insights.push(c.insights.noData);
  } else if (context.tradeCount === 0) {
    insights.push(c.insights.noUpdates);
  } else {
    insights.push(c.insights.linked(count(context.tradeCount), count(context.closedTradeCount)));
  }

  if (context.topMistakes.length > 0) {
    insights.push(c.insights.mistakes(c.list(context.topMistakes)));
  }

  if (context.topEmotions.length > 0) {
    insights.push(c.insights.emotions(c.list(context.topEmotions)));
  }

  if (type === "strategy" && context.activeStrategyNames.length > 0) {
    insights.push(c.insights.strategies(c.list(context.activeStrategyNames)));
  }

  if (type === "weekly") {
    insights.push(c.insights.weekly(count(context.openTradeCount), count(context.plannedTradeCount)));
  }

  return insights;
}

export function buildReviewRisks(type: ReviewTypeValue, context: ReviewSummaryContext, locale: Locale = "en") {
  const c = reviewCopy[locale];
  const num = (value: number, fractionDigits: number) => formatGeneratedNumber(value, fractionDigits, locale);
  const risks: string[] = [];

  if (context.ruleBreaks > 0) {
    risks.push(c.risks.ruleBreaks(num(context.ruleBreaks, 0)));
  }

  if (context.mixedRules > 0) {
    risks.push(c.risks.mixedRules(num(context.mixedRules, 0)));
  }

  if (context.metrics.maxDrawdownAmount > 0) {
    const pct = typeof context.metrics.maxDrawdownPct === "number" ? num(context.metrics.maxDrawdownPct * 100, 1) : null;
    risks.push(c.risks.drawdownMoney(num(context.metrics.maxDrawdownAmount, 2), num(context.metrics.maxDrawdownR, 1), pct));
  } else if (context.metrics.maxDrawdownR > 0) {
    // Lot-based trades without a known risk or P&L have an R but no money values.
    risks.push(c.risks.drawdownR(num(context.metrics.maxDrawdownR, 1)));
  }

  if (type === "risk") {
    const defaults = context.riskDefaults;
    risks.push(
      c.risks.defaults(
        localizeDigits(String(defaults.riskPerTradePct), locale),
        localizeDigits(String(defaults.maxDailyLossPct), locale),
        localizeDigits(String(defaults.maxWeeklyLossPct), locale)
      )
    );
  }

  if (risks.length === 0) {
    risks.push(c.risks.none);
  }

  return risks;
}

export function buildReviewNextActions(type: ReviewTypeValue, context: ReviewSummaryContext, locale: Locale = "en") {
  const c = reviewCopy[locale];
  const actions: string[] = [];

  if (context.topMistakes[0]) {
    actions.push(c.nextActions.prevention(context.topMistakes[0]));
  }

  if (context.ruleBreaks > 0 || type === "risk") {
    actions.push(c.nextActions.guardrail);
  }

  if (type === "strategy") {
    actions.push(c.nextActions.strategy);
  } else if (type === "weekly") {
    actions.push(c.nextActions.weekly);
  } else {
    actions.push(c.nextActions.lesson);
  }

  return uniqueStrings(actions).slice(0, 4);
}

export function buildCarryForwardReviewChecklist(
  source: Pick<CarryForwardSourceReview, "lessons" | "nextActions" | "risks">,
  locale: Locale = "en"
) {
  const c = reviewCopy[locale].carry;
  const lessons = source.lessons.map((lesson) => lesson.trim()).filter(Boolean);
  const nextActions = source.nextActions.map((action) => action.trim()).filter(Boolean);
  const risks = source.risks.map((risk) => risk.trim()).filter(Boolean);

  return generateDefaultReviewChecklist("daily", locale).map((item) => {
    if (item.key === "review_plans" && nextActions.length > 0) {
      return { ...item, note: compactNote(c.carryForward, nextActions) };
    }

    if (item.key === "check_risk_limits" && risks.length > 0) {
      return { ...item, note: compactNote(c.riskNote, risks.slice(0, 2)) };
    }

    if (item.key === "write_one_lesson" && lessons.length > 0) {
      return { ...item, note: compactNote(c.priorLesson, lessons.slice(0, 2)) };
    }

    return item;
  });
}

export function buildCarryForwardReviewInsights(
  source: Pick<CarryForwardSourceReview, "title" | "lessons" | "nextActions">,
  locale: Locale = "en"
) {
  const c = reviewCopy[locale].carry;
  const insights = [c.created(source.title)];

  if (source.lessons.length > 0) {
    insights.push(c.lessons(source.lessons.slice(0, 3).join(" | ")));
  }

  if (source.nextActions.length > 0) {
    insights.push(c.nextActions(source.nextActions.slice(0, 3).join(" | ")));
  }

  return insights.map((insight) => trimText(insight, 500));
}

export function getCarryForwardPeriod(sourcePeriodEnd: Date): ReviewPeriod {
  const nextDay = new Date(sourcePeriodEnd.getTime() + 1);
  return getUtcDayPeriod(nextDay);
}

export async function createCarryForwardDailyReview(userId: string, source: CarryForwardSourceReview, locale: Locale = "en") {
  const hasOutput = source.lessons.some((lesson) => lesson.trim()) || source.nextActions.some((action) => action.trim()) || source.risks.some((risk) => risk.trim());
  if (!hasOutput) {
    return null;
  }

  const { periodStart, periodEnd } = getCarryForwardPeriod(source.periodEnd);
  // The follow-up of a sample review is a sample review, and is only ever matched with one (never with the person's own).
  const isSample = source.isSample === true;
  const existing = await prisma.review.findFirst({
    where: {
      userId,
      isSample,
      type: "daily",
      status: "open",
      periodStart,
      periodEnd
    }
  });

  if (existing) {
    return existing;
  }

  const checklist = buildCarryForwardReviewChecklist(source, locale);

  return prisma.review.create({
    data: {
      userId,
      isSample,
      type: "daily",
      status: "open",
      periodStart,
      periodEnd,
      title: isSample
        ? withSampleLabel(buildReviewTitle("daily", periodStart, periodEnd, locale), locale)
        : buildReviewTitle("daily", periodStart, periodEnd, locale),
      checklist: checklist as unknown as Prisma.InputJsonValue,
      metrics: {
        carriedFromReviewId: source.id,
        carriedFromReviewType: source.type,
        carriedLessonCount: source.lessons.length,
        carriedNextActionCount: source.nextActions.length
      },
      insights: buildCarryForwardReviewInsights(source, locale),
      risks: source.risks.slice(0, 4),
      lessons: [],
      nextActions: source.nextActions.slice(0, 4),
      linkedTradeIds: source.linkedTradeIds,
      linkedStrategyIds: source.linkedStrategyIds
    }
  });
}

function normalizeChecklist(items: ReviewChecklistItem[]) {
  return items.map((item) => reviewChecklistItemSchema.parse(item));
}

function buildReviewTitle(type: ReviewTypeValue, periodStart: Date, periodEnd: Date, locale: Locale = "en") {
  const copy = reviewCopy[locale];
  const label = copy.labels[type];
  if (type === "weekly") {
    return copy.title.week(label, formatDate(periodStart), formatDate(periodEnd));
  }
  return copy.title.day(label, formatDate(periodStart));
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function topValues(values: string[], limit: number) {
  const counts = values
    .map((value) => value.trim())
    .filter(Boolean)
    .reduce<Map<string, number>>((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map());

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => value);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function countRuleStatus(entries: { ruleFollowed: string }[], status: string) {
  return entries.filter((entry) => entry.ruleFollowed === status).length;
}

function compactNote(prefix: string, values: string[]) {
  return trimText(`${prefix}: ${values.join(" | ")}`, 1000);
}

function trimText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}
