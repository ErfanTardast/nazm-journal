"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { PerformanceSnapshot } from "@/lib/calculations/performance/types";
import { formatCount, formatMoney, formatPercent, formatR, formatSignedMoney } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

const DASH = "—";

const copy = {
  en: {
    title: "Last 30 days",
    period: "30 days",
    what: "Closed trades of the last 30 days. Days follow your time zone.",
    link: "See the full report",
    sample: "Sample data",
    netPnl: "Net P&L",
    expectancy: "Expectancy",
    drawdown: "Max drawdown",
    adherence: "Rule adherence",
    netPnlNote: (n: string) => `${n} closed trades in the last 30 days, after fees`,
    netPnlNone: "No closed trade in the last 30 days",
    unpriced: (n: string) => `; ${n} without a money value left out`,
    expectancyNote: (n: string) => `Average result per closed trade so far, over ${n} trades with a money value`,
    expectancyNone: "No closed trade with a money value in the last 30 days",
    drawdownNote: (r: string) => `Deepest fall from a high of the 30-day curve (${r})`,
    adherenceNote: (followed: string, reviewed: string, unknown: string) => `${followed} of ${reviewed} reviewed entries followed the rules; ${unknown} not reviewed yet`,
    adherenceNone: (unknown: string) => `No entry has a rule verdict yet; ${unknown} not reviewed`,
    lowSample: (n: string) => `Based on ${n} entries; in a small sample each trade weighs heavily in these numbers.`,
    empty: "No trade closed in the last 30 days. Import your MT5 report or log a trade to see these numbers."
  },
  fa: {
    title: "۳۰ روز اخیر",
    period: "۳۰ روز",
    what: "معامله‌های بسته‌شده‌ی ۳۰ روز اخیر. روزها به وقت منطقه‌ی زمانی شما حساب می‌شوند.",
    link: "دیدن گزارش کامل",
    sample: "داده نمونه",
    netPnl: "سود و زیان خالص",
    expectancy: "امید ریاضی",
    drawdown: "بیشترین افت سرمایه",
    adherence: "پایبندی به قوانین",
    netPnlNote: (n: string) => `${n} معامله‌ی بسته در ۳۰ روز اخیر، پس از کسر کارمزد`,
    netPnlNone: "در ۳۰ روز اخیر معامله‌ی بسته‌ای نیست",
    unpriced: (n: string) => `؛ ${n} معامله بدون ارزش پولی کنار گذاشته شد`,
    expectancyNote: (n: string) => `میانگین نتیجه‌ی هر معامله‌ی بسته تا امروز، روی ${n} معامله‌ی دارای ارزش پولی`,
    expectancyNone: "در ۳۰ روز اخیر معامله‌ی بسته‌ی دارای ارزش پولی نیست",
    drawdownNote: (r: string) => `عمیق‌ترین افت از یک اوج منحنی ۳۰ روز اخیر (${r})`,
    adherenceNote: (followed: string, reviewed: string, unknown: string) => `${followed} ورود از ${reviewed} ورود مرورشده طبق قوانین بود؛ ${unknown} ورود هنوز مرور نشده`,
    adherenceNone: (unknown: string) => `هنوز هیچ ورودی وضعیت قانون ندارد؛ ${unknown} ورود مرور نشده`,
    lowSample: (n: string) => `بر پایه‌ی ${n} ورود؛ در نمونه‌ی کوچک هر معامله سهم بزرگی در این عددها دارد.`,
    empty: "در ۳۰ روز اخیر معامله‌ای بسته نشده. گزارش MT5 را وارد کنید یا معامله‌ای ثبت کنید تا این اعداد را ببینید."
  }
} as const;

type Tone = "success" | "danger" | "warning" | "default";
const toneOf = (value: number): Tone => (value > 0 ? "success" : value < 0 ? "danger" : "default");

function Metric({ id, label, value, note, tone, period, sample }: { id: string; label: string; value: string; note: string; tone: Tone; period: string; sample: string | null }) {
  return (
    <div data-metric={id} className="min-w-0 rounded-lg border border-border bg-muted/20 p-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <span>{label}</span>
        <Badge className="font-normal">{period}</Badge>
        {sample ? <Badge tone="warning">{sample}</Badge> : null}
      </p>
      <p className={cn("mt-2 text-xl font-semibold text-foreground", tone === "success" && "text-success", tone === "danger" && "text-destructive", tone === "warning" && "text-warning")}>{value}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{note}</p>
    </div>
  );
}

/** The 30-day numbers a trader looks at first, each labelled with its period and one line on what it counts. */
export function PerformanceSection({ snapshot, locale }: { snapshot: PerformanceSnapshot; locale: Locale }) {
  const c = copy[locale];
  const { summary, context } = snapshot;
  const count = (value: number) => formatCount(value, locale);
  const sample = context.source === "sample" ? c.sample : null;
  const reviewed = summary.adherence.followed + summary.adherence.mixed + summary.adherence.broken;
  const priced = summary.closedTrades - summary.unpricedClosed;

  return (
    <section aria-labelledby="dashboard-performance" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <h2 id="dashboard-performance" className="text-lg font-semibold text-foreground">
          {c.title}
        </h2>
        <Link href={`/${locale}/performance`} className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-2 hover:no-underline">
          {c.link}
        </Link>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{c.what}</p>
      {summary.closedTrades === 0 ? (
        <p className="rounded-lg border border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
          {c.empty}
          {sample ? <Badge tone="warning" className="ms-2">{sample}</Badge> : null}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              id="net-pnl"
              label={c.netPnl}
              value={formatSignedMoney(summary.netPnl, locale)}
              note={c.netPnlNote(count(summary.closedTrades)) + (summary.unpricedClosed > 0 ? c.unpriced(count(summary.unpricedClosed)) : "")}
              tone={toneOf(summary.netPnl)}
              period={c.period}
              sample={sample}
            />
            <Metric
              id="expectancy"
              label={c.expectancy}
              value={summary.expectancy === null ? DASH : formatSignedMoney(summary.expectancy, locale)}
              note={summary.expectancy === null ? c.expectancyNone : c.expectancyNote(count(priced))}
              tone="default"
              period={c.period}
              sample={sample}
            />
            <Metric
              id="drawdown"
              label={c.drawdown}
              value={formatMoney(summary.maxDrawdownAmount, locale)}
              note={c.drawdownNote(formatR(summary.maxDrawdownR, locale, 1))}
              tone="warning"
              period={c.period}
              sample={sample}
            />
            <Metric
              id="adherence"
              label={c.adherence}
              value={summary.adherence.rate === null ? DASH : formatPercent(summary.adherence.rate, locale)}
              note={reviewed === 0 ? c.adherenceNone(count(summary.adherence.unknown)) : c.adherenceNote(count(summary.adherence.followed), count(reviewed), count(summary.adherence.unknown))}
              tone="default"
              period={c.period}
              sample={sample}
            />
          </div>
          {summary.lowSample && summary.entries.count > 0 ? <p className="text-xs leading-5 text-muted-foreground">{c.lowSample(count(summary.entries.count))}</p> : null}
        </>
      )}
    </section>
  );
}
