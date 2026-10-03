import { describe, expect, it } from "vitest";
import { buildSampleWorkspace, type SampleTrade, type SampleWorkspace } from "@/lib/sample";
import { SYMBOL_PRESETS, specFromPreset } from "@/lib/calculations/position-plan";
import { sampleMonth } from "@/features/landing/sample-month";
import { aiCertaintyForbiddenPatterns, productScopeForbiddenPatterns } from "@/lib/ai/guard";
import { sampleCopy } from "@/lib/sample/copy";
import { localizeDigits } from "@/lib/services/locale";

const NOW = new Date("2026-10-02T09:30:00.000Z"); // a Friday
const DAY = 24 * 60 * 60 * 1000;
const locales = ["en", "fa"] as const;

/** Every string in the workspace, for scans of the words it uses. */
function allText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allText);
  if (value && typeof value === "object" && !(value instanceof Date)) return Object.values(value).flatMap(allText);
  return [];
}

/** The strings a person reads on screen (names, rules, notes, titles), not the codes and keys behind them. */
function textFields(workspace: SampleWorkspace): string[] {
  return [
    ...workspace.strategies.flatMap((strategy) => [
      strategy.name,
      strategy.description,
      ...strategy.entryRules,
      ...strategy.exitRules,
      ...strategy.invalidationRules,
      ...strategy.riskRules,
      ...strategy.allowedSessions,
      ...strategy.checklist,
      ...strategy.commonMistakes,
      ...strategy.idealMarketConditions,
      ...strategy.tags
    ]),
    ...workspace.trades.flatMap((trade) => [
      trade.session,
      trade.setupType,
      trade.outcome,
      trade.preTradeNotes,
      trade.postTradeNotes,
      trade.lessonsLearned,
      trade.journal.emotionalState,
      ...trade.journal.mistakes,
      ...trade.journal.tags,
      trade.journal.notes ?? "",
      trade.journal.review ?? ""
    ]),
    ...workspace.plans.flatMap((plan) => [plan.bias, plan.notes ?? "", plan.invalidationRule ?? "", plan.relevantNews ?? ""]),
    ...workspace.reviews.flatMap((review) => [
      review.title,
      ...review.checklist.flatMap((item) => [item.label, item.note ?? ""]),
      ...review.insights,
      ...review.risks,
      ...review.lessons,
      ...review.nextActions
    ])
  ].filter(Boolean);
}

/** The workspace with every piece of text blanked: what is left must be the same in both languages. */
function shape(value: unknown): unknown {
  if (typeof value === "string") return "text";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shape(inner)]));
  return value;
}

/** What the prices alone say about a trade: R from the move over the stop distance, money from the symbol preset. */
function fromPrices(trade: SampleTrade) {
  const spec = specFromPreset(trade.symbol, trade.entryPrice);
  const direction = trade.side === "long" ? 1 : -1;
  const stopDistance = Math.abs(trade.entryPrice - trade.stopLoss);
  const priceR = ((trade.exitPrice - trade.entryPrice) * direction) / stopDistance;
  const risk = (stopDistance / spec.tickSize) * spec.tickValue * trade.quantity;
  return { priceR, risk, pnl: priceR * risk - trade.fees };
}

describe("the sample workspace is deterministic", () => {
  it.each(locales)("gives the same workspace for the same day and language (%s)", (locale) => {
    expect(buildSampleWorkspace(NOW, locale)).toEqual(buildSampleWorkspace(new Date(NOW.getTime()), locale));
  });

  it("does not read the clock: a different day moves the dates and nothing else", () => {
    const later = buildSampleWorkspace(new Date(NOW.getTime() + 7 * DAY), "en");
    const base = buildSampleWorkspace(NOW, "en");
    expect(later.trades.map((trade) => trade.rMultiple)).toEqual(base.trades.map((trade) => trade.rMultiple));
    expect(later.trades.map((trade) => trade.openedAt.getTime())).not.toEqual(base.trades.map((trade) => trade.openedAt.getTime()));
  });

  it("has the same shape in both languages: same prices, dates, counts and flags, different words", () => {
    const en = buildSampleWorkspace(NOW, "en");
    const fa = buildSampleWorkspace(NOW, "fa");
    expect(shape(fa)).toEqual(shape(en));
    expect(allText(fa)).not.toEqual(allText(en));
  });
});

describe("the strategies", () => {
  it.each(locales)("are one or two, with the numeric limits set and the sample label in the name (%s)", (locale) => {
    const { strategies } = buildSampleWorkspace(NOW, locale);
    expect(strategies.length).toBeGreaterThanOrEqual(1);
    expect(strategies.length).toBeLessThanOrEqual(2);
    for (const strategy of strategies) {
      expect(strategy.name.endsWith(locale === "fa" ? "(نمونه)" : "(sample)")).toBe(true);
      expect(strategy.riskPerTradePct).toBeGreaterThan(0);
      expect(strategy.maxDailyLossPct).toBeGreaterThanOrEqual(strategy.riskPerTradePct);
      expect(Number.isInteger(strategy.maxOpenPositions)).toBe(true);
      expect(strategy.maxOpenPositions).toBeGreaterThanOrEqual(1);
      expect(strategy.entryRules.length).toBeGreaterThan(0);
      expect(strategy.exitRules.length).toBeGreaterThan(0);
      expect(strategy.invalidationRules.length).toBeGreaterThan(0);
    }
  });

  it.each(locales)("write the same risk numbers in their rules as the limits they carry (%s)", (locale) => {
    for (const strategy of buildSampleWorkspace(NOW, locale).strategies) {
      const risk = localizeDigits(String(strategy.riskPerTradePct), locale);
      expect(strategy.riskRules[0], strategy.key).toContain(`${risk}${locale === "fa" ? "٪" : "%"}`);
      expect(strategy.checklist[strategy.checklist.length - 1], strategy.key).toContain(`${risk}${locale === "fa" ? "٪" : "%"}`);
    }
  });

  it("are the ones the trades point to, and every trade stays inside its strategy's risk limit unless it is the tagged revenge trade", () => {
    const { strategies, trades } = buildSampleWorkspace(NOW, "en");
    const byKey = new Map(strategies.map((strategy) => [strategy.key, strategy]));
    for (const trade of trades) {
      const strategy = byKey.get(trade.strategyKey);
      expect(strategy, trade.key).toBeDefined();
      const over = trade.riskPercent > (strategy?.riskPerTradePct ?? 0) + 1e-9;
      expect(over, `${trade.key} risks ${trade.riskPercent}%`).toBe(trade.mistakeKey === "revenge");
    }
  });
});

describe("the closed trades", () => {
  const { trades } = buildSampleWorkspace(NOW, "en");

  it("are about twenty-five to thirty, all closed, oldest first", () => {
    expect(trades.length).toBeGreaterThanOrEqual(25);
    expect(trades.length).toBeLessThanOrEqual(30);
    for (const trade of trades) expect(trade.status).toBe("closed");
    for (let index = 1; index < trades.length; index += 1) {
      expect(trades[index].openedAt.getTime()).toBeGreaterThan(trades[index - 1].closedAt.getTime());
    }
    for (const trade of trades) expect(trade.closedAt.getTime()).toBeGreaterThan(trade.openedAt.getTime());
  });

  it("are forex and gold with prices that agree with each other", () => {
    for (const trade of trades) {
      expect(Object.keys(SYMBOL_PRESETS)).toContain(trade.symbol);
      expect(trade.market).toBe("forex");
      const long = trade.side === "long";
      // The stop is on the losing side of the entry and the target on the winning side.
      expect(long ? trade.stopLoss < trade.entryPrice : trade.stopLoss > trade.entryPrice, trade.key).toBe(true);
      expect(long ? trade.takeProfit > trade.entryPrice : trade.takeProfit < trade.entryPrice, trade.key).toBe(true);
      // Prices sit on the symbol's tick grid.
      const { tickSize } = SYMBOL_PRESETS[trade.symbol];
      for (const price of [trade.entryPrice, trade.exitPrice, trade.stopLoss, trade.takeProfit]) {
        expect(Math.abs(price / tickSize - Math.round(price / tickSize)), `${trade.key} ${price}`).toBeLessThan(1e-6);
      }
    }
  });

  it("have R, risk and P&L that follow from their prices", () => {
    for (const trade of trades) {
      const expected = fromPrices(trade);
      expect(trade.rMultiple, trade.key).toBeCloseTo(expected.priceR, 3);
      expect(trade.riskAmount, trade.key).toBeCloseTo(expected.risk, 1);
      expect(trade.realizedPnl, trade.key).toBeCloseTo(expected.pnl, 1);
      // The risk percent is the risk over the sample account's balance.
      expect(trade.riskPercent, trade.key).toBeCloseTo((trade.riskAmount / 10_000) * 100, 1);
      // A loss and a win have the sign their prices give.
      expect(Math.sign(trade.realizedPnl)).toBe(Math.sign(expected.priceR));
    }
  });

  it("tell the landing page's month: the same results in R, in the same order", () => {
    expect(trades.map((trade) => Number(trade.rMultiple.toFixed(1)))).toEqual(sampleMonth.trades.map((trade) => trade.r));
    const net = trades.reduce((total, trade) => total + trade.rMultiple, 0);
    expect(net).toBeCloseTo(sampleMonth.stats.netR, 1);
  });

  it("carry the same R and P&L in both languages", () => {
    const fa = buildSampleWorkspace(NOW, "fa").trades;
    expect(fa.map((trade) => [trade.rMultiple, trade.realizedPnl, trade.riskAmount])).toEqual(trades.map((trade) => [trade.rMultiple, trade.realizedPnl, trade.riskAmount]));
  });
});

describe("the dates", () => {
  // Any day of the week can be "now": the month must always lie before it, on trading days, ending as late as it can.
  const sevenDays = Array.from({ length: 7 }, (_, offset) => new Date(NOW.getTime() + offset * DAY));

  it.each(sevenDays.map((now) => [now.toISOString().slice(0, 10), now] as const))("lie inside the month before %s, on weekdays", (_label, now) => {
    const { trades, plans, reviews } = buildSampleWorkspace(now, "en");
    const earliest = now.getTime() - 30 * DAY;
    for (const trade of trades) {
      for (const date of [trade.openedAt, trade.closedAt]) {
        expect(date.getTime()).toBeGreaterThanOrEqual(earliest);
        expect(date.getTime()).toBeLessThan(now.getTime());
        expect([1, 2, 3, 4, 5]).toContain(date.getUTCDay());
      }
      // A trade is opened and closed on the same day.
      expect(trade.closedAt.toISOString().slice(0, 10)).toBe(trade.openedAt.toISOString().slice(0, 10));
    }
    for (const review of reviews) {
      expect(review.periodStart.getTime()).toBeGreaterThanOrEqual(earliest);
      if (review.completedAt) expect(review.completedAt.getTime()).toBeLessThanOrEqual(now.getTime());
    }
    for (const plan of plans) expect(plan.plannedFor.getTime()).toBe(now.getTime());
  });

  it.each(sevenDays.map((now) => [now.toISOString().slice(0, 10), now] as const))("end on the last trading day before %s", (_label, now) => {
    const { trades } = buildSampleWorkspace(now, "en");
    const last = trades[trades.length - 1].openedAt;
    let expected = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAY;
    while ([0, 6].includes(new Date(expected).getUTCDay())) expected -= DAY;
    expect(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate())).toBe(expected);
  });

  it("span about four weeks", () => {
    const { trades } = buildSampleWorkspace(NOW, "en");
    const days = new Set(trades.map((trade) => trade.openedAt.toISOString().slice(0, 10)));
    expect(days.size).toBeGreaterThanOrEqual(18);
    const spanDays = (trades[trades.length - 1].openedAt.getTime() - trades[0].openedAt.getTime()) / DAY;
    expect(spanDays).toBeGreaterThan(20);
    expect(spanDays).toBeLessThan(29);
  });
});

describe("the journal entries", () => {
  it.each(locales)("give every trade an emotion, a rule verdict and a lesson (%s)", (locale) => {
    const { trades } = buildSampleWorkspace(NOW, locale);
    for (const trade of trades) {
      expect(trade.journal.emotionalState.length, trade.key).toBeGreaterThan(0);
      expect(trade.journal.lessonsLearned.length, trade.key).toBeGreaterThan(0);
      expect(trade.journal.preTradeNotes.length, trade.key).toBeGreaterThan(0);
      expect(trade.journal.postTradeNotes.length, trade.key).toBeGreaterThan(0);
      expect(trade.journal.ruleFollowed).toBe(trade.ruleFollowed);
      // A trade tagged with a mistake did not follow the rules cleanly; one without did.
      expect(trade.journal.mistakes.length > 0, trade.key).toBe(trade.ruleFollowed !== "followed");
    }
  });

  it("repeat a mistake early and fade it later", () => {
    const { trades } = buildSampleWorkspace(NOW, "en");
    const tagged = trades.map((trade) => trade.journal.mistakes.length > 0);
    const firstHalf = tagged.slice(0, trades.length / 2).filter(Boolean).length;
    const secondHalf = tagged.slice(trades.length / 2).filter(Boolean).length;
    expect(firstHalf).toBeGreaterThanOrEqual(4);
    expect(secondHalf).toBeLessThanOrEqual(1);
    expect(tagged.slice(-10).some(Boolean)).toBe(false);
    // One mistake is the one that repeats.
    const counts = new Map<string, number>();
    for (const trade of trades) for (const mistake of trade.journal.mistakes) counts.set(mistake, (counts.get(mistake) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeGreaterThanOrEqual(3);
    expect(counts.size).toBeGreaterThanOrEqual(2);
  });

  it("use the same mistake words in the journal and in the strategy's list of common mistakes", () => {
    for (const locale of locales) {
      const { trades, strategies } = buildSampleWorkspace(NOW, locale);
      const known = new Set(strategies.flatMap((strategy) => strategy.commonMistakes));
      for (const mistake of trades.flatMap((trade) => trade.journal.mistakes)) expect(known.has(mistake), mistake).toBe(true);
    }
  });
});

describe("the plans and the reviews", () => {
  /** What the dashboard calls a complete plan (src/lib/services/dashboard.ts). */
  const isComplete = (plan: SampleWorkspace["plans"][number]) =>
    Boolean(plan.invalidationRule?.trim()) &&
    (plan.riskAmount > 0 || plan.riskPercent > 0) &&
    Object.values(plan.checklist).length > 0 &&
    Object.values(plan.checklist).every(Boolean);

  it.each(locales)("are two open plans, one complete and one missing its invalidation rule (%s)", (locale) => {
    const { plans, strategies } = buildSampleWorkspace(NOW, locale);
    expect(plans).toHaveLength(2);
    for (const plan of plans) {
      expect(plan.status).toBe("planned");
      expect(strategies.map((strategy) => strategy.key)).toContain(plan.strategyKey);
    }
    expect(plans.filter(isComplete)).toHaveLength(1);
    const incomplete = plans.find((plan) => !isComplete(plan));
    expect(incomplete?.invalidationRule ?? null).toBeNull();
  });

  it("give each plan a stop and a target on the right sides of its entry zone", () => {
    for (const plan of buildSampleWorkspace(NOW, "en").plans) {
      const [low, high] = plan.entryZone.split("-").map(Number);
      expect(low).toBeLessThan(high);
      const long = plan.checklist.direction === "long";
      expect(long ? plan.stopLoss < low : plan.stopLoss > high).toBe(true);
      expect(long ? plan.takeProfit > high : plan.takeProfit < low).toBe(true);
    }
  });

  it("put each plan's zone where its symbol traded in the month, so the plan and the trades agree on the level", () => {
    const { plans, trades } = buildSampleWorkspace(NOW, "en");
    for (const plan of plans) {
      const prices = trades.filter((trade) => trade.symbol === plan.symbol).map((trade) => trade.entryPrice);
      expect(prices.length, plan.symbol).toBeGreaterThan(0);
      const [low, high] = plan.entryZone.split("-").map(Number);
      const middle = (low + high) / 2;
      expect(middle, plan.symbol).toBeGreaterThan(Math.min(...prices) * 0.99);
      expect(middle, plan.symbol).toBeLessThan(Math.max(...prices) * 1.01);
    }
  });

  it.each(locales)("are one completed weekly review and one open daily review (%s)", (locale) => {
    const { reviews, trades } = buildSampleWorkspace(NOW, locale);
    expect(reviews).toHaveLength(2);
    const weekly = reviews.find((review) => review.type === "weekly");
    const daily = reviews.find((review) => review.type === "daily");
    expect(weekly?.status).toBe("completed");
    expect(weekly?.completedAt).not.toBeNull();
    expect(weekly?.checklist.every((item) => item.completed)).toBe(true);
    expect(weekly?.lessons.length).toBeGreaterThan(0);
    expect(daily?.status).toBe("open");
    expect(daily?.completedAt).toBeNull();
    expect(daily?.checklist.some((item) => item.completed)).toBe(false);
    const known = new Set(trades.map((trade) => trade.key));
    for (const review of reviews) for (const key of review.linkedTradeKeys) expect(known.has(key)).toBe(true);
  });

  it("link the weekly review to the trades of its week and measure only those", () => {
    const { reviews, trades } = buildSampleWorkspace(NOW, "en");
    const weekly = reviews.find((review) => review.type === "weekly")!;
    const inWeek = trades.filter((trade) => trade.openedAt >= weekly.periodStart && trade.openedAt <= weekly.periodEnd);
    expect(inWeek.length).toBeGreaterThan(0);
    expect(weekly.linkedTradeKeys).toEqual(inWeek.map((trade) => trade.key));
    expect(weekly.metrics.periodClosedTrades).toBe(inWeek.length);
    expect(weekly.metrics.ruleBreaks).toBe(inWeek.filter((trade) => trade.ruleFollowed === "broken").length);
    // The week runs Monday to Sunday and is over.
    expect(weekly.periodStart.getUTCDay()).toBe(1);
    expect(weekly.periodEnd.getTime() - weekly.periodStart.getTime()).toBe(7 * DAY - 1);
  });

  it("count one trade as one trade in English", () => {
    const { weekly, daily } = sampleCopy.en.reviews;
    const n = (value: number) => String(value);
    expect(weekly.ruleBreaks(1, n)).toBe("1 trade broke or only partly followed the rules.");
    expect(weekly.ruleBreaks(2, n)).toBe("2 trades broke or only partly followed the rules.");
    expect(weekly.summary(1, 1, 0, "1.0", n)).toBe("1 trade closed this week: 1 win and 0 losses, 1.0R net.");
    expect(daily.summary(1, "-1.0", n)).toContain("1 trade,");
  });

  it("label the reviews as sample too", () => {
    const en = buildSampleWorkspace(NOW, "en").reviews.map((review) => review.title);
    const fa = buildSampleWorkspace(NOW, "fa").reviews.map((review) => review.title);
    for (const title of en) expect(title.endsWith("(sample)")).toBe(true);
    for (const title of fa) expect(title.endsWith("(نمونه)")).toBe(true);
  });
});

describe("the notes agree with the numbers", () => {
  const isoDay = (date: Date) => date.toISOString().slice(0, 10);
  const textOf = (trade: SampleTrade) => [trade.preTradeNotes, trade.postTradeNotes, trade.lessonsLearned, trade.journal.review ?? ""].join("\n");

  it.each(locales)("no note says a trade closed at the end of the session: none did, they close 25 to 190 minutes after entry (%s)", (locale) => {
    const { trades } = buildSampleWorkspace(NOW, locale);
    for (const trade of trades) {
      const minutes = (trade.closedAt.getTime() - trade.openedAt.getTime()) / 60_000;
      expect(minutes, trade.key).toBeLessThanOrEqual(190);
      expect(textOf(trade), trade.key).not.toMatch(locale === "en" ? /end of the session|on time/i : /آخر جلسه|پایان جلسه|سر وقت/);
    }
  });

  it("the range strategy's stop-for-the-day rule is per setup, and only the tagged revenge trade is taken after it says stop", () => {
    const { trades, strategies } = buildSampleWorkspace(NOW, "en");
    for (const trade of trades) {
      // The last two trades of the same strategy that were over when this one opened.
      const before = trades.filter((other) => other.strategyKey === trade.strategyKey && other.closedAt <= trade.openedAt).slice(-2);
      const twoLossesInARow = before.length === 2 && before.every((other) => other.realizedPnl < 0);
      const sameDay = before.length > 0 && isoDay(before[before.length - 1].closedAt) === isoDay(trade.openedAt);
      const againstTheRule = trade.strategyKey === "strategy-range" && twoLossesInARow && sameDay;
      expect(againstTheRule, trade.key).toBe(trade.mistakeKey === "revenge");
    }
    const range = strategies.find((strategy) => strategy.key === "strategy-range")!;
    expect(range.riskRules.some((rule) => /two losses in a row on this setup/.test(rule))).toBe(true);
    const fa = buildSampleWorkspace(NOW, "fa").strategies.find((strategy) => strategy.key === "strategy-range")!;
    expect(fa.riskRules.some((rule) => rule.includes("با این ستاپ"))).toBe(true);
  });

  it.each(locales)("a trade that lost more than its 1R says why (a moved stop, or a stop it let run past) (%s)", (locale) => {
    const { trades } = buildSampleWorkspace(NOW, locale);
    const bigger = trades.filter((trade) => trade.rMultiple < -1);
    expect(bigger.map((trade) => trade.mistakeKey).sort()).toEqual(["revenge", "stop"]);
    for (const trade of bigger) {
      const says =
        locale === "en"
          ? trade.mistakeKey === "stop"
            ? /moved it further away/
            : /let it run past the stop/
          : trade.mistakeKey === "stop"
            ? /دورتر بردم/
            : /از حد ضرر عبور کند/;
      expect(trade.postTradeNotes, trade.key).toMatch(says);
    }
  });
});

describe("the words", () => {
  it.each(locales)("do not read as advice, a signal or an order, and never say demo (%s)", (locale) => {
    const text = allText(buildSampleWorkspace(NOW, locale)).join("\n");
    for (const pattern of [...productScopeForbiddenPatterns, ...aiCertaintyForbiddenPatterns]) expect(pattern.test(text), pattern.source).toBe(false);
    expect(/\bdemo\b|دمو|نمایشی/i.test(text)).toBe(false);
    for (const word of [/\bbuy\b/i, /\bsell\b/i, /خرید|فروش/, /\bsignal/i]) expect(word.test(text), String(word)).toBe(false);
  });

  it("keep the English workspace English and the Persian workspace Persian", () => {
    for (const text of textFields(buildSampleWorkspace(NOW, "en"))) expect(/[؀-ۿ]/.test(text), text).toBe(false);
    // Only chart units (M15, H1, R) may stay in Latin letters on a Persian page.
    const leaks = textFields(buildSampleWorkspace(NOW, "fa")).filter((text) => /[A-Za-z]{2,}/.test(text));
    expect(leaks).toEqual([]);
  });

  it("write Persian with half-spaces where the language needs them", () => {
    const text = textFields(buildSampleWorkspace(NOW, "fa")).join("\n");
    // A verb prefix or a plural ending is joined with a half-space, never separated by a plain space.
    expect(text).not.toMatch(/(?:^|\s)(?:می|نمی) [ء-ی]/);
    expect(text).not.toMatch(/[ء-ی] (?:ها|های|هایی|ای|تر|ترین)(?![ء-ی])/);
    // And the half-space is really used.
    expect(text).toContain("‌");
  });

  it("write the Persian rules and next actions as the trader's own, not as orders to the reader", () => {
    const { strategies, reviews } = buildSampleWorkspace(NOW, "fa");
    const rules = [
      ...strategies.flatMap((strategy) => [...strategy.entryRules, ...strategy.exitRules, ...strategy.invalidationRules, ...strategy.riskRules]),
      ...reviews.flatMap((review) => [...review.nextActions, ...review.lessons])
    ].join("\n");
    expect(rules).not.toMatch(/(?:بنویسید|ببندید|بزنید|نبرید|بمانید|بگذارید|کنید|باشد)(?![ء-ی])/);
    expect(rules).toContain("می‌زنم");
  });

  it("say خطا for a mistake everywhere, never اشتباه, and keep the literal phrases out", () => {
    // The checklist labels of a review are the product's own review copy (review-copy.ts), not the sample's words.
    const workspace = buildSampleWorkspace(NOW, "fa");
    const own = textFields({
      ...workspace,
      reviews: workspace.reviews.map((review) => ({ ...review, checklist: review.checklist.map((item) => ({ ...item, label: "" })) }))
    });
    const text = own.join("\n");
    expect(text).not.toContain("اشتباه");
    expect(text).toContain("خطا");
    for (const phrase of ["پولبک نگه داشت", "بالا و پایین محدوده", "ورود دیر ", "محور هفته", "خطاهای علامت‌خورده", "خطای علامت‌خورده"]) {
      expect(text, phrase).not.toContain(phrase);
    }
    expect(text).toContain("ورود دیرهنگام");
  });

  it("use 'plan' as پلن and never برنامه for it", () => {
    const text = textFields(buildSampleWorkspace(NOW, "fa")).join("\n");
    expect(text).toContain("پلن");
    expect(text).not.toMatch(/برنامه(?!‌ریزی)/);
  });

  it("write Persian numbers in Persian digits", () => {
    const text = textFields(buildSampleWorkspace(NOW, "fa")).join("\n");
    expect(text).not.toMatch(/[0-9]/);
  });
});
