import { describe, expect, it } from "vitest";
import { sanitizeAiResponse } from "@/lib/ai/guard";
import { checkPropGuard, type PropGuardInput } from "@/lib/calculations/prop-guard";
import { calculateDisciplineScore, type DisciplineInput } from "@/lib/calculations/discipline";
import { buildMentorReport, MENTOR_REPORT_DISCLAIMER, MENTOR_REPORT_DISCLAIMER_FA } from "@/lib/calculations/mentor-report";

const PERSIAN_LETTER = /[؀-ۿ]/;

/** English words (three or more letters) left in Persian text; `allowed` are words the user typed. */
function englishLeft(lines: string[], allowed: string[] = []) {
  return lines
    .join(" ")
    .split(/[^A-Za-z]+/)
    .filter((word) => word.length >= 3 && !allowed.includes(word));
}

function educational(lines: string[]) {
  return sanitizeAiResponse({ disclaimer: "", mode: "learning", summary: "", observations: lines, risks: [], nextActions: [] });
}

const ALL_ALERTS: PropGuardInput = {
  maxDailyLossPct: 3,
  riskPerTradePct: 1,
  todayLossPct: 3.2,
  todayTradeCount: 4,
  maxDailyTrades: 3,
  recentResults: [true, false, false],
  todayUnplannedCount: 2
};

describe("prop-guard alerts in Persian", () => {
  it("writes every alert in Persian, with Persian digits, and keeps keys and severity", () => {
    const fa = checkPropGuard(ALL_ALERTS, "fa");
    const en = checkPropGuard(ALL_ALERTS);

    expect(fa.alerts.map(({ key, severity }) => ({ key, severity }))).toEqual(en.alerts.map(({ key, severity }) => ({ key, severity })));
    expect(fa.isBlocked).toBe(en.isBlocked);
    expect(fa.alerts.map((alert) => alert.message)).toEqual([
      "به سقف ضرر روزانه رسیده‌اید: ۳٫۲٪ از حداکثر ۳٫۰٪.",
      "امروز ۴ معامله ثبت شده است (سقف جلسه: ۳).",
      "دو ضرر پیاپی. پیش از ورود بعدی پلن را مرور کنید.",
      "۲ معامله امروز بدون پلن مکتوب یا پلی‌بوک ثبت شده است."
    ]);
  });

  it("writes the warning near the limit in Persian", () => {
    const [warning] = checkPropGuard({ ...ALL_ALERTS, todayLossPct: 2.1, todayTradeCount: 0, recentResults: [], todayUnplannedCount: 0 }, "fa").alerts;

    expect(warning.key).toBe("daily_loss_warning");
    expect(warning.message).toBe("به سقف ضرر روزانه نزدیک می‌شوید: ۲٫۱٪ از حداکثر ۳٫۰٪.");
  });

  it("stays educational", () => {
    const messages = checkPropGuard(ALL_ALERTS, "fa").alerts.map((alert) => alert.message);

    for (const message of messages) expect(message).toMatch(PERSIAN_LETTER);
    expect(englishLeft(messages)).toEqual([]);
    expect(educational(messages)).toEqual({ ok: true });
  });

  it("keeps the English alerts exactly as they were for en and when no locale is given", () => {
    const en = checkPropGuard(ALL_ALERTS, "en");

    expect(en).toEqual(checkPropGuard(ALL_ALERTS));
    expect(en.alerts.map((alert) => alert.message)).toEqual([
      "Daily loss limit reached: 3.2% of 3.0% max.",
      "4 trades today (session limit: 3).",
      "Two consecutive losses. Review the plan before the next entry.",
      "2 trades today without a written plan or playbook."
    ]);
    expect(checkPropGuard({ ...ALL_ALERTS, todayUnplannedCount: 1 }).alerts.at(-1)?.message).toBe("1 trade today without a written plan or playbook.");
  });
});

const BUSY_WEEK: DisciplineInput = {
  totalPlansThisWeek: 4,
  completePlansThisWeek: 3,
  totalTradesThisWeek: 9,
  followedRulesCount: 5,
  brokenRulesCount: 2,
  mixedRulesCount: 1,
  unreviewedRulesCount: 1,
  closedTradesTotal: 10,
  closedTradesWithJournal: 7,
  repeatedMistakeCount: 2,
  overdueReviews: 1
};

const EMPTY_WEEK: DisciplineInput = {
  totalPlansThisWeek: 0,
  completePlansThisWeek: 0,
  totalTradesThisWeek: 1,
  followedRulesCount: 0,
  brokenRulesCount: 0,
  mixedRulesCount: 0,
  unreviewedRulesCount: 0,
  closedTradesTotal: 0,
  closedTradesWithJournal: 0,
  repeatedMistakeCount: 0,
  overdueReviews: 0
};

function details(input: DisciplineInput, locale?: "en" | "fa") {
  const summary = calculateDisciplineScore(input, locale);
  if (!summary) throw new Error("expected a score");
  return Object.fromEntries(summary.checks.map((check) => [check.key, check.detail]));
}

describe("discipline check details in Persian", () => {
  it("writes each check's detail in Persian with Persian digits", () => {
    expect(details(BUSY_WEEK, "fa")).toEqual({
      plan_adherence: "۳ از ۴ پلن کامل است.",
      rule_discipline: "۵ رعایت‌شده، ۲ نقض‌شده، ۱ ترکیبی، ۱ مرورنشده در این هفته.",
      journal_completeness: "۷ از ۱۰ معامله بسته‌شده یادداشت ژورنال دارد.",
      mistake_control: "۲ اشتباه تکراری در رکوردهای اخیر ژورنال.",
      review_consistency: "۱ مرور عقب‌افتاده."
    });
  });

  it("writes the empty details in Persian", () => {
    expect(details(EMPTY_WEEK, "fa")).toEqual({
      plan_adherence: "این هفته پلنی ثبت نشده است.",
      rule_discipline: "این هفته معامله‌ای با ردیابی قانون ثبت نشده است.",
      journal_completeness: "معامله بسته‌شده‌ای برای ثبت در ژورنال نیست.",
      mistake_control: "این هفته اشتباه تکراری دیده نشد.",
      review_consistency: "مرور عقب‌افتاده‌ای نیست."
    });
  });

  it("keeps scores, grade and passes the same in both languages, and stays educational", () => {
    const fa = calculateDisciplineScore(BUSY_WEEK, "fa")!;
    const en = calculateDisciplineScore(BUSY_WEEK)!;

    expect({ score: fa.score, grade: fa.grade }).toEqual({ score: en.score, grade: en.grade });
    expect(fa.checks.map(({ key, score, passed }) => ({ key, score, passed }))).toEqual(en.checks.map(({ key, score, passed }) => ({ key, score, passed })));
    const lines = fa.checks.map((check) => check.detail);
    expect(englishLeft(lines)).toEqual([]);
    expect(educational(lines)).toEqual({ ok: true });
  });

  it("keeps the English details exactly as they were for en and when no locale is given", () => {
    expect(details(BUSY_WEEK, "en")).toEqual(details(BUSY_WEEK));
    expect(details(BUSY_WEEK)).toEqual({
      plan_adherence: "3 of 4 plans fully complete.",
      rule_discipline: "5 followed, 2 broken, 1 mixed, 1 not reviewed this week.",
      journal_completeness: "7 of 10 closed trades have journal entries.",
      mistake_control: "2 recurring mistakes in recent journal records.",
      review_consistency: "1 overdue review."
    });
    expect(details({ ...BUSY_WEEK, repeatedMistakeCount: 1, overdueReviews: 2 }).review_consistency).toBe("2 overdue reviews.");
  });
});

const MENTOR_INPUT = {
  period: "last 7 days",
  metrics: { totalTrades: 12, winRate: 0.5, avgRMultiple: 0.3, profitFactor: 1.4, netPnl: -152.5 },
  disciplineGrade: "B",
  topPlaybook: { name: "بریک‌اوت", adherenceRate: 0.75, avgRMultiple: 0.4 },
  topMistake: "جابه‌جایی حد ضرر"
};

describe("mentor report in Persian", () => {
  it("writes the headline, metrics, notes and improvement in Persian, keeping the user's own names", () => {
    const report = buildMentorReport(MENTOR_INPUT, { locale: "fa" });

    expect(report.headline).toBe("مرور فرایند برای last 7 days: ۱۲ معامله، نرخ برد ۵۰٫۰٪، میانگین ۰٫۳۰R.");
    expect(report.processMetrics).toEqual(["معاملات: ۱۲", "نرخ برد: ۵۰٫۰٪", "میانگین R: ۰٫۳۰", "ضریب سود: ۱٫۴۰"]);
    expect(report.pnl).toBe("سود و زیان خالص: ‎-۱۵۲٫۵۰");
    expect(report.playbookHighlight).toBe("بهترین پلی‌بوک «بریک‌اوت»: پایبندی به قوانین ۷۵٫۰٪، میانگین ۰٫۴۰R.");
    expect(report.disciplineNote).toBe("درجه انضباط: B.");
    expect(report.improvement).toBe("تمرکز بعدی: اشتباه تکراری «جابه‌جایی حد ضرر» را کم کنید.");
    expect(report.disclaimer).toBe(MENTOR_REPORT_DISCLAIMER_FA);
    expect(report.shareSafe).toBe(true);
  });

  it("writes the unknown values and the fallback improvement in Persian", () => {
    const report = buildMentorReport(
      { ...MENTOR_INPUT, metrics: { ...MENTOR_INPUT.metrics, profitFactor: Number.POSITIVE_INFINITY }, topPlaybook: { name: "الف", adherenceRate: null, avgRMultiple: null }, topMistake: null, disciplineGrade: null },
      { locale: "fa" }
    );

    expect(report.processMetrics[3]).toBe("ضریب سود: نامشخص");
    expect(report.playbookHighlight).toBe("بهترین پلی‌بوک «الف»: پایبندی به قوانین نامشخص، میانگین نامشخص.");
    expect(report.disciplineNote).toBeNull();
    expect(report.improvement).toBe("تمرکز بعدی: یک بهبود در چک‌لیست را برای هفته آینده انتخاب کنید.");
  });

  it("still hides the money figures in Persian", () => {
    const report = buildMentorReport(MENTOR_INPUT, { hidePnl: true, locale: "fa" });

    expect(report.pnl).toBeNull();
    expect(JSON.stringify(report)).not.toContain("۱۵۲");
    expect(JSON.stringify(report)).not.toContain("152");
  });

  it("stays share-safe and educational", () => {
    const { disclaimer, ...body } = buildMentorReport(MENTOR_INPUT, { locale: "fa" });
    const lines = [body.headline, ...body.processMetrics, body.pnl ?? "", body.playbookHighlight ?? "", body.disciplineNote ?? "", body.improvement];

    expect(disclaimer).toMatch(PERSIAN_LETTER);
    expect(englishLeft(lines, ["last", "days"])).toEqual([]);
    expect(educational(lines)).toEqual({ ok: true });
  });

  it("keeps the English report exactly as it was for en and when no locale is given", () => {
    const en = buildMentorReport(MENTOR_INPUT, { locale: "en" });

    expect(en).toEqual(buildMentorReport(MENTOR_INPUT));
    expect(en.headline).toBe("Process review for last 7 days: 12 trades, win rate 50.0%, average 0.30R.");
    expect(en.processMetrics).toEqual(["Trades: 12", "Win rate: 50.0%", "Average R: 0.30", "Profit factor: 1.40"]);
    expect(en.pnl).toBe("Net P&L: -152.50");
    expect(en.playbookHighlight).toBe('Top playbook "بریک‌اوت": rule adherence 75.0%, average 0.40R.');
    expect(en.disclaimer).toBe(MENTOR_REPORT_DISCLAIMER);
  });
});
