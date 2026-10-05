"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { AnalyticsBreakdown } from "@/components/ui/charts/analytics-breakdown";
import { EquityDrawdownChart } from "@/components/ui/charts/equity-drawdown-chart";
import { RHistogram } from "@/components/ui/charts/r-histogram";
import { Card, CardContent } from "@/components/ui/card";
import { SectionPanel } from "@/components/ui/section-panel";
import { AuthRequiredState, EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { SampleDataOffer } from "@/features/sample/sample-data-offer";
import { apiFetch, isAuthError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/api/error-text";
import type { Dimension, PerformanceReport, PeriodKey } from "@/lib/calculations/performance/types";
import { formatCount } from "@/lib/i18n/format";
import { t, type getMessages } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";
import { BehaviourPanel } from "./behaviour-panel";
import { drillDownHref } from "./drill-down";
import { EntriesBlock, HeadlineCards } from "./headline-cards";
import { PeriodChips } from "./period-chips";
import { breakdownLabel } from "./report-labels";

type Messages = ReturnType<typeof getMessages>;

/** The order the breakdowns come in on the page. */
const DIMENSIONS: Dimension[] = ["strategy", "session", "symbol", "side", "weekday", "setup", "mistake", "emotion", "market"];

const copy = {
  en: {
    eyebrow: "Review, not prediction",
    description: "Review behavior, repeated mistakes, rule discipline, and playbook quality. This page does not predict future outcomes.",
    loading: "Loading performance review",
    emptyTitle: "Not enough data yet",
    emptyDescription: "After you import trades, your win rate, expectancy, drawdown and strategy results appear here.",
    emptyImport: "Import MT5 trades",
    emptyJournal: "Log a trade in the journal",
    unavailableTitle: "Performance unavailable",
    unavailableDescription: "Performance data failed to load",
    zone: "Days in your time zone:",
    zoneLink: "Change in Settings",
    sample: "Sample data",
    noWindowTitle: "No closed trades in this period",
    noWindowDescription: "Choose a longer period to see more of your journal.",
    showAll: "Show all trades",
    breakdownDesc: "Each entry counts once. Net result is reviewed behavior, not a forecast.",
    mistakeDesc: "An entry with several mistake tags appears under each of them. Net result is reviewed behavior, not a forecast.",
    titles: {
      strategy: "Performance by strategy",
      session: "Performance by session",
      symbol: "Performance by symbol",
      side: "Performance by side (long or short)",
      weekday: "Performance by weekday",
      setup: "Performance by setup",
      mistake: "Mistake analysis",
      emotion: "Emotion analysis",
      market: "Performance by market"
    } as Record<Dimension, string>,
    prompts: "Weekly review prompts",
    promptsDesc: "Use these questions before changing any strategy rule.",
    promptsItems: [
      "Which rule was broken most often?",
      "Which setup had the cleanest plan adherence?",
      "What risk behavior should be reduced next week?",
      "What is one checklist item to improve?"
    ],
    rDistribution: "R distribution",
    rDistributionDesc: "How many entries ended at each result in R during this period.",
    equity: "Equity curve",
    equityDesc: "Running total of the period's closed trades that have a money value, after fees, with how far it sat below its high.",
    lowSample: (entries: string, count: number) =>
      `Based on ${entries} ${count === 1 ? "entry" : "entries"}. With a small sample, each trade carries a lot of weight in these numbers.`,
    unpriced: (n: string, count: number) =>
      `${n} closed ${count === 1 ? "trade has" : "trades have"} no money value and ${count === 1 ? "is" : "are"} left out of the money figures.`,
    open: (n: string, count: number) => `${n} open ${count === 1 ? "trade is" : "trades are"} not included.`
  },
  fa: {
    eyebrow: "مرور، نه پیش‌بینی",
    description: "رفتار، خطاهای تکراری، انضباط قوانین و کیفیت پلی‌بوک را مرور کنید. این صفحه آینده بازار را پیش‌بینی نمی‌کند.",
    loading: "در حال بارگذاری مرور عملکرد",
    emptyTitle: "هنوز داده کافی نیست",
    emptyDescription: "بعد از ورود معاملات، نرخ برد، امید ریاضی، افت سرمایه و عملکرد استراتژی‌های شما اینجا نمایش داده می‌شود.",
    emptyImport: "ورود معاملات MT5",
    emptyJournal: "ثبت معامله در ژورنال",
    unavailableTitle: "عملکرد در دسترس نیست",
    unavailableDescription: "بارگذاری داده‌های عملکرد ناموفق بود",
    zone: "روزها به وقت",
    zoneLink: "تغییر در تنظیمات",
    sample: "داده نمونه",
    noWindowTitle: "در این بازه معامله‌ی بسته‌ای نیست",
    noWindowDescription: "بازه‌ی بلندتری را انتخاب کنید تا بخش بیشتری از ژورنال‌تان را ببینید.",
    showAll: "نمایش همه‌ی معاملات",
    breakdownDesc: "هر ورود یک بار شمرده می‌شود. نتیجه‌ی خالص برای مرور رفتار است، نه پیش‌بینی.",
    mistakeDesc: "ورودی که چند برچسب خطا دارد زیر هر کدام از آن‌ها می‌آید. نتیجه‌ی خالص برای مرور رفتار است، نه پیش‌بینی.",
    titles: {
      strategy: "عملکرد بر اساس استراتژی",
      session: "عملکرد بر اساس سشن",
      symbol: "عملکرد بر اساس نماد",
      side: "عملکرد بر اساس جهت (لانگ یا شورت)",
      weekday: "عملکرد بر اساس روز هفته",
      setup: "عملکرد بر اساس ستاپ",
      mistake: "تحلیل خطاها",
      emotion: "تحلیل احساسات",
      market: "عملکرد بر اساس بازار"
    } as Record<Dimension, string>,
    prompts: "پرسش‌های مرور هفتگی",
    promptsDesc: "قبل از تغییر قوانین استراتژی، این پرسش‌ها را بررسی کنید.",
    promptsItems: [
      "کدام قانون بیشتر از بقیه نقض شد؟",
      "کدام ستاپ پایبندی شفاف‌تری به پلن داشت؟",
      "کدام رفتار ریسکی باید در هفته بعد کاهش پیدا کند؟",
      "یک مورد چک‌لیست برای بهبود چیست؟"
    ],
    rDistribution: "توزیع R",
    rDistributionDesc: "تعداد ورودهای این بازه در هر بازه‌ی نتیجه بر حسب R.",
    equity: "منحنی سرمایه",
    equityDesc: "مجموع نتیجه‌ی معاملات بسته‌ی این بازه که ارزش پولی دارند، پس از کسر کارمزد، همراه با فاصله‌اش از اوج.",
    lowSample: (entries: string) => `بر پایه‌ی ${entries} ورود؛ در نمونه‌ی کوچک هر معامله سهم بزرگی در این عددها دارد.`,
    unpriced: (n: string) => `${n} معامله‌ی بسته ارزش پولی ندارد و در عددهای پولی حساب نشده است.`,
    open: (n: string) => `${n} معامله‌ی باز در این عددها نیست.`
  }
} as const;

export function PerformanceScreen({ locale, messages }: { locale: Locale; messages: Messages }) {
  const c = copy[locale];
  const [period, setPeriod] = useState<PeriodKey>("all");
  const [attempt, setAttempt] = useState(0);
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let current = true;
    apiFetch<{ report: PerformanceReport }>(`/api/performance?period=${period}`)
      .then((data) => {
        if (!current) return;
        setReport(data.report);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (current) setError(reason);
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
    };
  }, [period, attempt]);

  /** Asks again for the chosen window; choosing the one already shown asks again too, which is how a failed load is retried. */
  function choose(next: PeriodKey) {
    setBusy(true);
    setPeriod(next);
    setAttempt((count) => count + 1);
  }

  if (error && isAuthError(error)) return <AuthRequiredState locale={locale} />;
  if (!report && !error) return <LoadingState label={c.loading} />;

  const header = <PageHeader eyebrow={c.eyebrow} title={t(messages, "pages.performance")} description={c.description} />;

  if (error || !report) {
    return (
      <div className="space-y-6">
        {header}
        <PeriodChips period={period} onChange={choose} locale={locale} />
        <ErrorState title={c.unavailableTitle} description={apiErrorText(error, locale, c.unavailableDescription)} />
      </div>
    );
  }

  const { context, summary } = report;

  if (context.period === "all" && summary.closedTrades === 0) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          title={c.emptyTitle}
          description={c.emptyDescription}
          actions={[
            { href: `/${locale}/import`, label: c.emptyImport },
            { href: `/${locale}/journal`, label: c.emptyJournal }
          ]}
        />
        <SampleDataOffer locale={locale} />
      </div>
    );
  }

  const notes = [
    summary.closedTrades > 0 && summary.lowSample ? c.lowSample(formatCount(summary.entries.count, locale), summary.entries.count) : null,
    summary.unpricedClosed > 0 ? c.unpriced(formatCount(summary.unpricedClosed, locale), summary.unpricedClosed) : null,
    summary.openTrades > 0 ? c.open(formatCount(summary.openTrades, locale), summary.openTrades) : null
  ].filter((note): note is string => note !== null);

  return (
    <div className="space-y-6" aria-busy={busy}>
      <div className="space-y-3">
        {header}
        <PeriodChips period={period} onChange={choose} locale={locale} />
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          <span>
            {c.zone} <span dir="ltr">{context.timeZone}</span>
          </span>
          <Link href={`/${locale}/settings`} className="inline-flex min-h-11 items-center text-primary underline underline-offset-2 hover:no-underline">
            {c.zoneLink}
          </Link>
          {context.source === "sample" ? (
            <span className="rounded-full border border-warning/40 px-2 py-0.5 font-medium text-warning">{c.sample}</span>
          ) : null}
        </p>
        {notes.length ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className={busy ? "space-y-6 opacity-60" : "space-y-6"}>
        {summary.closedTrades === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-sm font-semibold text-foreground">{c.noWindowTitle}</p>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{c.noWindowDescription}</p>
              <button
                type="button"
                onClick={() => choose("all")}
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                {c.showAll}
              </button>
            </CardContent>
          </Card>
        ) : (
          <>
            <HeadlineCards summary={summary} period={context.period} locale={locale} />
            <SectionPanel title={c.equity} description={c.equityDesc}>
              <EquityDrawdownChart points={report.equity} locale={locale} timeZone={context.timeZone} />
            </SectionPanel>
            <BehaviourPanel behaviour={report.behaviour} summary={summary} locale={locale} />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {DIMENSIONS.map((dimension) => (
                <AnalyticsBreakdown
                  key={dimension}
                  title={c.titles[dimension]}
                  description={dimension === "mistake" ? c.mistakeDesc : c.breakdownDesc}
                  rows={report.breakdowns[dimension]}
                  locale={locale}
                  resolveLabel={(label) => breakdownLabel(label, locale)}
                  rowHref={(row) => drillDownHref(locale, { period: context.period, dimension, row: row.id })}
                />
              ))}
            </div>
            <SectionPanel title={c.rDistribution} description={c.rDistributionDesc}>
              <RHistogram histogram={report.rHistogram} locale={locale} />
            </SectionPanel>
            <EntriesBlock summary={summary} locale={locale} />
            <SectionPanel title={c.prompts} description={c.promptsDesc}>
              <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
                {c.promptsItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </SectionPanel>
          </>
        )}
      </div>
    </div>
  );
}
