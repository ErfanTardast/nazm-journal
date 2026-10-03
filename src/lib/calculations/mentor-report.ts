/**
 * Phase Epsilon — share-safe mentor report. Pure: turns already-aggregated stats into a
 * process-focused review a trader can share with a mentor or in a build log. It is deliberately
 * **not** a signal, a position, or anything copy/social-trading: no buy/sell calls, no entries to
 * mirror. P&L can be hidden (`hidePnl`) to share process metrics (R, win rate, adherence) without
 * exposing money figures. The sentences are written in the asked language (English or Persian).
 */
import type { Locale } from "@/lib/i18n/locales";
import { formatGeneratedNumber } from "@/lib/services/locale";

export const MENTOR_REPORT_DISCLAIMER =
  "Shared for process review and mentoring only. Not financial advice, not a trade signal, and not for copy or social trading.";

export const MENTOR_REPORT_DISCLAIMER_FA =
  "این گزارش فقط برای مرور فرایند و منتورینگ به اشتراک گذاشته شده است. توصیه مالی یا سیگنال معاملاتی نیست و برای کپی‌تریدینگ یا معامله اجتماعی نیست.";

export type MentorReportInput = {
  period: string;
  metrics: { totalTrades: number; winRate: number; avgRMultiple: number; profitFactor: number; netPnl: number };
  disciplineGrade?: string | null;
  topPlaybook?: { name: string; adherenceRate: number | null; avgRMultiple: number | null } | null;
  topMistake?: string | null;
};

export type MentorReportOptions = { hidePnl?: boolean; locale?: Locale };

export type MentorReport = {
  period: string;
  shareSafe: true;
  pnlHidden: boolean;
  headline: string;
  processMetrics: string[];
  pnl: string | null; // null when hidden
  playbookHighlight: string | null;
  disciplineNote: string | null;
  improvement: string;
  disclaimer: string;
};

/** The report sentences, per language. Numbers arrive written in the digits of the language; names stay as the user typed them. */
const reportCopy = {
  en: {
    percent: (value: string) => `${value}%`,
    notAvailable: "n/a",
    trades: (count: string) => `Trades: ${count}`,
    winRate: (value: string) => `Win rate: ${value}`,
    averageR: (value: string) => `Average R: ${value}`,
    profitFactor: (value: string) => `Profit factor: ${value}`,
    playbook: (name: string, adherence: string, average: string) => `Top playbook "${name}": rule adherence ${adherence}, average ${average}.`,
    headline: (period: string, trades: string, winRate: string, averageR: string) =>
      `Process review for ${period}: ${trades} trades, win rate ${winRate}, average ${averageR}R.`,
    pnl: (value: string) => `Net P&L: ${value}`,
    discipline: (grade: string) => `Discipline grade: ${grade}.`,
    focusMistake: (mistake: string) => `Focus next: reduce the repeated mistake "${mistake}".`,
    focusChecklist: "Focus next: pick one checklist improvement to carry into next week.",
    disclaimer: MENTOR_REPORT_DISCLAIMER
  },
  fa: {
    percent: (value: string) => `${value}٪`,
    notAvailable: "نامشخص",
    trades: (count: string) => `معاملات: ${count}`,
    winRate: (value: string) => `نرخ برد: ${value}`,
    averageR: (value: string) => `میانگین R: ${value}`,
    profitFactor: (value: string) => `ضریب سود: ${value}`,
    playbook: (name: string, adherence: string, average: string) => `بهترین پلی‌بوک «${name}»: پایبندی به قوانین ${adherence}، میانگین ${average}.`,
    headline: (period: string, trades: string, winRate: string, averageR: string) =>
      `مرور فرایند برای ${period}: ${trades} معامله، نرخ برد ${winRate}، میانگین ${averageR}R.`,
    pnl: (value: string) => `سود و زیان خالص: ${value}`,
    discipline: (grade: string) => `درجه انضباط: ${grade}.`,
    focusMistake: (mistake: string) => `تمرکز بعدی: اشتباه تکراری «${mistake}» را کم کنید.`,
    focusChecklist: "تمرکز بعدی: یک بهبود در چک‌لیست را برای هفته آینده انتخاب کنید.",
    disclaimer: MENTOR_REPORT_DISCLAIMER_FA
  }
} as const;

export function buildMentorReport(input: MentorReportInput, options: MentorReportOptions = {}): MentorReport {
  const hidePnl = options.hidePnl === true;
  const locale = options.locale ?? "en";
  const c = reportCopy[locale];
  const m = input.metrics;

  const num = (x: number, fractionDigits: number): string => formatGeneratedNumber(Number.isFinite(x) ? x : 0, fractionDigits, locale);
  const pct = (x: number): string => c.percent(num(x * 100, 1));
  const r = (x: number): string => num(x, 2);

  const processMetrics = [
    c.trades(num(m.totalTrades, 0)),
    c.winRate(pct(m.winRate)),
    c.averageR(r(m.avgRMultiple)),
    c.profitFactor(Number.isFinite(m.profitFactor) ? r(m.profitFactor) : c.notAvailable)
  ];

  const playbookHighlight = input.topPlaybook
    ? c.playbook(
        input.topPlaybook.name,
        input.topPlaybook.adherenceRate == null ? c.notAvailable : pct(input.topPlaybook.adherenceRate),
        input.topPlaybook.avgRMultiple == null ? c.notAvailable : r(input.topPlaybook.avgRMultiple) + "R"
      )
    : null;

  return {
    period: input.period,
    shareSafe: true,
    pnlHidden: hidePnl,
    headline: c.headline(input.period, num(m.totalTrades, 0), pct(m.winRate), r(m.avgRMultiple)),
    processMetrics,
    pnl: hidePnl ? null : c.pnl(r(m.netPnl)),
    playbookHighlight,
    disciplineNote: input.disciplineGrade ? c.discipline(input.disciplineGrade) : null,
    improvement: input.topMistake ? c.focusMistake(input.topMistake) : c.focusChecklist,
    disclaimer: c.disclaimer
  };
}
