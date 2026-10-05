"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { dayKey } from "@/lib/calculations/performance/time";
import type { TodayRisk } from "@/lib/calculations/today-risk";
import { formatCount, formatPercent, formatR, formatShortDay, formatSignedMoney } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";
import { isNewAccount, plansOf, reviewTasksOf, type DashboardOverview, type PlanSummary } from "./overview-types";

const copy = {
  en: {
    title: "Today",
    zone: "Days in your time zone:",
    zoneLink: "Change in Settings",
    markets: { crypto: "Crypto", forex: "Forex", stocks: "Stocks" } as Record<string, string>,
    planStatuses: { planned: "Planned", active: "Active", closed: "Closed", canceled: "Canceled" } as Record<string, string>,
    sample: "Sample data",
    risk: {
      title: "Today's result",
      what: "The net result of the trades closed today, against your daily loss limit.",
      states: { clear: "Within the limit", near: "Near the limit", reached: "Limit reached", unknown: "Not measured" },
      net: "Net today",
      noResult: "No trade closed today",
      meter: "Share of the daily loss limit used",
      lossOfLimit: (loss: string, limit: string) => `Loss ${loss} of the ${limit} daily loss limit`,
      basisBalance: (pnl: string) => `Loss = the net result of the trades closed today (${pnl}) over your starting balance.`,
      basisR: (r: string, risk: string) => `Loss = the net R of the trades closed today (${r}) × your risk per trade (${risk}).`,
      basisNone: "Set a starting balance or a risk per trade in Settings to measure today's loss.",
      noLimit: "Set a daily loss limit in Settings to compare today's result with it.",
      closed: (n: string, count: number) => `${n} ${count === 1 ? "trade" : "trades"} closed today`,
      leftOutMoney: (n: string) => `${n} without a money result, left out`,
      leftOutR: (n: string) => `${n} without an R (no stop loss), left out`,
      open: (n: string, count: number) => `${n} ${count === 1 ? "trade" : "trades"} open now`,
      openRisk: (risk: string) => `${risk} of the account at risk, as stated on the trades`,
      openUnstated: (n: string) => `${n} without a stated risk`
    },
    plan: {
      title: "Today's plan",
      what: "Plans still planned or active. Complete means risk, invalidation and a full checklist.",
      forToday: (n: string, count: number) => `${n} ${count === 1 ? "plan" : "plans"} for today`,
      noneToday: "No plan is dated today",
      counts: (active: string, complete: string) => `${active} active, ${complete} complete`,
      next: "Next plan",
      riskLabel: "Risk",
      noPlan: "No active plan is ready. Define scenario, risk, invalidation, and checklist first.",
      noPlanNewAccount: "No trades logged and no active plan yet. Write a plan, or import the trades you already took.",
      firstSteps: { plan: "Write a plan", importTrades: "Import trades" }
    },
    reviews: {
      title: "Open reviews",
      what: "Reviews waiting to be completed. Overdue ones ended before now.",
      open: "Open",
      overdue: "Overdue",
      next: "Next review",
      ends: (day: string) => `Period ends ${day}`,
      none: "No open review. Generate a daily review to preserve the operating rhythm."
    }
  },
  fa: {
    title: "امروز",
    zone: "روزها به وقت",
    zoneLink: "تغییر در تنظیمات",
    markets: { crypto: "کریپتو", forex: "فارکس", stocks: "سهام" } as Record<string, string>,
    planStatuses: { planned: "برنامه‌ریزی‌شده", active: "فعال", closed: "بسته‌شده", canceled: "لغوشده" } as Record<string, string>,
    sample: "داده نمونه",
    risk: {
      title: "نتیجه‌ی امروز",
      what: "نتیجه‌ی خالص معامله‌هایی که امروز بسته شده‌اند، در برابر سقف ضرر روزانه‌ی شما.",
      states: { clear: "در محدوده", near: "نزدیک سقف", reached: "به سقف رسید", unknown: "اندازه‌گیری نشده" },
      net: "خالص امروز",
      noResult: "امروز معامله‌ای بسته نشده",
      meter: "سهم مصرف‌شده از سقف ضرر روزانه",
      lossOfLimit: (loss: string, limit: string) => `زیان ${loss} از سقف ضرر روزانه‌ی ${limit}`,
      basisBalance: (pnl: string) => `زیان = نتیجه‌ی خالص معامله‌های امروز (${pnl}) نسبت به موجودی اولیه‌ی شما.`,
      basisR: (r: string, risk: string) => `زیان = R خالص معامله‌های امروز (${r}) × ریسک هر معامله‌ی شما (${risk}).`,
      basisNone: "برای اندازه‌گیری زیان امروز، در تنظیمات موجودی اولیه یا ریسک هر معامله را وارد کنید.",
      noLimit: "برای مقایسه‌ی نتیجه‌ی امروز با سقف، در تنظیمات سقف ضرر روزانه را وارد کنید.",
      closed: (n: string) => `${n} معامله امروز بسته شده`,
      leftOutMoney: (n: string) => `${n} معامله بدون نتیجه‌ی پولی، کنار گذاشته شد`,
      leftOutR: (n: string) => `${n} معامله بدون R (بدون حد ضرر)، کنار گذاشته شد`,
      open: (n: string) => `${n} معامله‌ی باز`,
      openRisk: (risk: string) => `${risk} از حساب در ریسک، طبق ریسک ثبت‌شده روی معامله‌ها`,
      openUnstated: (n: string) => `${n} مورد بدون ریسک ثبت‌شده`
    },
    plan: {
      title: "پلن امروز",
      what: "پلن‌هایی که هنوز برنامه‌ریزی‌شده یا فعال‌اند. کامل یعنی ریسک، قانون ابطال و چک‌لیست کامل دارد.",
      forToday: (n: string) => `${n} پلن برای امروز`,
      noneToday: "پلنی برای امروز تاریخ‌گذاری نشده",
      counts: (active: string, complete: string) => `${active} فعال، ${complete} کامل`,
      next: "پلن بعدی",
      riskLabel: "ریسک",
      noPlan: "پلن فعالی آماده نیست. ابتدا سناریو، ریسک، ابطال و چک‌لیست را مشخص کنید.",
      noPlanNewAccount: "هنوز معامله‌ای ثبت نشده و پلن فعالی ندارید. یک پلن بنویسید یا معامله‌هایی را که قبلاً انجام داده‌اید وارد کنید.",
      firstSteps: { plan: "نوشتن پلن", importTrades: "ورود معاملات" }
    },
    reviews: {
      title: "مرورهای باز",
      what: "مرورهایی که منتظر تکمیل‌اند. عقب‌افتاده یعنی پایان بازه‌اش گذشته است.",
      open: "باز",
      overdue: "عقب‌افتاده",
      next: "مرور بعدی",
      ends: (day: string) => `پایان بازه: ${day}`,
      none: "مرور بازی وجود ندارد. برای حفظ ریتم کاری یک مرور روزانه بسازید."
    }
  }
} as const;

const tileBase = "flex min-h-11 min-w-0 flex-col gap-3 rounded-lg border border-border bg-muted/20 p-4";
const tileLink = cn(tileBase, "transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary");

function Heading({ children, badge }: { children: ReactNode; badge?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-foreground">{children}</h3>
      {badge}
    </div>
  );
}

const stateTone = { clear: "success", near: "warning", reached: "danger", unknown: "default" } as const;
const barTone = { clear: "bg-success", near: "bg-warning", reached: "bg-destructive", unknown: "bg-muted-foreground" } as const;

/** Today's result against the daily loss limit, with how it was measured written out. */
function RiskTile({ today, riskPerTradePct, sample, locale }: { today: TodayRisk; riskPerTradePct: number; sample: boolean; locale: Locale }) {
  const c = copy[locale];
  const r = c.risk;
  const count = (value: number) => formatCount(value, locale);
  const percent = (value: number) => formatPercent(value / 100, locale);
  const measured = today.state !== "unknown";
  const net = today.basis === "balance" ? formatSignedMoney(today.netPnl, locale) : formatR(today.netR, locale);
  const share = Math.min(1, today.usedShare ?? 0);
  const sep = locale === "fa" ? "؛ " : "; ";
  // Without a measure the daily limit cannot be read, so Settings is where the next step is; otherwise today's trades are in the journal.
  const href = measured ? `/${locale}/journal` : `/${locale}/settings`;

  return (
    <Link href={href} className={tileLink} data-tile="risk">
      <Heading badge={<Badge tone={stateTone[today.state]}>{r.states[today.state]}</Badge>}>{r.title}</Heading>
      <p className="text-xs leading-5 text-muted-foreground">{r.what}</p>
      {today.basis === "none" ? (
        <p className="text-sm leading-6 text-foreground">{r.basisNone}</p>
      ) : (
        <>
          <p className="text-xl font-semibold text-foreground">
            <span className="text-xs font-medium text-muted-foreground">{r.net} </span>
            <span dir="ltr">{today.closedToday === 0 ? "—" : net}</span>
          </p>
          {measured ? (
            <div>
              <div
                role="meter"
                aria-label={r.meter}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(share * 100)}
                aria-valuetext={r.lossOfLimit(percent(today.lossPct), percent(today.limitPct))}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div className={cn("h-full rounded-full", barTone[today.state])} style={{ width: `${Math.round(share * 100)}%` }} />
              </div>
              <p className="mt-2 text-sm text-foreground">{r.lossOfLimit(percent(today.lossPct), percent(today.limitPct))}</p>
            </div>
          ) : (
            <p className="text-sm leading-6 text-foreground">{r.noLimit}</p>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            {today.basis === "balance" ? r.basisBalance(formatSignedMoney(today.netPnl, locale)) : r.basisR(formatR(today.netR, locale), percent(riskPerTradePct))}
          </p>
        </>
      )}
      <ul className="space-y-1 text-xs leading-5 text-muted-foreground">
        <li>{today.closedToday === 0 ? r.noResult : r.closed(count(today.closedToday), today.closedToday)}</li>
        {today.leftOut > 0 && today.basis !== "none" ? <li>{today.basis === "balance" ? r.leftOutMoney(count(today.leftOut)) : r.leftOutR(count(today.leftOut))}</li> : null}
        {today.openTrades > 0 ? (
          <li>
            {r.open(count(today.openTrades), today.openTrades)}
            {today.openRisk !== null ? `${sep}${r.openRisk(percent(today.openRisk))}` : ""}
            {today.openWithoutRisk > 0 ? `${sep}${r.openUnstated(count(today.openWithoutRisk))}` : ""}
          </li>
        ) : null}
      </ul>
      {sample ? <Badge className="self-start">{c.sample}</Badge> : null}
    </Link>
  );
}

function FirstStepLink({ href, primary = false, children }: { href: string; primary?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
          : "inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold text-foreground transition hover:bg-muted"
      }
    >
      {children}
    </Link>
  );
}

function PlanBlock({ plan, timeZone, locale }: { plan: PlanSummary; timeZone: string; locale: Locale }) {
  const c = copy[locale];
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <p className="text-xs text-muted-foreground">{c.plan.next}</p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground">
            <span dir="ltr">{plan.symbol}</span>
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {c.markets[plan.market] ?? plan.market} · {plan.bias}
          </p>
        </div>
        <Badge tone="warning">{c.planStatuses[plan.status] ?? plan.status}</Badge>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {plan.plannedFor ? `${formatShortDay(dayKey(plan.plannedFor, timeZone), locale)} · ` : ""}
        {plan.riskPercent ? `${c.plan.riskLabel} ${formatPercent(plan.riskPercent / 100, locale)}` : ""}
      </p>
    </div>
  );
}

function PlanTile({ data, timeZone, locale }: { data: DashboardOverview; timeZone: string; locale: Locale }) {
  const c = copy[locale];
  const p = c.plan;
  const plans = plansOf(data);
  const count = (value: number) => formatCount(value, locale);

  if (!plans.next) {
    // Nothing to open: the tile offers the first steps itself (links cannot sit inside a link).
    return (
      <div className={tileBase} data-tile="plan">
        <Heading>{p.title}</Heading>
        <div className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">{isNewAccount(data) ? p.noPlanNewAccount : p.noPlan}</p>
          <div className="flex flex-wrap gap-3">
            <FirstStepLink href={`/${locale}/plans`} primary>
              {p.firstSteps.plan}
            </FirstStepLink>
            {isNewAccount(data) ? <FirstStepLink href={`/${locale}/import`}>{p.firstSteps.importTrades}</FirstStepLink> : null}
          </div>
        </div>
      </div>
    );
  }
  return (
    <Link href={`/${locale}/plans`} className={tileLink} data-tile="plan">
      <Heading>{p.title}</Heading>
      <p className="text-xs leading-5 text-muted-foreground">{p.what}</p>
      <p className="text-xl font-semibold text-foreground">{plans.todayCount > 0 ? p.forToday(count(plans.todayCount), plans.todayCount) : p.noneToday}</p>
      <p className="text-xs text-muted-foreground">{p.counts(count(plans.activeCount), count(plans.completeCount))}</p>
      <PlanBlock plan={plans.next} timeZone={timeZone} locale={locale} />
    </Link>
  );
}

function ReviewTile({ data, timeZone, locale }: { data: DashboardOverview; timeZone: string; locale: Locale }) {
  const c = copy[locale];
  const r = c.reviews;
  const tasks = reviewTasksOf(data);
  const count = (value: number) => formatCount(value, locale);

  return (
    <Link href={`/${locale}/reviews`} className={tileLink} data-tile="reviews">
      <Heading>{r.title}</Heading>
      <p className="text-xs leading-5 text-muted-foreground">{r.what}</p>
      {tasks.openCount === 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">{r.none}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-muted-foreground">{r.open}</dt>
              <dd className="mt-1 text-xl font-semibold text-foreground">{count(tasks.openCount)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{r.overdue}</dt>
              <dd className={cn("mt-1 text-xl font-semibold", tasks.overdueCount > 0 ? "text-destructive" : "text-foreground")}>{count(tasks.overdueCount)}</dd>
            </div>
          </dl>
          {tasks.next ? (
            <div className="rounded-md border border-border bg-background/40 p-3">
              <p className="text-xs text-muted-foreground">{r.next}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{tasks.next.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{r.ends(formatShortDay(dayKey(tasks.next.periodEnd, timeZone), locale))}</p>
            </div>
          ) : null}
        </>
      )}
    </Link>
  );
}

/** The three things to look at first today: the loss meter, the plan and the reviews waiting. */
export function TodaySection({ data, locale }: { data: DashboardOverview; locale: Locale }) {
  const c = copy[locale];
  const timeZone = data.performance?.context.timeZone ?? "UTC";
  const sample = data.performance?.context.source === "sample";

  return (
    <section aria-labelledby="dashboard-today" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <h2 id="dashboard-today" className="text-lg font-semibold text-foreground">
          {c.title}
        </h2>
        {data.performance ? (
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            <span>
              {c.zone} <span dir="ltr">{timeZone}</span>
            </span>
            <Link href={`/${locale}/settings`} className="inline-flex min-h-11 items-center text-primary underline underline-offset-2 hover:no-underline">
              {c.zoneLink}
            </Link>
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {data.today ? <RiskTile today={data.today} riskPerTradePct={data.riskDefaults.riskPerTradePct} sample={sample} locale={locale} /> : null}
        <PlanTile data={data} timeZone={timeZone} locale={locale} />
        <ReviewTile data={data} timeZone={timeZone} locale={locale} />
      </div>
    </section>
  );
}
