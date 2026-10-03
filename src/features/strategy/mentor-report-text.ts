import { MENTOR_REPORT_DISCLAIMER } from "@/lib/calculations/mentor-report";
import type { Locale } from "@/lib/i18n/locales";

/** The text fields of the report that GET /api/mentor-report returns (it is written in English by the server). */
export type MentorReportText = {
  headline: string;
  processMetrics: string[];
  pnl: string | null;
  playbookHighlight: string | null;
  disciplineNote: string | null;
  improvement: string;
  disclaimer: string;
};

const NOT_AVAILABLE = "ندارد";
const na = (value: string) => (value === "n/a" ? NOT_AVAILABLE : value);

/** Sentence patterns of lib/calculations/mentor-report.ts, each with its Persian wording ($n = captured text). */
const SENTENCES: [RegExp, (match: RegExpExecArray) => string][] = [
  [
    /^Process review for (.+): (\d+) trades, win rate (-?[\d.]+%), average (-?[\d.]+)R\.$/,
    ([, period, trades, winRate, avgR]) => `مرور فرایند برای ${period === "all time" ? "کل دوره" : period}: ${trades} معامله، نرخ برد ${winRate}، میانگین ${avgR}R.`
  ],
  [/^Trades: (.+)$/, ([, value]) => `معاملات: ${value}`],
  [/^Win rate: (.+)$/, ([, value]) => `نرخ برد: ${value}`],
  [/^Average R: (.+)$/, ([, value]) => `میانگین R: ${value}`],
  [/^Profit factor: (.+)$/, ([, value]) => `ضریب سود: ${na(value)}`],
  [/^Net P&L: (.+)$/, ([, value]) => `سود و زیان خالص: ${value}`],
  [
    /^Top playbook "(.*)": rule adherence (.+), average (.+)\.$/,
    ([, name, adherence, avgR]) => `بهترین پلی‌بوک «${name}»: پایبندی به قوانین ${na(adherence)}، میانگین ${na(avgR)}.`
  ],
  [/^Discipline grade: (.+)\.$/, ([, grade]) => `نمره انضباط: ${grade}.`],
  [/^Focus next: reduce the repeated mistake "(.*)"\.$/, ([, mistake]) => `تمرکز بعدی: کاهش خطای تکراری «${mistake}».`],
  [/^Focus next: pick one checklist improvement to carry into next week\.$/, () => "تمرکز بعدی: یک بهبود در چک‌لیست را برای هفته بعد انتخاب کنید."]
];

const DISCLAIMER_FA =
  "این گزارش فقط برای مرور فرایند و گفت‌وگو با منتور است؛ توصیه مالی یا سیگنال معاملاتی نیست و برای کپی‌تریدینگ یا معاملات اجتماعی استفاده نمی‌شود.";

function sentence(text: string) {
  if (text === MENTOR_REPORT_DISCLAIMER) return DISCLAIMER_FA;
  for (const [pattern, write] of SENTENCES) {
    const match = pattern.exec(text);
    if (match) return write(match);
  }
  // A sentence the server added later is shown as it is rather than dropped.
  return text;
}

/**
 * The mentor report in the page language. The English page gets the report untouched; the Persian page gets its fixed
 * sentences in Persian (numbers, the playbook name and the trader's own mistake text are kept).
 */
export function localizeMentorReport<T extends MentorReportText>(report: T, locale: Locale): T {
  if (locale !== "fa") return report;
  return {
    ...report,
    headline: sentence(report.headline),
    processMetrics: report.processMetrics.map(sentence),
    pnl: report.pnl === null ? null : sentence(report.pnl),
    playbookHighlight: report.playbookHighlight === null ? null : sentence(report.playbookHighlight),
    disciplineNote: report.disciplineNote === null ? null : sentence(report.disciplineNote),
    improvement: sentence(report.improvement),
    disclaimer: sentence(report.disclaimer)
  };
}
