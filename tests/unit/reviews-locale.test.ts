import { beforeEach, describe, expect, it, vi } from "vitest";

const created: { data: Record<string, unknown> }[] = [];
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    review: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        created.push(args);
        return { id: "review_1", ...args.data };
      }),
      findFirst: vi.fn(async () => null)
    },
    trade: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    tradeJournalEntry: { findMany: vi.fn(async () => []) },
    strategy: { findMany: vi.fn(async () => []) },
    tradePlan: { count: vi.fn(async () => 0) },
    user: { findUnique: vi.fn(async () => null) }
  }
}));
vi.mock("@/lib/services/trades", () => ({
  getTradeMetrics: vi.fn(async () => ({
    totalTrades: 0, wins: 0, losses: 0, winRate: 0, grossProfit: 0, grossLoss: 0, netPnl: 0, averageR: 0, profitFactor: 0,
    expectancy: 0, maxDrawdownAmount: 0, maxDrawdownR: 0, maxDrawdownPct: null, equityCurve: [],
    setups: { count: 0, combined: 0, pendingLegs: 0, wins: 0, losses: 0, winRate: 0, averageR: 0, expectancy: 0 }
  }))
}));
vi.mock("@/lib/services/alerts", () => ({ createAlert: vi.fn(async (_userId: string, payload: { message: string }) => ({ id: "alert_1", condition: {}, ...payload })) }));
vi.mock("@/lib/services/notifications", () => ({ dispatch: vi.fn(async () => undefined) }));

import { sanitizeAiResponse } from "@/lib/ai/guard";
import { dispatch } from "@/lib/services/notifications";
import {
  buildCarryForwardReviewChecklist,
  buildCarryForwardReviewInsights,
  buildReviewInsights,
  buildReviewNextActions,
  buildReviewReminderPayload,
  buildReviewRisks,
  createCarryForwardDailyReview,
  generateDefaultReviewChecklist,
  generateReview,
  type ReviewTypeValue
} from "@/lib/services/reviews";

const TYPES: ReviewTypeValue[] = ["daily", "weekly", "mistake", "risk", "strategy"];
const PERSIAN_LETTER = /[؀-ۿ]/;

const context: Parameters<typeof buildReviewInsights>[1] = {
  metrics: {
    totalTrades: 8, wins: 4, losses: 4, winRate: 0.5, grossProfit: 900, grossLoss: 500, netPnl: 400, averageR: 0.45, profitFactor: 1.8,
    expectancy: 50, maxDrawdownAmount: 120, maxDrawdownR: 3.4, maxDrawdownPct: 0.123, equityCurve: [100, 80, 140],
    setups: { count: 8, combined: 0, pendingLegs: 0, wins: 4, losses: 4, winRate: 0.5, averageR: 0.45, expectancy: 50 }
  },
  tradeCount: 3,
  closedTradeCount: 2,
  openTradeCount: 1,
  plannedTradeCount: 2,
  ruleBreaks: 2,
  mixedRules: 1,
  topMistakes: ["ورود دیرهنگام", "حجم زیاد"],
  topEmotions: ["بی‌حوصله"],
  symbols: ["EURUSD"],
  linkedTradeIds: ["trade_1"],
  linkedStrategyIds: ["strategy_1"],
  activeStrategyNames: ["چک‌لیست سشن لندن"],
  riskDefaults: { riskPerTradePct: 1, maxDailyLossPct: 3, maxWeeklyLossPct: 6 }
};

/** English words (three or more letters) in generated Persian text. User-typed names are Persian in these fixtures. */
function englishLeft(lines: string[]) {
  return lines.join(" ").split(/[^A-Za-z]+/).filter((word) => word.length >= 3);
}

/** A generated Persian text must stay educational: no signal, advice or certainty wording. */
function educational(lines: string[]) {
  return sanitizeAiResponse({ disclaimer: "", mode: "learning", summary: "", observations: lines, risks: [], nextActions: [] });
}

describe("default review checklists in Persian", () => {
  it.each(TYPES)("%s: the same keys as English, every label in Persian", (type) => {
    const fa = generateDefaultReviewChecklist(type, "fa");
    const en = generateDefaultReviewChecklist(type);

    expect(fa.map((item) => item.key)).toEqual(en.map((item) => item.key));
    for (const item of fa) {
      expect(item.label).toMatch(PERSIAN_LETTER);
      expect(item.completed).toBe(false);
    }
    expect(englishLeft(fa.map((item) => item.label))).toEqual([]);
    expect(educational(fa.map((item) => item.label))).toEqual({ ok: true });
  });

  it("keeps the English labels unchanged for en and when no locale is given", () => {
    for (const type of TYPES) expect(generateDefaultReviewChecklist(type, "en")).toEqual(generateDefaultReviewChecklist(type));
    expect(generateDefaultReviewChecklist("daily")[0].label).toBe("Review today's planned scenarios and invalidation notes.");
  });
});

describe("generated review text in Persian", () => {
  it.each(TYPES)("%s: insights, risks and next actions are Persian, keep the user's own tags and stay educational", (type) => {
    const lines = [...buildReviewInsights(type, context, "fa"), ...buildReviewRisks(type, context, "fa"), ...buildReviewNextActions(type, context, "fa")];

    for (const line of lines) expect(line).toMatch(PERSIAN_LETTER);
    expect(englishLeft(lines)).toEqual([]);
    expect(educational(lines)).toEqual({ ok: true });
  });

  it("writes the numbers with Persian digits and the sentences the way a Persian trader would", () => {
    const insights = buildReviewInsights("weekly", context, "fa");
    expect(insights[0]).toBe("۳ رکورد ژورنال به این بازه مربوط است که ۲ رکورد بسته‌شده را شامل می‌شود.");
    expect(insights[1]).toBe("پرتکرارترین برچسب‌های اشتباه: ورود دیرهنگام، حجم زیاد.");
    expect(insights.join(" ")).toContain("۱ معامله باز");
    expect(insights.join(" ")).toContain("۲ سناریوی برنامه‌ریزی‌شده");

    const risks = buildReviewRisks("risk", context, "fa");
    expect(risks[0]).toContain("۲ رکورد");
    expect(risks.join(" ")).toContain("۱۲۰٫۰۰");
    expect(risks.join(" ")).toContain("۳٫۴R");
    expect(risks.join(" ")).toContain("۱۲٫۳٪");
    expect(risks.join(" ")).toContain("۳٪ ضرر روزانه");

    expect(buildReviewNextActions("risk", context, "fa")[0]).toBe("برای «ورود دیرهنگام» یک قانون پیشگیری بنویسید.");
  });

  it("says there is no data, and no risk exception, in Persian", () => {
    const empty = {
      ...context,
      tradeCount: 0,
      ruleBreaks: 0,
      mixedRules: 0,
      topMistakes: [],
      topEmotions: [],
      metrics: { ...context.metrics, totalTrades: 0, maxDrawdownAmount: 0, maxDrawdownR: 0 }
    };

    expect(buildReviewInsights("daily", empty, "fa")[0]).toContain("هنوز داده");
    expect(buildReviewRisks("daily", empty, "fa")).toEqual(["با رکوردهای موجود ژورنال، هیچ استثنای ریسکی دیده نشد."]);
  });

  it("keeps the English sentences unchanged for en and when no locale is given", () => {
    for (const type of TYPES) {
      expect(buildReviewInsights(type, context, "en")).toEqual(buildReviewInsights(type, context));
      expect(buildReviewRisks(type, context, "en")).toEqual(buildReviewRisks(type, context));
      expect(buildReviewNextActions(type, context, "en")).toEqual(buildReviewNextActions(type, context));
    }
    expect(buildReviewRisks("risk", context)[0]).toBe("2 records show broken rules. Review causes before adding new plans.");
  });
});

describe("review wording in Persian", () => {
  const checklists = TYPES.flatMap((type) => generateDefaultReviewChecklist(type, "fa").map((item) => item.label));
  const generated = TYPES.flatMap((type) => [
    ...buildReviewInsights(type, context, "fa"),
    ...buildReviewRisks(type, context, "fa"),
    ...buildReviewNextActions(type, context, "fa")
  ]);

  it("uses the app's own words: پلن for a plan, قانون محافظ for a guardrail, and no calques", () => {
    const text = [...checklists, ...generated].join("\n");

    expect(text).not.toMatch(/برنامه(?!‌ریزی)/);
    expect(text).not.toMatch(/حفاظ|خوشه‌های ضرر|تمرکز تمرینی/);
    expect(generateDefaultReviewChecklist("weekly", "fa").find((item) => item.key === "choose_focus")?.label).toBe("یک محور تمرین برای هفته بعد انتخاب کنید.");
    expect(generateDefaultReviewChecklist("weekly", "fa").find((item) => item.key === "set_guardrail")?.label).toBe(
      "یک قانون محافظ ریسک یا چک‌لیست برای هفته بعد تعیین کنید."
    );
    expect(generateDefaultReviewChecklist("risk", "fa").find((item) => item.key === "review_drawdown")?.label).toBe(
      "افت سرمایه و ضررهای پشت‌سرهم را بدون تغییر عجولانه قوانین مرور کنید."
    );
    expect(buildReviewNextActions("risk", context, "fa").join(" ")).toContain("قانون محافظ جلسه بعد را بنویسید");
  });

  it("calls a plan پلن in the no-data and rule-break sentences", () => {
    const noData = { ...context, tradeCount: 0, metrics: { ...context.metrics, totalTrades: 0 } };

    expect(buildReviewInsights("daily", noData, "fa")[0]).toBe("هنوز داده بسته‌شده‌ای در ژورنال نیست. با یک پلن مرورشده یا یک رکورد کامل ژورنال شروع کنید.");
    expect(buildReviewRisks("risk", context, "fa")[0]).toBe("۲ رکورد نقض قوانین را نشان می‌دهد. پیش از افزودن پلن‌های جدید، علت‌ها را مرور کنید.");
  });
});

describe("carry-forward review in Persian", () => {
  const source = {
    title: "مرور هفتگی - ۱۸ خرداد ۱۴۰۵ تا ۲۴ خرداد ۱۴۰۵",
    lessons: ["ورود دیرهنگام به محرک مکتوب نیاز دارد."],
    nextActions: ["پلن سشن لندن را پیش از ثبت رکورد مرور کنید."],
    risks: ["۲ رکورد نقض قوانین را نشان می‌دهد."]
  };

  it("writes the notes and insights in Persian and keeps the user's own words", () => {
    const checklist = buildCarryForwardReviewChecklist(source, "fa");
    expect(generateDefaultReviewChecklist("daily", "fa").map((item) => item.key)).toEqual(checklist.map((item) => item.key));
    expect(checklist.find((item) => item.key === "review_plans")?.note).toBe("انتقال به این مرور: پلن سشن لندن را پیش از ثبت رکورد مرور کنید.");
    expect(checklist.find((item) => item.key === "check_risk_limits")?.note).toMatch(/^یادداشت ریسک: /);
    expect(checklist.find((item) => item.key === "write_one_lesson")?.note).toMatch(/^درس قبلی: ورود دیرهنگام/);

    const insights = buildCarryForwardReviewInsights(source, "fa");
    expect(insights[0]).toBe(`مرور انتقالی از این مرور ساخته شد: ${source.title}.`);
    expect(insights.join(" ")).toContain("درس‌های منتقل‌شده");
    expect(insights.join(" ")).toContain("اقدامات منتقل‌شده");
  });

  it("keeps the English text for en", () => {
    expect(buildCarryForwardReviewChecklist(source, "en")).toEqual(buildCarryForwardReviewChecklist(source));
    expect(buildCarryForwardReviewInsights(source)[0]).toContain("Carry-forward review created from");
  });

  it("creates the next daily review with a Persian title and checklist", async () => {
    created.length = 0;
    await createCarryForwardDailyReview(
      "u1",
      {
        id: "r1", title: source.title, type: "weekly", periodEnd: new Date("2026-06-14T23:59:59.999Z"), lessons: source.lessons,
        nextActions: source.nextActions, risks: source.risks, linkedTradeIds: [], linkedStrategyIds: []
      },
      "fa"
    );

    const data = created[0].data;
    expect(data.title).toBe("مرور روزانه - ۲۵ خرداد ۱۴۰۵");
    expect((data.checklist as { label: string }[])[0].label).toMatch(PERSIAN_LETTER);
    expect((data.insights as string[])[0]).toContain("مرور انتقالی");
  });
});

describe("generated reviews in Persian", () => {
  beforeEach(() => {
    created.length = 0;
  });

  it("titles, checklists and empty-data text come out in Persian", async () => {
    await generateReview("u1", { type: "weekly", createReminder: false, periodStart: new Date("2026-06-08T00:00:00.000Z"), periodEnd: new Date("2026-06-14T23:59:59.999Z") }, "fa");
    await generateReview("u1", { type: "daily", createReminder: false, periodStart: new Date("2026-06-08T00:00:00.000Z"), periodEnd: new Date("2026-06-08T23:59:59.999Z") }, "fa");

    expect(created[0].data.title).toBe("مرور هفتگی - ۱۸ خرداد ۱۴۰۵ تا ۲۴ خرداد ۱۴۰۵");
    expect([created[0].data.title, created[1].data.title].join(" ")).not.toMatch(/[0-9-]{3,}/);
    expect(created[1].data.title).toBe("مرور روزانه - ۱۸ خرداد ۱۴۰۵");
    for (const { data } of created) {
      for (const item of data.checklist as { label: string }[]) expect(item.label).toMatch(PERSIAN_LETTER);
      for (const line of [...(data.insights as string[]), ...(data.risks as string[]), ...(data.nextActions as string[])]) expect(line).toMatch(PERSIAN_LETTER);
    }
  });

  it("keeps the English review exactly as before for en and when no locale is given", async () => {
    await generateReview("u1", { type: "weekly", createReminder: false, periodStart: new Date("2026-06-08T00:00:00.000Z"), periodEnd: new Date("2026-06-14T23:59:59.999Z") });
    await generateReview("u1", { type: "weekly", createReminder: false, periodStart: new Date("2026-06-08T00:00:00.000Z"), periodEnd: new Date("2026-06-14T23:59:59.999Z") }, "en");

    expect(created[0].data.title).toBe("Weekly review - 2026-06-08 to 2026-06-14");
    expect(created[1].data).toEqual(created[0].data);
    expect((created[0].data.insights as string[])[0]).toBe("No closed journal data yet. Start with one reviewed plan or one complete journal record.");
  });
});

describe("review reminders in Persian", () => {
  it("builds the reminder message in Persian and leaves the English one alone", () => {
    const review = { id: "review_1", type: "weekly" as const, title: "مرور هفتگی - ۱۸ خرداد ۱۴۰۵ تا ۲۴ خرداد ۱۴۰۵", periodEnd: new Date("2026-06-14T23:59:59.999Z") };

    expect(buildReviewReminderPayload(review, "fa").message).toBe(`${review.title} آماده مرور است.`);
    expect(buildReviewReminderPayload(review).message).toBe(`${review.title} is ready for review.`);
    expect(buildReviewReminderPayload(review, "en")).toEqual(buildReviewReminderPayload(review));
  });

  it("dispatches the notification body in Persian", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    vi.mocked(prisma.review.findFirst).mockResolvedValueOnce({
      id: "review_1", type: "daily", title: "مرور روزانه - ۱۸ خرداد ۱۴۰۵", periodStart: new Date("2026-06-08T00:00:00.000Z"), periodEnd: new Date("2026-06-08T23:59:59.999Z")
    } as never);
    const { createReviewReminder } = await import("@/lib/services/reviews");

    await createReviewReminder("u1", "review_1", "fa");

    expect(dispatch).toHaveBeenCalledWith(expect.anything(), { title: "مرور روزانه - ۱۸ خرداد ۱۴۰۵ آماده مرور است.", body: "بازه مرور: ۱۸ خرداد ۱۴۰۵" });
  });
});
