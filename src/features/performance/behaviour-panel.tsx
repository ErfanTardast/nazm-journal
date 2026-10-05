"use client";

import type { ReactNode } from "react";
import { SectionPanel } from "@/components/ui/section-panel";
import { R_TOLERANCE, SIZE_UP_FACTOR, type BehaviourReport, type PerformanceSummary, type ResultGroup } from "@/lib/calculations/performance/types";
import { formatCount, formatNumber, formatPercent, formatR, formatShortDay, formatSignedMoney } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

const DASH = "—";

const copy = {
  en: {
    title: "Behaviour",
    description: "What the entries of this period show about your rules, re-entries, the order of trades in a day and how trades ended. It describes what happened.",
    entries: "Entries",
    winRate: "Win rate",
    netPnl: "Net P&L",
    avgR: "Avg R",
    adherenceTitle: "Rule adherence against result",
    adherenceNote: "Share of the reviewed entries that were marked Followed, next to how the entries of each verdict ended.",
    adherenceRate: "Rule adherence",
    adherenceCoverage: (reviewed: string, total: string) => `${reviewed} of ${total} entries reviewed`,
    adherenceNone: "No entry has a rule review yet. In the journal, mark each entry's rules as Followed, Mixed or Broken to fill this in.",
    verdicts: { followed: "Followed", mixed: "Mixed", broken: "Broken" },
    reentryTitle: (minutes: string) => `Re-entry within ${minutes} minutes after a loss`,
    reentryNote: "Entries opened soon after an earlier entry closed at a loss.",
    reentryCount: (n: string, count: number) => `${n} ${count === 1 ? "entry" : "entries"}`,
    reentryResult: (net: string, win: string, avg: string) => `Net result ${net}, win rate ${win}, average ${avg}.`,
    reentrySized: (n: string, factor: string) => `${n} of them carried more risk than usual (above ${factor} times your median risk in this period).`,
    reentryNone: (minutes: string) => `No entry in this period was opened within ${minutes} minutes after a loss.`,
    orderTitle: "Results by order in the day",
    orderNote: "The first, second, third and later entry opened on each day (days in your time zone).",
    order: { first: "First", second: "Second", thirdPlus: "Third and later" },
    busiest: (day: string, n: string, count: number) => `Busiest day: ${day} (${n} ${count === 1 ? "entry" : "entries"})`,
    orderNone: "No entries to compare in this period.",
    exitsTitle: "How trades ended against stop and target",
    exitsNote: (tolerance: string) => `Stop and target are those of the entry's first leg. At stop and at target mean within ${tolerance} of it.`,
    exits: {
      atTarget: "At target",
      beforeTarget: "In profit before target",
      atStop: "At stop",
      beyondStop: "Loss larger than 1R",
      beforeStop: "In loss before stop",
      breakeven: "Breakeven",
      noPlan: "No stop or target"
    },
    exitsAverages: (planned: string, reached: string) => `Winners closed before the target: ${planned} planned on average, ${reached} reached.`,
    exitsNone: "No closed entry to sort in this period."
  },
  fa: {
    title: "رفتار",
    description: "ورودهای این بازه درباره‌ی قوانین، ورودهای دوباره، نوبت معامله در روز و پایان معامله‌ها چه نشان می‌دهند. این بخش آنچه رخ داده را توصیف می‌کند.",
    entries: "ورودها",
    winRate: "نرخ برد",
    netPnl: "سود و زیان خالص",
    avgR: "میانگین R",
    adherenceTitle: "پایبندی به قوانین در برابر نتیجه",
    adherenceNote: "سهم ورودهای مرورشده که «رعایت شد» خورده‌اند، کنار نتیجه‌ی ورودهای هر وضعیت.",
    adherenceRate: "پایبندی به قوانین",
    adherenceCoverage: (reviewed: string, total: string) => `${reviewed} از ${total} ورود مرور شده`,
    adherenceNone: "هنوز هیچ ورودی مرور قوانین ندارد. در ژورنال برای هر ورود مشخص کنید قوانین رعایت شد، بخشی رعایت شد یا شکسته شد تا اینجا پر شود.",
    verdicts: { followed: "رعایت شد", mixed: "بخشی رعایت شد", broken: "شکسته شد" },
    reentryTitle: (minutes: string) => `ورود دوباره تا ${minutes} دقیقه پس از یک ضرر`,
    reentryNote: "ورودهایی که کمی بعد از بسته شدن یک ورود قبلی با ضرر باز شده‌اند.",
    reentryCount: (n: string) => `${n} ورود`,
    reentryResult: (net: string, win: string, avg: string) => `نتیجه‌ی خالص ${net}، نرخ برد ${win}، میانگین ${avg}.`,
    reentrySized: (n: string, factor: string) => `${n} مورد از آن‌ها با ریسکی بیشتر از ${factor} برابر ریسک معمول شما (میانه‌ی ریسک ورودهای این بازه) باز شد.`,
    reentryNone: (minutes: string) => `در این بازه هیچ ورودی تا ${minutes} دقیقه پس از یک ضرر باز نشد.`,
    orderTitle: "نتیجه بر اساس نوبت معامله در روز",
    orderNote: "اولین، دومین، سومین و بعدی ورودی که در هر روز باز شده (روزها به وقت منطقه‌ی زمانی شما).",
    order: { first: "اولین", second: "دومین", thirdPlus: "سومین و بعد از آن" },
    busiest: (day: string, n: string) => `شلوغ‌ترین روز: ${day} (${n} ورود)`,
    orderNone: "در این بازه ورودی‌ای برای مقایسه نیست.",
    exitsTitle: "پایان معامله نسبت به حد ضرر و حد سود",
    exitsNote: (tolerance: string) => `حد ضرر و حد سود از اولین پله‌ی ورود گرفته می‌شود. «در حد» یعنی با اختلاف حداکثر ${tolerance}.`,
    exits: {
      atTarget: "در حد سود",
      beforeTarget: "با سود، پیش از حد سود",
      atStop: "در حد ضرر",
      beyondStop: "زیانی بیشتر از ۱R",
      beforeStop: "با زیان، پیش از حد ضرر",
      breakeven: "سربه‌سر",
      noPlan: "بدون حد ضرر یا حد سود"
    },
    exitsAverages: (planned: string, reached: string) => `برنده‌هایی که پیش از حد سود بسته شدند: میانگین ${planned} در پلن، میانگین ${reached} گرفته‌شده.`,
    exitsNone: "در این بازه ورود بسته‌ای برای دسته‌بندی نیست."
  }
} as const;

type Strings = (typeof copy)[Locale];

function Block({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-3 rounded-md border border-border/70 bg-background/30 p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{note}</p>
      </div>
      {children}
    </section>
  );
}

function Zero({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">{children}</p>;
}

/** One line of figures: a name, then each figure with its label. */
function Figures({ name, figures }: { name: string; figures: { label: string; value: string }[] }) {
  return (
    <li className="min-w-0 space-y-0.5 text-sm">
      <span className="font-medium text-foreground">{name}</span>
      <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
        {figures.map((figure) => (
          <span key={figure.label}>
            {figure.label}: <span className="text-foreground">{figure.value}</span>
          </span>
        ))}
      </span>
    </li>
  );
}

function groupFigures(group: ResultGroup, c: Strings, locale: Locale, withWinRate: boolean) {
  return [
    { label: c.entries, value: formatCount(group.entries, locale) },
    ...(withWinRate ? [{ label: c.winRate, value: group.winRate === null ? DASH : formatPercent(group.winRate, locale) }] : []),
    { label: c.netPnl, value: formatSignedMoney(group.netPnl, locale) },
    { label: c.avgR, value: group.averageR === null ? DASH : formatR(group.averageR, locale) }
  ];
}

const EXIT_TONE = {
  atTarget: "bg-success/80",
  beforeTarget: "bg-success/50",
  atStop: "bg-destructive/80",
  beyondStop: "bg-destructive/80",
  beforeStop: "bg-destructive/50",
  breakeven: "bg-muted-foreground/50",
  noPlan: "bg-muted-foreground/30"
} as const;

/**
 * What the period's entries show about behaviour, in four blocks. It names what was measured and nothing more: no
 * label for the trader, no advice. Each block has its own zero state, so an empty period reads as "nothing here yet"
 * and not as a result.
 */
export function BehaviourPanel({ behaviour, summary, locale }: { behaviour: BehaviourReport; summary: PerformanceSummary; locale: Locale }) {
  const c = copy[locale];
  const { adherence } = summary;
  const reviewed = adherence.followed + adherence.mixed + adherence.broken;
  const minutes = formatCount(behaviour.reentry.windowMinutes, locale);
  const { reentry, orderInDay, exits } = behaviour;

  const exitRows = (Object.keys(c.exits) as (keyof typeof c.exits)[]).map((key) => ({ key, count: exits[key] }));
  const exitTotal = exitRows.reduce((total, row) => total + row.count, 0);
  const orderTotal = orderInDay.first.entries + orderInDay.second.entries + orderInDay.thirdPlus.entries;

  return (
    <SectionPanel title={c.title} description={c.description}>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Block title={c.adherenceTitle} note={c.adherenceNote}>
          {reviewed === 0 || adherence.rate === null ? (
            <Zero>{c.adherenceNone}</Zero>
          ) : (
            <>
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-2xl font-semibold tabular-nums text-foreground">{formatPercent(adherence.rate, locale)}</span>
                <span className="text-xs text-muted-foreground">{c.adherenceRate}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{c.adherenceCoverage(formatCount(reviewed, locale), formatCount(summary.entries.count, locale))}</span>
              </p>
              <ul className="space-y-3">
                {(["followed", "mixed", "broken"] as const).map((verdict) => (
                  <Figures key={verdict} name={c.verdicts[verdict]} figures={groupFigures(behaviour.adherence[verdict], c, locale, false)} />
                ))}
              </ul>
            </>
          )}
        </Block>

        <Block title={c.reentryTitle(minutes)} note={c.reentryNote}>
          {reentry.count === 0 ? (
            <Zero>{c.reentryNone(minutes)}</Zero>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-2xl font-semibold tabular-nums text-foreground">{c.reentryCount(formatCount(reentry.count, locale), reentry.count)}</p>
              <p className="text-muted-foreground">
                {c.reentryResult(
                  formatSignedMoney(reentry.result.netPnl, locale),
                  reentry.result.winRate === null ? DASH : formatPercent(reentry.result.winRate, locale),
                  reentry.result.averageR === null ? DASH : formatR(reentry.result.averageR, locale)
                )}
              </p>
              <p className="text-muted-foreground">{c.reentrySized(formatCount(reentry.sizedUp, locale), formatNumber(SIZE_UP_FACTOR, locale, { max: 1 }))}</p>
            </div>
          )}
        </Block>

        <Block title={c.orderTitle} note={c.orderNote}>
          {orderTotal === 0 ? (
            <Zero>{c.orderNone}</Zero>
          ) : (
            <>
              <ul className="space-y-3">
                {(["first", "second", "thirdPlus"] as const).map((slot) => (
                  <Figures key={slot} name={c.order[slot]} figures={groupFigures(orderInDay[slot], c, locale, true)} />
                ))}
              </ul>
              {orderInDay.busiestDay ? (
                <p className="text-xs text-muted-foreground">
                  {c.busiest(formatShortDay(orderInDay.busiestDay.day, locale), formatCount(orderInDay.busiestDay.entries, locale), orderInDay.busiestDay.entries)}
                </p>
              ) : null}
            </>
          )}
        </Block>

        <Block title={c.exitsTitle} note={c.exitsNote(formatR(R_TOLERANCE, locale, 1))}>
          {exitTotal === 0 ? (
            <Zero>{c.exitsNone}</Zero>
          ) : (
            <>
              <ul className="space-y-2">
                {exitRows.map((row) => (
                  <li key={row.key} className="min-w-0 space-y-1 text-sm">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 text-foreground">{c.exits[row.key]}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-foreground">{formatCount(row.count, locale)}</span>
                    </span>
                    <span dir="ltr" className="block h-1.5 rounded-full bg-muted/50" aria-hidden>
                      <span className={cn("block h-full rounded-full", EXIT_TONE[row.key])} style={{ width: `${(row.count / exitTotal) * 100}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
              {exits.averagePlannedR !== null && exits.averageReachedR !== null ? (
                <p className="text-xs text-muted-foreground">{c.exitsAverages(formatR(exits.averagePlannedR, locale), formatR(exits.averageReachedR, locale))}</p>
              ) : null}
            </>
          )}
        </Block>
      </div>
    </SectionPanel>
  );
}
