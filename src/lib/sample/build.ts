import { calculateJournalMetrics, deriveTradeOutcome, type MetricsTrade } from "@/lib/calculations/journal";
import { lossPerLot, SYMBOL_PRESETS, specFromPreset } from "@/lib/calculations/position-plan";
import type { Locale } from "@/lib/i18n/locales";
import { formatGeneratedNumber, localizeDigits } from "@/lib/services/locale";
import { reviewCopy } from "@/lib/services/review-copy";
import { sampleCopy, type SampleCopy } from "./copy";
import { atTime, isoDay, tradingDaysBefore, utcDay, utcWeek } from "./dates";
import { SAMPLE_BALANCE, SAMPLE_LIMITS, SAMPLE_TRADING_DAYS, TRADE_ROWS, type SampleStrategyKey, type TradeRow } from "./trade-table";
import type { SamplePlan, SampleReview, SampleRuleResult, SampleStrategy, SampleTrade, SampleWorkspace } from "./types";

const DAY = 24 * 60 * 60 * 1000;

const round = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** The sample month: about four weeks of forex and gold trading that ends on the last trading day before `now`. */
export function buildSampleWorkspace(now: Date, locale: Locale): SampleWorkspace {
  const copy = sampleCopy[locale];
  const days = tradingDaysBefore(now, SAMPLE_TRADING_DAYS);
  const strategies = (Object.keys(SAMPLE_LIMITS) as SampleStrategyKey[]).map((key) => buildStrategy(key, copy));
  const trades = TRADE_ROWS.map((row, index) => buildTrade(row, index, days[row.day], copy, locale));
  return {
    locale,
    strategies,
    trades,
    plans: buildPlans(now, copy),
    reviews: buildReviews(now, trades, copy, locale)
  };
}

function buildStrategy(key: SampleStrategyKey, copy: SampleCopy): SampleStrategy {
  const text = copy.strategies[key];
  return {
    key,
    name: `${text.name} ${copy.suffix}`,
    description: text.description,
    entryRules: text.entryRules,
    exitRules: text.exitRules,
    invalidationRules: text.invalidationRules,
    riskRules: text.riskRules,
    allowedMarkets: ["forex"],
    timeframes: key === "strategy-range" ? ["M15", "H1"] : ["H1", "M15"],
    allowedSessions: text.allowedSessions,
    checklist: text.checklist,
    commonMistakes: [copy.mistakes.late, copy.mistakes.stop, copy.mistakes.revenge],
    idealMarketConditions: text.idealMarketConditions,
    tags: text.tags,
    ...SAMPLE_LIMITS[key],
    status: "active",
    isActive: true
  };
}

const pick = <T>(items: readonly T[], index: number): T => items[index % items.length];

function buildTrade(row: TradeRow, index: number, dayMidnight: number, copy: SampleCopy, locale: Locale): SampleTrade {
  const preset = SYMBOL_PRESETS[row.symbol];
  const direction = row.side === "long" ? 1 : -1;
  // Work in whole ticks so the stop, the exit and the target sit exactly on the symbol's price grid.
  const toPrice = (ticks: number) => Number((ticks * preset.tickSize).toFixed(preset.digits));
  const entryTicks = Math.round(row.entry / preset.tickSize);
  const entryPrice = toPrice(entryTicks);
  const stopLoss = toPrice(entryTicks - direction * row.stopTicks);
  const exitPrice = toPrice(entryTicks + direction * Math.round(row.r * row.stopTicks));
  const takeProfit = toPrice(entryTicks + direction * 3 * row.stopTicks);

  // The lot size is what the strategy's risk limit allows for this stop, rounded down to 0.01 lot. The revenge trade
  // is the one that goes over it.
  const limit = SAMPLE_LIMITS[row.strategy].riskPerTradePct;
  const perLot = round(lossPerLot(entryPrice, stopLoss, specFromPreset(row.symbol, entryPrice)), 6);
  const allowed = Math.floor(((limit / 100) * SAMPLE_BALANCE) / perLot * 100 + 1e-9) / 100;
  const quantity = row.mistake === "revenge" ? round(allowed * 1.4, 2) : allowed;

  // Money and R come from the prices the way the journal derives them for any trade, never typed in.
  const outcome = deriveTradeOutcome({
    symbol: row.symbol,
    market: "forex",
    side: row.side,
    status: "closed",
    entryPrice,
    exitPrice,
    stopLoss,
    quantity,
    fees: 0
  });
  const riskAmount = round(outcome.riskAmount ?? 0, 2);
  const realizedPnl = round(outcome.realizedPnl ?? 0, 2);
  const rMultiple = round(outcome.rMultiple ?? 0, 4);
  const lossR = formatGeneratedNumber(Math.abs(rMultiple), 1, locale);
  const riskPercent = round((riskAmount / SAMPLE_BALANCE) * 100, 2);

  const win = row.r > 0;
  const ruleFollowed: SampleRuleResult = row.mistake === undefined ? "followed" : row.mistake === "late" ? "mixed" : "broken";
  const notes = copy.notes;
  const text = textFor(row, index, win, notes, lossR, locale, riskPercent);
  const emotion = emotionFor(row, index, win, copy);

  return {
    key: `trade-${String(index + 1).padStart(2, "0")}`,
    strategyKey: row.strategy,
    symbol: row.symbol,
    market: "forex",
    side: row.side,
    status: "closed",
    entryPrice,
    exitPrice,
    stopLoss,
    takeProfit,
    quantity,
    riskAmount,
    riskPercent,
    rMultiple,
    realizedPnl,
    fees: 0,
    session: Number(row.time.slice(0, 2)) < 12 ? copy.sessions.london : copy.sessions.newYork,
    setupType: copy.setups[row.strategy],
    confidenceScore: row.mistake === "late" ? 4 : row.mistake === "stop" ? 6 : row.mistake === "revenge" ? 3 : 5 + ((index * 7) % 4),
    outcome: row.mistake ? copy.outcomes[row.mistake] : win ? copy.outcomes.win : copy.outcomes.loss,
    ruleFollowed,
    mistakeKey: row.mistake ?? null,
    openedAt: atTime(dayMidnight, row.time),
    closedAt: atTime(dayMidnight, row.time, row.holdMinutes),
    preTradeNotes: text.pre,
    postTradeNotes: text.post,
    lessonsLearned: text.lesson,
    journal: {
      emotionalState: emotion,
      mistakes: row.mistake ? [copy.mistakes[row.mistake]] : [],
      tags: copy.strategies[row.strategy].tags,
      notes: row.mistake ? null : notes.clean,
      preTradeNotes: text.pre,
      postTradeNotes: text.post,
      lessonsLearned: text.lesson,
      ruleFollowed,
      review: text.review
    }
  };
}

function textFor(row: TradeRow, index: number, win: boolean, notes: SampleCopy["notes"], lossR: string, locale: Locale, riskPercent: number) {
  if (row.mistake === "late") return { ...notes.late, review: notes.late.review };
  if (row.mistake === "stop") return { pre: notes.stop.pre, post: notes.stop.post(lossR), lesson: notes.stop.lesson(lossR), review: notes.stop.review };
  if (row.mistake === "revenge") {
    const limit = localizeDigits(String(SAMPLE_LIMITS[row.strategy].riskPerTradePct), locale);
    return {
      pre: notes.revenge.pre,
      post: notes.revenge.post(lossR),
      lesson: notes.revenge.lesson,
      review: notes.revenge.review(formatGeneratedNumber(riskPercent, 1, locale), limit)
    };
  }
  const variants = notes.win[row.strategy];
  return win
    ? { pre: pick(variants.pre, index), post: pick(variants.post, index), lesson: pick(variants.lesson, index), review: null }
    : { pre: pick(variants.pre, index), post: pick(notes.loss.post, index), lesson: pick(notes.loss.lesson, index), review: null };
}

function emotionFor(row: TradeRow, index: number, win: boolean, copy: SampleCopy) {
  const emotions = copy.emotions;
  if (row.mistake === "late") return index % 4 === 1 ? emotions.impatient : emotions.anxious;
  if (row.mistake === "stop") return emotions.hopeful;
  if (row.mistake === "revenge") return emotions.frustrated;
  return win ? pick([emotions.calm, emotions.focused, emotions.confident], index) : pick([emotions.calm, emotions.focused], index);
}

function buildPlans(now: Date, copy: SampleCopy): SamplePlan[] {
  const complete: SamplePlan = {
    key: "plan-eurusd",
    strategyKey: "strategy-range",
    market: "forex",
    symbol: "EURUSD",
    bias: copy.plans.complete.bias,
    entryZone: "1.1315-1.1325",
    stopLoss: 1.1295,
    takeProfit: 1.1395,
    riskAmount: 100,
    riskPercent: 1,
    checklist: { newsChecked: true, riskCalculated: true, strategyMatched: true, direction: "long" },
    invalidationRule: copy.plans.complete.invalidationRule,
    relevantNews: null,
    notes: copy.plans.complete.notes,
    status: "planned",
    plannedFor: new Date(now.getTime())
  };
  const missing: SamplePlan = {
    key: "plan-xauusd",
    strategyKey: "strategy-gold",
    market: "forex",
    symbol: "XAUUSD",
    bias: copy.plans.missing.bias,
    entryZone: "4170.00-4174.00",
    stopLoss: 4164,
    takeProfit: 4196,
    riskAmount: 75,
    riskPercent: 0.75,
    checklist: { newsChecked: true, riskCalculated: true, strategyMatched: true, direction: "long" },
    // The one thing this plan lacks: the dashboard does not count it as ready until the rule is written.
    invalidationRule: null,
    relevantNews: null,
    notes: copy.plans.missing.notes,
    status: "planned",
    plannedFor: new Date(now.getTime())
  };
  return [complete, missing];
}

const toMetricsTrade = (trade: SampleTrade): MetricsTrade => ({
  market: trade.market,
  side: trade.side,
  entryPrice: trade.entryPrice,
  exitPrice: trade.exitPrice,
  stopLoss: trade.stopLoss,
  quantity: trade.quantity,
  fees: trade.fees,
  status: trade.status,
  symbol: trade.symbol,
  openedAt: trade.openedAt,
  riskAmount: trade.riskAmount,
  realizedPnl: trade.realizedPnl,
  rMultiple: trade.rMultiple
});

function topValues(values: string[], limit: number) {
  const counts = values.reduce<Map<string, number>>((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map());
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => value);
}

/** The numbers a review shows, in the shape the product's own generated reviews store them. */
function reviewMetrics(inPeriod: SampleTrade[], closedByEnd: number, plannedPlans: number) {
  const metrics = calculateJournalMetrics(inPeriod.map(toMetricsTrade));
  return {
    totalClosedTrades: closedByEnd,
    periodTrades: inPeriod.length,
    periodClosedTrades: inPeriod.length,
    openTrades: 0,
    plannedTrades: plannedPlans,
    winRate: round(metrics.winRate, 4),
    netPnl: round(metrics.netPnl, 2),
    averageR: round(metrics.averageR, 4),
    expectancy: round(metrics.expectancy, 2),
    maxDrawdownAmount: round(metrics.maxDrawdownAmount, 2),
    maxDrawdownR: round(metrics.maxDrawdownR, 4),
    maxDrawdownPct: null,
    ruleBreaks: inPeriod.filter((trade) => trade.ruleFollowed === "broken").length,
    mixedRules: inPeriod.filter((trade) => trade.ruleFollowed === "mixed").length,
    topMistakes: topValues(inPeriod.flatMap((trade) => trade.journal.mistakes), 5),
    topEmotions: topValues(inPeriod.map((trade) => trade.journal.emotionalState), 5),
    symbols: topValues(inPeriod.map((trade) => trade.symbol), 6),
    riskDefaults: { riskPerTradePct: 1, maxDailyLossPct: 3, maxWeeklyLossPct: 6 }
  };
}

const netR = (trades: SampleTrade[]) => round(trades.reduce((total, trade) => total + trade.rMultiple, 0), 1);
const unique = <T>(values: T[]) => [...new Set(values)];

function buildReviews(now: Date, trades: SampleTrade[], copy: SampleCopy, locale: Locale): SampleReview[] {
  const labels = reviewCopy[locale];
  const number: (value: number) => string = (value) => formatGeneratedNumber(value, 0, locale);
  const net = (value: number) => formatGeneratedNumber(value, 1, locale);

  // The weekly review is the last week that is over: the Monday-to-Sunday week before the one `now` is in.
  const week = utcWeek(new Date(now.getTime() - 7 * DAY));
  const inWeek = trades.filter((trade) => trade.openedAt >= week.start && trade.openedAt <= week.end);
  const weekWins = inWeek.filter((trade) => trade.realizedPnl > 0).length;
  const weekMistakes = unique(inWeek.flatMap((trade) => trade.journal.mistakes));
  const weekBreaks = inWeek.filter((trade) => trade.ruleFollowed !== "followed").length;
  const weeklyCopy = copy.reviews.weekly;
  const weekly: SampleReview = {
    key: "review-weekly",
    type: "weekly",
    status: "completed",
    periodStart: week.start,
    periodEnd: week.end,
    title: `${labels.title.week(labels.labels.weekly, isoDay(week.start), isoDay(week.end))} ${copy.suffix}`,
    checklist: labels.checklist.weekly.map((item) => {
      const note =
        item.key === "review_mistakes"
          ? weekMistakes.length > 0
            ? weeklyCopy.notes.mistakes(labels.list(weekMistakes))
            : weeklyCopy.notes.noMistakes
          : item.key === "choose_focus"
            ? weeklyCopy.notes.focus
            : item.key === "set_guardrail"
              ? weeklyCopy.notes.guardrail
              : undefined;
      return { ...item, completed: true, ...(note ? { note } : {}) };
    }),
    metrics: reviewMetrics(
      inWeek,
      trades.filter((trade) => trade.closedAt <= week.end).length,
      0
    ),
    insights: [
      weeklyCopy.summary(inWeek.length, weekWins, inWeek.length - weekWins, net(netR(inWeek)), number),
      weeklyCopy.rules(inWeek.length - weekBreaks, inWeek.length, number),
      weekMistakes.length > 0 ? weeklyCopy.mistakes(labels.list(weekMistakes)) : weeklyCopy.noMistakes
    ],
    risks: [weekBreaks > 0 ? weeklyCopy.ruleBreaks(weekBreaks, number) : weeklyCopy.noRuleBreaks],
    lessons: weeklyCopy.lessons,
    nextActions: weeklyCopy.nextActions,
    linkedTradeKeys: inWeek.map((trade) => trade.key),
    linkedStrategyKeys: unique(inWeek.map((trade) => trade.strategyKey)),
    completedAt: week.end
  };

  // The daily review is open, for today, and looks back at the last trading day in the journal.
  const today = utcDay(now);
  const lastDay = isoDay(trades[trades.length - 1].openedAt);
  const lastDayTrades = trades.filter((trade) => isoDay(trade.openedAt) === lastDay);
  const dayBreaks = lastDayTrades.filter((trade) => trade.ruleFollowed !== "followed").length;
  const dailyCopy = copy.reviews.daily;
  const daily: SampleReview = {
    key: "review-daily",
    type: "daily",
    status: "open",
    periodStart: today.start,
    periodEnd: today.end,
    title: `${labels.title.day(labels.labels.daily, isoDay(today.start))} ${copy.suffix}`,
    checklist: labels.checklist.daily.map((item) => ({ ...item, completed: false })),
    metrics: reviewMetrics(lastDayTrades, trades.length, 2),
    insights: [dailyCopy.summary(lastDayTrades.length, net(netR(lastDayTrades)), number)],
    risks: [dayBreaks > 0 ? dailyCopy.ruleBreaks(dayBreaks, number) : dailyCopy.noRuleBreaks],
    lessons: [],
    nextActions: dailyCopy.nextActions,
    linkedTradeKeys: lastDayTrades.map((trade) => trade.key),
    linkedStrategyKeys: unique(lastDayTrades.map((trade) => trade.strategyKey)),
    completedAt: null
  };

  return [weekly, daily];
}
